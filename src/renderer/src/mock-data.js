/**
 * Demo / empty-state seed data for the renderer.
 *
 * Used when window.mc is unavailable (running in static preview) or when
 * the real stores return zero records. Real data flows through
 * `window.mc.listTasks()` etc. via the hooks.
 */
// ── data ─────────────────────────────────────────────────────────────────
export const mockProjects = [
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
export const mockTasks = [
    {
        id: "DA-015F",
        summary: "Add task-linked diff and doc registry",
        lane: "Running",
        roleLabel: "running",
        rolePill: "info",
        stepLine: "Cycle 1",
        active: true,
    },
    {
        id: "DA-011F",
        summary: "Dashboard shell UI",
        lane: "Idle",
        roleLabel: "",
        rolePill: "",
        stepLine: "Cycle 1",
    },
    {
        id: "DA-012F",
        summary: "Task detail page",
        lane: "Running",
        roleLabel: "running",
        rolePill: "info",
        stepLine: "Cycle 1",
    },
    {
        id: "DA-010F",
        summary: "Azure DevOps adapter",
        lane: "Waiting",
        roleLabel: "awaiting review",
        rolePill: "warn",
        stepLine: "Cycle 1",
        sub: "Awaiting human review",
    },
    {
        id: "DA-005F",
        summary: "Task CRUD + key generation",
        lane: "Done",
        roleLabel: "merged",
        rolePill: "good",
        stepLine: "Merged and logged",
    },
];
export const mockRunActivity = [
    // Generic agent labels for the demo activity stream — real labels
    // come from whatever the workflow declared at runtime; these don't
    // imply a fixed roster.
    { label: "Agent A", detail: "Started 10:18 PM • Claude" },
    { label: "Subagent B", detail: "Spawned 10:19 PM • Local" },
    { label: "Subagent C", detail: "Spawned 10:20 PM • Local" },
];
export const mockQueue = [
    { taskId: "DA-011F", detail: "Build step waiting" },
    { taskId: "DA-010F", detail: "Review in progress" },
    { taskId: "DX-008F", detail: "Azure build callback pending" },
];
