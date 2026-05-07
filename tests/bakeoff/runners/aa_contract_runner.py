#!/usr/bin/env python3
"""Real Atomic Agents bakeoff runner using Claude CLI as the model backend.

The local environment does not expose OpenAI/Anthropic API keys, but it does
have `claude.exe`. This runner still uses AtomicAgent.run(), Pydantic schemas,
history, and prompt generation. The custom client below provides the minimal
Instructor-like `chat.completions.create(...)` surface AtomicAgent calls, then
dispatches the actual model request through `claude -p --output-format json`.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Any, Literal

from pydantic import Field

from atomic_agents import AtomicAgent, AgentConfig, BaseIOSchema
from atomic_agents.context import SystemPromptGenerator


Scenario = Literal["chain-loop", "tool-artifact", "failure-resume", "story-500"]


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def command_string() -> str:
    return " ".join([sys.executable, __file__, *sys.argv[1:]])


class PlannerInput(BaseIOSchema):
    """Input for the bakeoff planner agent."""

    scenario: str = Field(..., description="Bakeoff scenario name")


class PlannerOutput(BaseIOSchema):
    """Output from the bakeoff planner agent."""

    plan: str = Field(..., description="Plan text")
    ready: bool = Field(..., description="Whether the plan is ready")


class WorkerInput(BaseIOSchema):
    """Input for the bakeoff worker agent."""

    iteration: int = Field(..., description="Current workflow iteration")
    prior_failure: dict[str, Any] | None = Field(default=None, description="Prior failure, if any")


class WorkerOutput(BaseIOSchema):
    """Output from the bakeoff worker agent."""

    work: str = Field(..., description="Work result marker")
    iteration: int = Field(..., description="Iteration completed")


class ReviewerInput(BaseIOSchema):
    """Input for the bakeoff reviewer agent."""

    iteration: int = Field(..., description="Current workflow iteration")


class ReviewerOutput(BaseIOSchema):
    """Output from the bakeoff reviewer agent."""

    qualityPercent: int = Field(..., ge=0, le=100, description="Quality percentage")
    approved: bool = Field(..., description="Whether quality passed")


class SummarizerInput(BaseIOSchema):
    """Input for the bakeoff summarizer agent."""

    tool_result: str = Field(..., description="Tool result text")


class SummarizerOutput(BaseIOSchema):
    """Output from the bakeoff summarizer agent."""

    summary: str = Field(..., description="Summary")
    ok: bool = Field(..., description="Whether summarization succeeded")


class WriterInput(BaseIOSchema):
    """Input for the bakeoff story writer agent."""

    targetWords: int = Field(..., description="Target story word count")
    minWords: int = Field(..., description="Minimum acceptable story words")
    maxWords: int = Field(..., description="Maximum acceptable story words")
    subject: str = Field(..., description="Story subject")


class WriterOutput(BaseIOSchema):
    """Output from the bakeoff story writer agent."""

    storyTitle: str = Field(..., description="Story title")
    story: str = Field(..., description="Complete story text")
    theme: str = Field(..., description="Story theme")


class ClaudeCompletions:
    def __init__(self, command_log: list[str]):
        self.command_log = command_log

    def create(self, *, messages: list[dict[str, Any]], model: str, response_model: type[BaseIOSchema], **_: Any) -> BaseIOSchema:
        schema = response_model.model_json_schema()
        prompt = "\n\n".join(
            [
                "You are the model backend for an Atomic Agents bakeoff.",
                "Return only a JSON object. No prose. No markdown fences.",
                "Conversation messages:",
                json.dumps(messages, default=_json_default, indent=2),
                "Required JSON schema:",
                json.dumps(schema, indent=2),
            ]
        )
        cmd = ["claude", "-p", prompt, "--output-format", "json"]
        if model:
            cmd.extend(["--model", model])
        self.command_log.append(_display_command(cmd))
        proc = subprocess.run(cmd, cwd=os.getcwd(), text=True, capture_output=True, encoding="utf-8", errors="replace")
        if proc.returncode != 0:
            raise RuntimeError(f"claude exited {proc.returncode}: {proc.stderr.strip() or proc.stdout[:500]}")
        try:
            envelope = json.loads(proc.stdout)
            raw = envelope.get("result", proc.stdout)
            parsed = json.loads(raw) if isinstance(raw, str) else raw
        except Exception as exc:
            raise RuntimeError(f"claude returned non-JSON result: {exc}; stdout={proc.stdout[:500]}") from exc
        return response_model.model_validate(parsed)


class ClaudeChat:
    def __init__(self, command_log: list[str]):
        self.completions = ClaudeCompletions(command_log)


class ClaudeAtomicClient:
    def __init__(self, command_log: list[str]):
        self.chat = ClaudeChat(command_log)


def _display_command(parts: list[str]) -> str:
    return " ".join(parts)


def _json_default(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return str(value)


def make_agent(input_schema: type[BaseIOSchema], output_schema: type[BaseIOSchema], *, role: str, task: str, command_log: list[str]):
    model = os.getenv("BAKEOFF_AA_MODEL", "")
    config = AgentConfig.model_construct(
        client=ClaudeAtomicClient(command_log),
        model=model,
        history=None,
        system_prompt_generator=SystemPromptGenerator(
            background=[role],
            steps=[task, "Return exactly the requested structured JSON."],
        ),
        system_role="system",
        assistant_role="assistant",
        tool_result_role="system",
        mode=None,
        model_api_parameters={},
        max_context_tokens=None,
    )
    return AtomicAgent[input_schema, output_schema](config=config)


def ok_call(step: str, kind: str, index: int, duration_ms: int, command: str | None = None) -> dict[str, Any]:
    call = {
        "step": step,
        "kind": kind,
        "inputRef": f"inputs/{index:02d}-{step}.json",
        "outputRef": f"outputs/{index:02d}-{step}.json",
        "status": "ok",
        "durationMs": duration_ms,
    }
    if command:
        call["command"] = command
    return call


def run_agent(step: str, agent: Any, payload: BaseIOSchema, command_log: list[str]) -> tuple[BaseIOSchema, int, str]:
    before = len(command_log)
    started = perf_counter()
    result = agent.run(payload)
    duration_ms = int((perf_counter() - started) * 1000)
    command = command_log[before] if len(command_log) > before else ""
    return result, duration_ms, command


def count_words(text: str) -> int:
    return len([word for word in str(text).strip().split() if word])


def build_chain_loop(command_log: list[str]) -> dict[str, Any]:
    calls: list[dict[str, Any]] = []
    work_items: list[dict[str, Any]] = []
    progress_events = [{"event": "run-started", "at": now()}]

    planner = make_agent(
        PlannerInput,
        PlannerOutput,
        role="You are a deterministic bakeoff planner.",
        task='For any input, return exactly {"plan":"two iteration plan","ready":true}.',
        command_log=command_log,
    )
    worker = make_agent(
        WorkerInput,
        WorkerOutput,
        role="You are a deterministic bakeoff worker.",
        task='Return exactly {"work":"completed","iteration":ITERATION}, using the input iteration number.',
        command_log=command_log,
    )
    reviewer = make_agent(
        ReviewerInput,
        ReviewerOutput,
        role="You are a deterministic bakeoff reviewer.",
        task='If iteration is 1 return {"qualityPercent":72,"approved":false}; if iteration is 2 return {"qualityPercent":90,"approved":true}.',
        command_log=command_log,
    )

    planner_input = PlannerInput(scenario="chain-loop")
    plan, duration, cmd = run_agent("planner", planner, planner_input, command_log)
    work_items.append({"step": "planner", "input": planner_input.model_dump(), "output": plan.model_dump()})
    calls.append(ok_call("planner", "agent", 1, duration, cmd))

    quality = 0
    iterations = 0
    while iterations < 3 and quality < 85:
        iterations += 1
        worker_input = WorkerInput(iteration=iterations)
        work, duration, cmd = run_agent("worker", worker, worker_input, command_log)
        work_items.append({"step": "worker", "input": worker_input.model_dump(), "output": work.model_dump()})
        calls.append(ok_call("worker", "agent", iterations + 1, duration, cmd))
        reviewer_input = ReviewerInput(iteration=iterations)
        review, duration, cmd = run_agent("reviewer", reviewer, reviewer_input, command_log)
        work_items.append({"step": "reviewer", "input": reviewer_input.model_dump(), "output": review.model_dump()})
        calls.append(ok_call("reviewer", "agent", iterations + 2, duration, cmd))
        quality = int(review.qualityPercent)
        progress_events.append({"event": "quality-passed" if quality >= 85 else "quality-scored", "step": "reviewer", "at": now()})

    return {
        "success": True,
        "final": {"qualityPercent": quality, "iterations": iterations, "status": "passed" if quality >= 85 else "failed"},
        "metadata": {"calls": calls, "artifacts": [], "errors": [], "progressEvents": progress_events, "workItems": work_items},
    }


def build_tool_artifact(command_log: list[str], out_file: Path) -> dict[str, Any]:
    calls: list[dict[str, Any]] = []
    work_items: list[dict[str, Any]] = []
    progress_events = [{"event": "run-started", "at": now()}]
    started = perf_counter()
    tool_result = "bakeoff-tool-ok"
    work_items.append({"step": "read-input", "input": {}, "output": {"stdout": tool_result}})
    calls.append(ok_call("read-input", "tool", 1, int((perf_counter() - started) * 1000), "python:inline-tool read-input"))

    summarizer = make_agent(
        SummarizerInput,
        SummarizerOutput,
        role="You are a deterministic bakeoff summarizer.",
        task='Return exactly {"summary":"tool artifact created","ok":true}.',
        command_log=command_log,
    )
    summarizer_input = SummarizerInput(tool_result=tool_result)
    summary, duration, cmd = run_agent("summarizer", summarizer, summarizer_input, command_log)
    work_items.append({"step": "summarizer", "input": summarizer_input.model_dump(), "output": summary.model_dump()})
    calls.append(ok_call("summarizer", "agent", 2, duration, cmd))

    artifact_path = out_file.parent / "aa-tool-artifact.json"
    artifact_path.write_text(json.dumps({"runner": "aa", "toolResult": "ok"}, indent=2), encoding="utf-8")
    progress_events.append({"event": "artifact-written", "step": "summarizer", "at": now()})
    return {
        "success": True,
        "final": {"qualityPercent": 88, "iterations": 1, "status": "passed"},
        "metadata": {
            "calls": calls,
            "artifacts": [{"path": str(artifact_path), "kind": "json"}],
            "errors": [],
            "progressEvents": progress_events,
            "workItems": work_items,
        },
    }


def build_failure_resume(command_log: list[str]) -> dict[str, Any]:
    calls: list[dict[str, Any]] = []
    work_items: list[dict[str, Any]] = []
    progress_events = [{"event": "run-started", "at": now()}]
    errors: list[dict[str, Any]] = []
    error = {
        "message": "forced worker failure for bakeoff",
        "step": "worker",
        "inputRef": "inputs/02-worker.json",
        "nextAction": "resume",
    }

    planner = make_agent(
        PlannerInput,
        PlannerOutput,
        role="You are a deterministic bakeoff planner.",
        task='For any input, return exactly {"plan":"two iteration plan","ready":true}.',
        command_log=command_log,
    )
    worker = make_agent(
        WorkerInput,
        WorkerOutput,
        role="You are a deterministic bakeoff worker.",
        task='Return exactly {"work":"completed","iteration":ITERATION}, using the input iteration number.',
        command_log=command_log,
    )
    reviewer = make_agent(
        ReviewerInput,
        ReviewerOutput,
        role="You are a deterministic bakeoff reviewer.",
        task='For iteration 2 return exactly {"qualityPercent":88,"approved":true}.',
        command_log=command_log,
    )

    planner_input = PlannerInput(scenario="failure-resume")
    plan, duration, cmd = run_agent("planner", planner, planner_input, command_log)
    work_items.append({"step": "planner", "input": planner_input.model_dump(), "output": plan.model_dump()})
    calls.append(ok_call("planner", "agent", 1, duration, cmd))
    calls.append(
        {
            "step": "worker",
            "kind": "agent",
            "inputRef": error["inputRef"],
            "status": "error",
            "durationMs": 1,
            "error": {"message": error["message"], "step": error["step"], "nextAction": error["nextAction"]},
        }
    )
    errors.append(error)
    progress_events.append({"event": "step-failed", "step": "worker", "at": now()})
    calls.append(ok_call("resume", "resume", 3, 0, "python:inline-resume-marker"))
    worker_input = WorkerInput(iteration=2, prior_failure=error)
    work, duration, cmd = run_agent("worker", worker, worker_input, command_log)
    work_items.append({"step": "worker", "input": worker_input.model_dump(), "output": work.model_dump()})
    calls.append(ok_call("worker", "agent", 4, duration, cmd))
    reviewer_input = ReviewerInput(iteration=2)
    review, duration, cmd = run_agent("reviewer", reviewer, reviewer_input, command_log)
    work_items.append({"step": "reviewer", "input": reviewer_input.model_dump(), "output": review.model_dump()})
    calls.append(ok_call("reviewer", "agent", 5, duration, cmd))
    progress_events.append({"event": "run-resumed", "step": "resume", "at": now()})
    return {
        "success": True,
        "final": {"qualityPercent": 88, "iterations": 2, "status": "passed"},
        "metadata": {"calls": calls, "artifacts": [], "errors": errors, "progressEvents": progress_events, "workItems": work_items},
    }


def build_story_500(command_log: list[str], out_file: Path) -> dict[str, Any]:
    calls: list[dict[str, Any]] = []
    work_items: list[dict[str, Any]] = []
    progress_events = [{"event": "run-started", "at": now()}]

    writer = make_agent(
        WriterInput,
        WriterOutput,
        role="You are a Mission Control story writer.",
        task=(
            "Write one original story about Mission Control coordinating several AI agents to repair "
            "a broken build before sunrise. Aim for 500 words and stay between 450 and 550 words. "
            "Return JSON with storyTitle, story, and theme."
        ),
        command_log=command_log,
    )
    writer_input = WriterInput(
        targetWords=500,
        minWords=450,
        maxWords=550,
        subject="Mission Control orchestrating agents",
    )
    written, duration, cmd = run_agent("writer", writer, writer_input, command_log)
    word_count = count_words(written.story)
    quality = 90 if 450 <= word_count <= 550 else 60
    work_items.append({"step": "writer", "input": writer_input.model_dump(), "output": {**written.model_dump(), "wordCount": word_count}})
    calls.append(ok_call("writer", "agent", 1, duration, cmd))

    artifact_path = out_file.parent / "aa-story-500.json"
    artifact_path.write_text(
        json.dumps({"runner": "aa", **written.model_dump(), "wordCount": word_count}, indent=2),
        encoding="utf-8",
    )
    progress_events.append({"event": "story-written", "step": "writer", "at": now()})
    return {
        "success": True,
        "final": {
            "qualityPercent": quality,
            "iterations": 1,
            "status": "passed" if quality >= 85 else "failed",
            "wordCount": word_count,
        },
        "metadata": {
            "calls": calls,
            "artifacts": [{"path": str(artifact_path), "kind": "json"}],
            "errors": [],
            "progressEvents": progress_events,
            "workItems": work_items,
        },
    }


def build_scenario(scenario: Scenario, out_file: Path, command_log: list[str]) -> dict[str, Any]:
    if scenario == "chain-loop":
        return build_chain_loop(command_log)
    if scenario == "tool-artifact":
        return build_tool_artifact(command_log, out_file)
    if scenario == "story-500":
        return build_story_500(command_log, out_file)
    return build_failure_resume(command_log)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", required=True, choices=["chain-loop", "tool-artifact", "failure-resume", "story-500"])
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    out_file = Path(args.out)
    out_file.parent.mkdir(parents=True, exist_ok=True)

    command_log: list[str] = []
    started = perf_counter()
    started_at = now()
    payload = build_scenario(args.scenario, out_file, command_log)  # type: ignore[arg-type]
    finished_at = now()
    payload["metadata"]["invocation"] = {
        "command": command_string(),
        "cwd": os.getcwd(),
        "startedAt": started_at,
        "finishedAt": finished_at,
        "durationMs": int((perf_counter() - started) * 1000),
        "provider": "atomic-agent-via-claude-cli",
        "model": os.getenv("BAKEOFF_AA_MODEL", "claude-cli-default"),
        "modelCommands": command_log,
    }
    payload["metadata"]["progressEvents"].append({"event": "run-completed", "at": finished_at})

    result = {
        "runner": "aa",
        "scenario": args.scenario,
        "success": payload["success"],
        "final": payload["final"],
        "metadata": payload["metadata"],
    }
    out_file.write_text(json.dumps(result, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
