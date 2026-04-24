/**
 * Hardcoded mock data — mirrors mission_control_saved_mock_v2.html exactly.
 *
 * This is the wireframe's data source. Once IPC + TaskStore are wired up,
 * the renderer will swap this out for window.mc.listTasks() etc.
 *
 * IMPORTANT: Some fields here DON'T exist in src/shared/models.ts yet
 * (taskType, subagents, linkedFiles, model, blockedFor, projectStats).
 * That gap is intentional — it's the "forgotten features" checklist.
 */

// ── types only used by the wireframe (not yet in shared/models.ts) ──────

export type MockTaskType = "F" | "B" | "R" | "S"; // Feature / Bug / Refactor / Spike
export type MockWorkflow = "Dev" | "Brainstorm" | "Fix";
export type MockLane =
  | "Plan"
  | "Develop"
  | "Review"
  | "Surgery"
  | "Approval"
  | "Done";
export type MockRoleLabel =
  | "Planner"
  | "Developer"
  | "Reviewer"
  | "Surgeon"
  | "Waiting"
  | "Done";
export type MockPill = "good" | "warn" | "bad" | "info";

export interface MockProject {
  id: string;
  name: string;
  prefix: string;       // task-id prefix, e.g. "DA"
  source: string;       // "GitHub repo linked" etc.
  stats: string;        // "12 active • 3 waiting • 2 archived"
  active?: boolean;
}

export interface MockAgent {
  role: "Planner" | "Developer" | "Reviewer" | "Surgeon";
  primary: string;
  fallback: string;
}

export interface MockTask {
  id: string;                 // "DA-015F"
  summary: string;            // "Add task-linked diff and doc registry"
  lane: MockLane;
  roleLabel: MockRoleLabel;
  rolePill: MockPill;
  stepLine: string;           // "Breaking work into substeps"
  sub?: string;               // "Subagents: RepoMapper, DocRefresher" or "Model: Codex"
  active?: boolean;
}

export interface MockRunEvent {
  label: string;              // "Planner" / "RepoMapper"
  detail: string;             // "Started 10:18 PM • Claude"
}

export interface MockQueueItem {
  taskId: string;
  detail: string;
}

export interface MockKpi {
  label: string;
  value: number;
}

export interface MockLinkedFile {
  name: string;
  note: string;
}

export interface MockSelectedTask {
  id: string;
  taskType: "Feature" | "Bug" | "Refactor" | "Spike";
  workflow: MockWorkflow;
  project: string;
  pills: Array<{ label: string; tone: MockPill }>;
  currentStep: string;
  subagents: string[];
  nextStep: string;
  lastEvent: string;
  linkedFiles: MockLinkedFile[];
}

// ── actual data ──────────────────────────────────────────────────────────

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

export const mockAgents: MockAgent[] = [
  { role: "Planner",   primary: "Claude", fallback: "Local" },
  { role: "Developer", primary: "Codex",  fallback: "Claude" },
  { role: "Reviewer",  primary: "Claude", fallback: "Codex" },
  { role: "Surgeon",   primary: "Local",  fallback: "Claude" },
];

export const mockKpis: MockKpi[] = [
  { label: "Active Tasks",      value: 12 },
  { label: "Waiting Approval",  value: 3 },
  { label: "Running Agents",    value: 5 },
  { label: "Failed Runs Today", value: 1 },
];

/** One card per lane per the mockup. Keyed by lane for easy grouping. */
export const mockTasks: MockTask[] = [
  {
    id: "DA-015F",
    summary: "Add task-linked diff and doc registry",
    lane: "Plan",
    roleLabel: "Planner",
    rolePill: "info",
    stepLine: "Breaking work into substeps",
    sub: "Subagents: RepoMapper, DocRefresher",
    active: true,
  },
  {
    id: "DA-011F",
    summary: "Dashboard shell UI",
    lane: "Develop",
    roleLabel: "Developer",
    rolePill: "warn",
    stepLine: "Editing task list layout",
    sub: "Model: Codex",
  },
  {
    id: "DA-012F",
    summary: "Task detail page",
    lane: "Develop",
    roleLabel: "Developer",
    rolePill: "warn",
    stepLine: "Hooking files tab",
    sub: "Model: Codex",
  },
  {
    id: "DA-010F",
    summary: "Azure DevOps adapter",
    lane: "Review",
    roleLabel: "Reviewer",
    rolePill: "info",
    stepLine: "Checking callback contract",
    sub: "Model: Claude",
  },
  {
    id: "DA-014F",
    summary: "File and doc registry",
    lane: "Surgery",
    roleLabel: "Surgeon",
    rolePill: "good",
    stepLine: "Writing artifact links",
    sub: "Model: Local LLM",
  },
  {
    id: "DA-016F",
    summary: "Review gate flow",
    lane: "Approval",
    roleLabel: "Waiting",
    rolePill: "warn",
    stepLine: "Human approval needed",
    sub: "Blocked 18m",
  },
  {
    id: "DA-005F",
    summary: "Task CRUD + key generation",
    lane: "Done",
    roleLabel: "Done",
    rolePill: "good",
    stepLine: "Merged and logged",
    sub: "Diff report saved",
  },
];

export const mockSelected: MockSelectedTask = {
  id: "DA-015F",
  taskType: "Feature",
  workflow: "Dev",
  project: "DogApp",
  pills: [
    { label: "Planner", tone: "info" },
    { label: "Active",  tone: "warn" },
    { label: "Claude",  tone: "info" },
  ],
  currentStep:
    "Break task into implementation units and confirm artifact rules",
  subagents: ["RepoMapper", "DocRefresher"],
  nextStep: "Builder",
  lastEvent: "Prompt completed • waiting for transition",
  linkedFiles: [
    { name: "DA-015F__spec.md",         note: "Current working feature spec" },
    { name: "DA-015F__decision-log.md", note: "Decision history and constraint notes" },
    { name: "DA-015F__diff-report.md",  note: "Generated after repo compare" },
    { name: "api/tasks/files.http",     note: "Task file endpoint contract" },
    { name: "ui/task-detail.tsx",       note: "Task detail page work" },
  ],
};

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

export const MOCK_LANES: readonly MockLane[] = [
  "Plan",
  "Develop",
  "Review",
  "Surgery",
  "Approval",
  "Done",
] as const;
