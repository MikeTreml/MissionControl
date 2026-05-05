import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useEffect } from "react";
import { useLibraryIndex } from "../../hooks/useLibraryIndex";
import { useRoute } from "../../router";
import { FilterBar } from "./FilterBar";
import { Tree } from "./Tree";
import { DetailPanel } from "./DetailPanel";
import { SelectionBag } from "./SelectionBag";
import { RunWorkflowModal } from "./RunWorkflowModal";
import { LibraryCreatorModal } from "./LibraryCreatorModal";
export function LibraryBrowser() {
    const { setView } = useRoute();
    // The kind/language/source/container/tag filters from useLibraryIndex
    // are intentionally NOT destructured here. The kind axis is now driven
    // by the kind-tab accordion inside Tree.tsx; the four facet axes were
    // removed from the FilterBar. Hook state stays for a future per-group
    // dropdown (see plan: graceful-floyd).
    const { index, items, loading, error, search, setSearch, filteredItems, rebuild, rebuilding, } = useLibraryIndex();
    const [selectedId, setSelectedId] = useState(null);
    const [selectedSet, setSelectedSet] = useState(() => loadStoredSet());
    const [templateWorkflowId, setTemplateWorkflowId] = useState(() => loadStoredTemplate());
    const [runOpen, setRunOpen] = useState(false);
    const [creatorOpen, setCreatorOpen] = useState(false);
    const [creatorKind, setCreatorKind] = useState("workflow");
    const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
    const selectedItem = selectedId ? itemById.get(selectedId) ?? null : null;
    const selectedItems = [...selectedSet]
        .map((id) => itemById.get(id))
        .filter((item) => Boolean(item));
    function toggleChecked(id) {
        setSelectedSet((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            return next;
        });
    }
    function setChecked(ids, checked) {
        setSelectedSet((prev) => {
            const next = new Set(prev);
            for (const id of ids) {
                if (checked)
                    next.add(id);
                else
                    next.delete(id);
            }
            return next;
        });
    }
    function removeSelected(id) {
        setSelectedSet((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        if (templateWorkflowId === id)
            setTemplateWorkflowId(null);
    }
    useEffect(() => {
        try {
            sessionStorage.setItem("mc.library.selection", JSON.stringify([...selectedSet]));
        }
        catch {
            // Ignore storage errors.
        }
    }, [selectedSet]);
    useEffect(() => {
        try {
            if (templateWorkflowId)
                sessionStorage.setItem("mc.library.templateWorkflow", templateWorkflowId);
            else
                sessionStorage.removeItem("mc.library.templateWorkflow");
        }
        catch {
            // Ignore storage errors.
        }
    }, [templateWorkflowId]);
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "topbar", children: [_jsxs("div", { children: [_jsx("h1", { children: "Library Browser" }), _jsx("div", { className: "muted", style: { fontSize: 12, marginTop: 2 }, children: index
                                    ? `${index.items.length} indexed items · updated ${new Date(index.generatedAt).toLocaleString()}`
                                    : "No index loaded" })] }), _jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }, children: [_jsx("button", { className: "button ghost", onClick: () => void rebuild(), disabled: rebuilding, title: "Walk the library/ tree and rebuild the per-kind index files \u2014 picks up any agents/skills/workflows added on disk", children: rebuilding ? "Refreshing…" : "↻ Refresh" }), _jsx("button", { className: "button ghost", onClick: () => {
                                    setCreatorKind("workflow");
                                    setCreatorOpen(true);
                                }, title: "Create a workflow, agent, or skill \u2014 pick the type from the form's tabs", "aria-label": "Create library item", style: { width: 32, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }, children: _jsxs("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", "aria-hidden": "true", children: [_jsx("line", { x1: "7", y1: "2", x2: "7", y2: "12" }), _jsx("line", { x1: "2", y1: "7", x2: "12", y2: "7" })] }) }), _jsx("button", { className: "button", onClick: () => setRunOpen(true), disabled: !resolveWorkflowSelection(selectedItem, selectedItems, templateWorkflowId), title: "Run selected workflow", children: "Run workflow" }), _jsx("button", { className: "button ghost", onClick: () => setView("dashboard"), children: "\u2190 Dashboard" })] })] }), _jsxs("div", { className: "content", style: { gridTemplateRows: "auto auto 1fr auto" }, children: [_jsx(FilterBar, { search: search, onSearchChange: setSearch }), loading && (_jsx("div", { className: "card", children: _jsx("p", { className: "muted", children: "Loading library index..." }) })), error && (_jsxs("div", { className: "card", style: { borderColor: "var(--bad)", color: "var(--bad)" }, children: ["Failed to load `library/_index.*.json`: ", error.message] })), !loading && !error && (_jsxs("div", { style: { display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }, children: [_jsx(Tree, { items: filteredItems, selectedId: selectedId, selectedSet: selectedSet, onSelectItem: (item) => setSelectedId(item.id), onToggleChecked: toggleChecked, onSetChecked: setChecked, templateWorkflowId: templateWorkflowId, onToggleTemplateWorkflow: (workflowId) => setTemplateWorkflowId((prev) => (prev === workflowId ? null : workflowId)), onCopyLogicalPath: (item) => void navigator.clipboard?.writeText(item.logicalPath), onOpenFile: (item) => void window.mc?.openPath(item.diskPath) }), _jsx(DetailPanel, { item: selectedItem })] })), _jsx(SelectionBag, { selected: selectedItems, templateWorkflowId: templateWorkflowId, onClear: () => {
                            setSelectedSet(new Set());
                            setTemplateWorkflowId(null);
                        }, onRemove: removeSelected })] }), _jsx(RunWorkflowModal, { open: runOpen, workflowItem: resolveWorkflowSelection(selectedItem, selectedItems, templateWorkflowId), onClose: () => setRunOpen(false) }), _jsx(LibraryCreatorModal, { open: creatorOpen, initialKind: creatorKind, onClose: () => setCreatorOpen(false) })] }));
}
function loadStoredSet() {
    try {
        const raw = sessionStorage.getItem("mc.library.selection");
        if (!raw)
            return new Set();
        const parsed = JSON.parse(raw);
        return new Set(Array.isArray(parsed) ? parsed : []);
    }
    catch {
        return new Set();
    }
}
function loadStoredTemplate() {
    try {
        return sessionStorage.getItem("mc.library.templateWorkflow");
    }
    catch {
        return null;
    }
}
function resolveWorkflowSelection(selectedItem, selectedItems, templateWorkflowId) {
    if (selectedItem?.kind === "workflow")
        return selectedItem;
    if (templateWorkflowId) {
        const template = selectedItems.find((x) => x.id === templateWorkflowId && x.kind === "workflow");
        if (template)
            return template;
    }
    return selectedItems.find((x) => x.kind === "workflow") ?? null;
}
