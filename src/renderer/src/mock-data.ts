/**
 * Demo / empty-state seed data for the renderer.
 *
 * Used when window.mc is unavailable (running in static preview) or when
 * the real stores return zero records. Real data flows through
 * `window.mc.listTasks()` etc. via the hooks.
 */

// ── types ───────────────────────────────────────────────────────────────

/** Run-state-derived label shown on board cards + lists. */
export type MockLane =
  | "Idle"
  | "Running"
  | "Waiting"
  | "Done"
  | "Failed";
export type MockRoleLabel = MockLane;
export type MockPill = "good" | "warn" | "bad" | "info";

export interface MockProject {
  id: string;
  name: string;
  prefix: string;       // task-id prefix, e.g. "DA"
  source: string;       // "GitHub repo linked" etc.
  stats: string;        // "12 active • 3 waiting • 2 archived"
  active?: boolean;
}

export interface MockTask {
  id: string;                 // "DA-015F"
  summary: string;            // "Add task-linked diff and doc registry"
  lane: MockLane;
  roleLabel: MockRoleLabel;
  rolePill: MockPill;
  stepLine: string;
  sub?: string;
  active?: boolean;
}

export interface MockRunEvent {
  label: string;
  detail: string;
}

export interface MockQueueItem {
  taskId: string;
  detail: string;
}

// ── data ─────────────────────────────────────────────────────────────────

export const mockProjects: MockProject[] = [
  {
    id: "dogapp",
    name: "DogApp",
    prefix: "DA",
    source: "GitHub repo linked",
    stats: "12 active • 3 waiting • 2 archived",
    active: true,
  },
  {
    id: "d365-costing",
    name: "D365 Costing",
    prefix: "DX",
    source: "Azure DevOps linked",
    stats: "7 active • build lane enabled",
  },
  {
    id: "wishlist-tools",
    name: "Wishlist Tools",
    prefix: "WL",
    source: "GitHub repo linked",
    stats: "4 active • brainstorm heavy",
  },
];

export const mockTasks: MockTask[] = [
  {
    id: "DA-015F",
    summary: "Add task-linked diff and doc registry",
    lane: "Running",
    roleLabel: "Running",
    rolePill: "warn",
    stepLine: "Cycle 1",
    active: true,
  },
  {
    id: "DA-011F",
    summary: "Dashboard shell UI",
    lane: "Idle",
    roleLabel: "Idle",
    rolePill: "info",
    stepLine: "Cycle 1",
  },
  {
    id: "DA-012F",
    summary: "Task detail page",
    lane: "Running",
    roleLabel: "Running",
    rolePill: "warn",
    stepLine: "Cycle 1",
  },
  {
    id: "DA-010F",
    summary: "Azure DevOps adapter",
    lane: "Waiting",
    roleLabel: "Waiting",
    rolePill: "warn",
    stepLine: "Cycle 1",
    sub: "Awaiting human review",
  },
  {
    id: "DA-005F",
    summary: "Task CRUD + key generation",
    lane: "Done",
    roleLabel: "Done",
    rolePill: "good",
    stepLine: "Merged and logged",
  },
];

export const mockRunActivity: MockRunEvent[] = [
  { label: "Planner",      detail: "Started 10:18 PM • Claude" },
  { label: "RepoMapper",   detail: "Spawned 10:19 PM • Local" },
  { label: "DocRefresher", detail: "Spawned 10:20 PM • Local" },
];

export const mockQueue: MockQueueItem[] = [
  { taskId: "DA-011F", detail: "Build step waiting" },
  { taskId: "DA-010F", detail: "Review in progress" },
  { taskId: "DX-008F", detail: "Azure build callback pending" },
];
