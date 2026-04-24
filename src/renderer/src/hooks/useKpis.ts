/**
 * useKpis — derived from useTasks(). Counts tasks by status/lane and
 * formats the four dashboard header numbers.
 */
import { useTasks } from "./useTasks";

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

  // Mock KPIs are canned in mockKpis, but if we're on real data, derive.
  // For demo: counts happen to match the mock board (12/3/5/1) if we
  // extend the numbers beyond what's shown.
  const active = tasks.filter((t) => t.lane !== "Done" && t.roleLabel !== "Waiting").length;
  const waiting = tasks.filter((t) => t.lane === "Approval").length;
  const running = tasks.filter((t) => t.active).length;
  const failed = 0; // will come from events.jsonl (run-ended type=failed) later

  // When demo-fallback kicks in, use the canned numbers from the mockup —
  // the demo set is too small to produce the familiar 12/3/5/1 counts.
  if (isDemo) {
    return {
      loading,
      isDemo,
      kpis: [
        { label: "Active Tasks",      value: 12 },
        { label: "Waiting Approval",  value: 3 },
        { label: "Running Agents",    value: 5 },
        { label: "Failed Runs Today", value: 1 },
      ],
    };
  }

  return {
    loading,
    isDemo,
    kpis: [
      { label: "Active Tasks",      value: active },
      { label: "Waiting Approval",  value: waiting },
      { label: "Running Agents",    value: running },
      { label: "Failed Runs Today", value: failed },
    ],
  };
}
