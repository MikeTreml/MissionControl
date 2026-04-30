/**
 * useKpis — dashboard header numbers, derived from useTasks() + the
 * per-task event journals. Demo mode returns the wireframe's canned
 * numbers when no real tasks exist.
 *
 * "Failed Runs Today" = count of `run-ended` events with reason=failed
 * whose timestamp lands inside today's local-day window.
 */
import { useTasks } from "./useTasks";
import { useAllTaskEvents } from "./useAllTaskEvents";

export interface KpiItem {
  label: string;
  value: number;
}

export interface KpisState {
  kpis: KpiItem[];
  loading: boolean;
  isDemo: boolean;
}

export function useKpis(): KpisState {
  const { tasks, loading, isDemo } = useTasks();
  const { perTask } = useAllTaskEvents();

  // For demo: counts happen to match the mock board (12/3/5/1) if we
  // extend the numbers beyond what's shown.
  const active = tasks.filter((t) => t.lane !== "Done" && t.lane !== "Failed" && t.roleLabel !== "Waiting").length;
  const waiting = tasks.filter((t) => t.lane === "Waiting").length;
  const running = tasks.filter((t) => t.active).length;

  // Failed runs today: walk every task's events, count run-ended with
  // reason=failed since midnight local time.
  const todayStart = startOfToday();
  let failed = 0;
  for (const events of perTask.values()) {
    for (const e of events) {
      if (e.type !== "run-ended") continue;
      const rec = e as unknown as Record<string, unknown>;
      if (rec.reason !== "failed") continue;
      if (new Date(e.timestamp).getTime() >= todayStart) failed += 1;
    }
  }

  // When demo mode kicks in, use the canned numbers from the mockup —
  // the demo set is too small to produce the familiar 12/3/5/1 counts.
  if (isDemo) {
    return {
      loading,
      isDemo,
      kpis: [
        { label: "Active",    value: 12 },
        { label: "Attention", value: 3 },
        { label: "Running",   value: 5 },
        { label: "Failed",    value: 1 },
      ],
    };
  }

  return {
    loading,
    isDemo,
    kpis: [
      { label: "Active",    value: active },
      { label: "Attention", value: waiting },
      { label: "Running",   value: running },
      { label: "Failed",    value: failed },
    ],
  };
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
