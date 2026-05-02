/**
 * Hand-offs — every task currently waiting on a human (review,
 * blocker, paused). One stop for "what wants me?". The point: scroll
 * the queue without click-through to each Task Detail.
 *
 * Sources today:
 *   - boardStage === "Review"  — task paused with blocker matching review/approval
 *   - boardStage === "Blocked" — task paused/waiting with any other blocker
 *
 * Future: pull from journal `BREAKPOINT_OPENED` once plannotator wires
 * up an invocation surface. The page shape stays the same.
 */
import { useMemo } from "react";

import { useTasks } from "../hooks/useTasks";
import { useProjects } from "../hooks/useProjects";
import { useRoute } from "../router";
import { colorForKey } from "../lib/color-hash";

export function Handoffs(): JSX.Element {
  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { setView, openTask } = useRoute();

  const projectName = useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  const review = tasks.filter((t) => t.boardStage === "Review");
  const blocked = tasks.filter((t) => t.boardStage === "Blocked");

  return (
    <>
      <div className="topbar">
        <div className="crumbs">
          <span>Workspace</span>
          <span className="sep">/</span>
          <span className="now">Hand-offs</span>
          <span className="sep">·</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {review.length} awaiting review · {blocked.length} blocked
          </span>
        </div>
        <div className="actions">
          <button className="button ghost" onClick={() => setView("dashboard")}>
            ← Dashboard
          </button>
        </div>
      </div>

      <div className="content">
        <Section
          title="Awaiting review"
          tone="warn"
          empty="Nothing waiting on your review."
          tasks={review}
          projectName={projectName}
          onOpen={openTask}
        />
        <Section
          title="Blocked"
          tone="bad"
          empty="No blocked tasks."
          tasks={blocked}
          projectName={projectName}
          onOpen={openTask}
        />
      </div>
    </>
  );
}

function Section({
  title,
  tone,
  empty,
  tasks,
  projectName,
  onOpen,
}: {
  title: string;
  tone: "warn" | "bad";
  empty: string;
  tasks: ReturnType<typeof useTasks>["tasks"];
  projectName: Map<string, string>;
  onOpen: (taskId: string) => void;
}): JSX.Element {
  return (
    <section className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span>{title}</span>
        <span className={`pill ${tone}`} style={{ fontSize: 11 }}>{tasks.length}</span>
      </h3>
      {tasks.length === 0 ? (
        <div className="muted" style={{ padding: "8px 0", fontSize: 13 }}>{empty}</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {tasks.map((t) => {
            const pfx = t.id.split("-")[0] ?? "";
            const accent = pfx ? colorForKey(pfx) : "transparent";
            return (
              <button
                key={t.id}
                className="task"
                data-proj
                style={{ ["--task-accent" as string]: accent, textAlign: "left", cursor: "pointer" }}
                onClick={() => onOpen(t.id)}
              >
                <div className="head">
                  <span className="tid">
                    <span className="pfx">{pfx}</span>
                    {t.id.slice(pfx.length)}
                  </span>
                  {t.rolePill && (
                    <span className={`pill ${t.rolePill}`} style={{ marginLeft: "auto" }}>
                      {t.roleLabel}
                    </span>
                  )}
                </div>
                <div className="summary">{t.summary}</div>
                <div className="row">
                  <span className="muted">{projectName.get(t.projectId) ?? t.projectId}</span>
                  <span className="spacer" />
                  <span className="muted">{t.stepLine}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
