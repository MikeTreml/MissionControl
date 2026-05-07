# Orchestration Bakeoff TDD

This bakeoff compares Mission Control orchestration candidates by observable
contract, not by claims in either codebase.

## Exact Calls

The contract smoke invokes each candidate runner with these command shapes:

```powershell
node --experimental-strip-types tests\bakeoff\runners\bs-contract-runner.ts --scenario <scenario> --out <result.json>
C:\Users\Treml\source\repos\atomic-agents\.venv\Scripts\python.exe tests\bakeoff\runners\aa_contract_runner.py --scenario <scenario> --out <result.json>
```

The BS runner then invokes the real Mission Control BS driver:

```powershell
node --experimental-strip-types scripts\drive-task.ts --workflow <workflow.js> --inputs <inputs.json> --runs-dir <runs-dir> --process-id bakeoff/<scenario> --run-id <run-id> --max-iterations 20 --json
```

`scripts\drive-task.ts` performs the real BS loop:

1. `babysitter run:create`
2. repeated `babysitter run:iterate`
3. `claude -p ... --output-format json` for `kind: "agent"` effects
4. `babysitter task:post`

The runner must write the exact real invocation string it observed to:

```json
metadata.invocation.command
```

For BS, the contract runner command is also recorded at:

```json
metadata.invocation.contractRunnerCommand
```

For AA, the runner uses real `AtomicAgent.run()` calls and a custom client that
dispatches model work through the local Claude CLI:

```powershell
claude -p <prompt> --output-format json
```

Those exact per-agent model command strings are recorded at:

```json
metadata.invocation.modelCommands
```

## Scenarios

1. `chain-loop`
   - planner -> worker -> reviewer
   - reviewer emits `qualityPercent`
   - loop stops when quality is at least 85 or iteration cap is reached

2. `tool-artifact`
   - tool output feeds an agent
   - agent writes an artifact
   - result records the artifact path and kind

3. `failure-resume`
   - worker fails once with a forced error
   - result captures step, message, input reference, and next action
   - runner records a resume marker and finishes successfully

4. `story-500`
   - writer agent produces an approximately 500-word story
   - runner records the full story output in `metadata.workItems[]`
   - runner writes a story artifact JSON and records word count

## Metadata Tracked

Each result JSON records:

- `runner`: `bs` or `aa`
- `scenario`: scenario name
- `success`: boolean contract result
- `final.qualityPercent`
- `final.iterations`
- `final.status`
- `metadata.invocation.command`: exact command string used by the runner
- `metadata.invocation.cwd`
- `metadata.invocation.startedAt`
- `metadata.invocation.finishedAt`
- `metadata.invocation.durationMs`
- `metadata.invocation.runId` when the runtime exposes one
- `metadata.invocation.runDir` when the runtime exposes one
- `metadata.invocation.modelCommands` for AA per-agent model calls
- `metadata.calls[]`: step-level call records
- `metadata.calls[].step`
- `metadata.calls[].kind`: `agent`, `tool`, `breakpoint`, or `resume`
- `metadata.calls[].inputRef`
- `metadata.calls[].outputRef`
- `metadata.calls[].status`
- `metadata.calls[].durationMs`
- `metadata.calls[].error`
- `metadata.workItems[]`: step input/output evidence
- `metadata.artifacts[]`
- `metadata.errors[]`: normalized failure clarity fields
- `metadata.progressEvents[]`: UI-consumable progress events

## Current Stage

The BS side now uses a real Babysitter run and real agent dispatch through
`claude -p`.

The AA side now uses the local Atomic Agents Python package, real
`AtomicAgent.run()` calls, and real model dispatch through `claude -p`. It does
not require or consume an OpenAI API key for this bakeoff.

One caveat remains: `failure-resume` currently records a normalized
failure/resume marker on both runners. The next stricter version should force a
real failed runtime effect, inspect the actual surfaced error, then prove the
chosen retry/resume path.
