/**
 * Floating "Tell an agent what to do…" pill at the bottom of the shell.
 *
 * On Enter / send-click, opens the existing CreateTaskForm modal with
 * the typed text pre-filled as the task title. The user lands on a
 * normal task-creation flow with project / kind / workflow still
 * pickable, so the pill is a quick-input gesture rather than a
 * one-shot create. Avoids duplicating CreateTaskForm's invariants
 * (project required, prefix valid, etc).
 *
 * Earlier draft also rendered a working-day timeline scrubber. Removed
 * — it was decorative without a real metric behind it, and the pill
 * reads cleaner without competing affordances.
 *
 * Hidden when no project exists (CreateTaskForm requires one).
 */
import { useState } from "react";

import { useProjects } from "../hooks/useProjects";
import { CreateTaskForm } from "./CreateTaskForm";

export function CommandBar(): JSX.Element | null {
  const { projects } = useProjects();
  const [draft, setDraft] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [preloadTitle, setPreloadTitle] = useState("");

  if (projects.length === 0) return null;

  function send(): void {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setPreloadTitle(trimmed);
    setCreateOpen(true);
    setDraft("");
  }

  return (
    <>
      <div className="quick-actions" role="group" aria-label="Quick task input">
        <div className="qa-cmd">
          <span className="glyph">+</span>
          <input
            type="text"
            placeholder="Tell an agent what to do…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          />
          <button
            className="send"
            title="Open Create Task with this title (Enter)"
            onClick={() => send()}
            disabled={draft.trim().length === 0}
          >
            ↵
          </button>
        </div>
      </div>

      <CreateTaskForm
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        preload={{ title: preloadTitle }}
      />
    </>
  );
}
