/**
 * Live Workflow Board — 6 lanes: Plan / Develop / Review / Surgery / Approval / Done.
 *
 * Data comes from useTasks() which maps real Task → UiTask with lane display
 * labels + role colors. Demo fallback when empty.
 */
import { MOCK_LANES, type MockLane } from "../mock-data";
import { useTasks, type UiTask } from "../hooks/useTasks";
import { useProjects } from "../hooks/useProjects";
import { useAgents } from "../hooks/useAgents";
import { TaskCard } from "./TaskCard";

/** Group tasks into a dict keyed by lane for render. */
function groupByLane(tasks: UiTask[]): Record<MockLane, UiTask[]> {
  const out: Record<MockLane, UiTask[]> = {
    Plan: [], Develop: [], Review: [], Surgery: [], Approval: [], Done: [],
  };
  for (const t of tasks) out[t.lane].push(t);
  return out;
}

export function Board(): JSX.Element {
  const { tasks, isDemo } = useTasks();
  const { projects } = useProjects();
  const { agents } = useAgents();
  const byLane = groupByLane(tasks);

  const primaries = agents.filter((a) => a.code.length === 1);
  // Render the flow caption from actual agent names (hardcoded lane labels
  // "Approval / Done" remain for now — they're board states, not agents).
  const flowCaption =
    primaries.length > 0
      ? [...primaries.map((a) => a.name), "Approval", "Done"].join(" → ")
      : "No agents loaded";
  const activeProject = projects[0];

  return (
    <section className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div>
          <h2>Live Workflow Board</h2>
          <p className="muted" style={{ marginTop: 4 }}>{flowCaption}</p>
        </div>
        <div>
          {activeProject && (
            <span className="pill info">Project: {activeProject.name}</span>
          )}
          {isDemo && <span className="pill warn">Demo</span>}
        </div>
      </div>

      <div className="lane-wrap">
        {MOCK_LANES.map((lane) => (
          <div key={lane} className="lane">
            <h3>{lane}</h3>
            {byLane[lane].length === 0 && (
              <div className="muted" style={{ fontSize: 12, padding: "6px 2px" }}>
                —
              </div>
            )}
            {byLane[lane].map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
