/**
 * Floating quick-actions pill at the bottom of the shell. Markup
 * matches the v2 design canvas — timeline scrubber on the left,
 * "Tell an agent what to do…" command input on the right.
 *
 * Today: placeholder semantics. The scrubber tracks the user's local
 * clock progress through the working day (~9-18h, clamped). The
 * command input pushes a toast on Enter and clears — no agent wiring
 * yet. Spec for "what does the command do?" is open: it could route
 * to /babysit, send a steer to a running task, or open a "+ New task"
 * pre-filled. Deferred until the operator decides.
 *
 * Hidden when no project exists (no useful place to send a command).
 */
import { useEffect, useState } from "react";

import { useProjects } from "../hooks/useProjects";
import { pushToast } from "../hooks/useToasts";

export function CommandBar(): JSX.Element | null {
  const { projects } = useProjects();
  const [now, setNow] = useState<number>(Date.now());
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (projects.length === 0) return null;

  // Working-day scrubber: 09:00 → 18:00 → 100% fill. Outside the
  // window the scrubber pins at 0% / 100%. Decorative until a
  // real timeline metric is plumbed.
  const date = new Date(now);
  const startMin = 9 * 60;
  const endMin = 18 * 60;
  const minute = date.getHours() * 60 + date.getMinutes();
  const progress = Math.min(1, Math.max(0, (minute - startMin) / (endMin - startMin)));
  const pct = `${Math.round(progress * 100)}%`;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");

  function send(): void {
    const trimmed = draft.trim();
    if (!trimmed) return;
    pushToast({
      tone: "info",
      title: "Command queued",
      detail: `"${trimmed}" — agent routing not wired yet (placeholder).`,
    });
    setDraft("");
  }

  return (
    <div className="quick-actions" role="group" aria-label="Quick actions">
      <div className="qa-scrubber">
        <span className="label">Timeline</span>
        <div className="track">
          <div className="fill" style={{ width: pct }} />
          <div className="ticks">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="tick" />
            ))}
          </div>
          <div className="head" style={{ left: pct }} />
        </div>
        <span className="now">{hh}:{mm}</span>
      </div>
      <div className="qa-cmd">
        <span className="glyph">⌕</span>
        <input
          type="text"
          placeholder="Tell an agent what to do…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        />
        <span className="kbd">⌘K</span>
        <button
          className="send"
          title="Send (placeholder)"
          onClick={() => send()}
          disabled={draft.trim().length === 0}
        >
          ↵
        </button>
      </div>
    </div>
  );
}
