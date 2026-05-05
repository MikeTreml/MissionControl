import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
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
export function CommandBar() {
    const { projects } = useProjects();
    const [draft, setDraft] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [preloadTitle, setPreloadTitle] = useState("");
    if (projects.length === 0)
        return null;
    function send() {
        const trimmed = draft.trim();
        if (!trimmed)
            return;
        setPreloadTitle(trimmed);
        setCreateOpen(true);
        setDraft("");
    }
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: "quick-actions", role: "group", "aria-label": "Quick task input", children: _jsxs("div", { className: "qa-cmd", children: [_jsx("span", { className: "glyph", children: "+" }), _jsx("input", { type: "text", placeholder: "Tell an agent what to do\u2026", value: draft, onChange: (e) => setDraft(e.target.value), onKeyDown: (e) => { if (e.key === "Enter")
                                send(); } }), _jsx("button", { className: "send", title: "Open Create Task with this title (Enter)", onClick: () => send(), disabled: draft.trim().length === 0, children: "\u21B5" })] }) }), _jsx(CreateTaskForm, { open: createOpen, onClose: () => setCreateOpen(false), preload: { title: preloadTitle } })] }));
}
