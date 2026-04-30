/**
 * Single source of truth for the task's PROMPT.md content.
 *
 * Used by TaskStore at scaffold time (with agentSlug=null) so the file
 * exists immediately after createTask, and by RunManager.start to
 * regenerate it whenever the user clicks Start (so edits to title/
 * description propagate without a manual re-create).
 *
 * Kept tiny and pure — no I/O, no state. Both call sites get exactly
 * the same shape; if we tune the structure later, both update at once.
 */
import type { Task } from "../shared/models.ts";

export function renderPromptFile(task: Task, agentSlug: string | null): string {
  const lines = [
    `# ${task.id} — ${task.title}`,
    "",
    task.description || "_(no description)_",
    "",
    "## Context",
    "",
    `- Project: **${task.project}**`,
    `- Cycle: **${task.cycle}**`,
    ...(agentSlug ? [`- Starting agent: **${agentSlug}**`] : []),
    "",
    "## Done criteria",
    "",
    "_(fill in as the Planner refines scope)_",
    "",
  ];
  return lines.join("\n");
}
