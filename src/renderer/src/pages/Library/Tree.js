import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
const TABS = [
    { kind: "workflow", label: "Workflow" },
    { kind: "agent", label: "Agent" },
    { kind: "skill", label: "Skill" },
    { kind: "example", label: "Misc" },
];
const STORAGE_KEY_EXPANDED = "mc.library.expandedFolders";
/**
 * Per-session folder open/closed state. On first session boot the key is
 * missing → all folders default-collapsed (per the operator's spec). The
 * empty array gets written so subsequent reads inside the same session
 * return what the user actually toggled. sessionStorage is wiped when
 * the Electron app is closed, so the next launch is fresh-collapsed
 * again automatically — no manual reset needed.
 */
function loadExpandedFolders() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY_EXPANDED);
        if (raw === null) {
            sessionStorage.setItem(STORAGE_KEY_EXPANDED, "[]");
            return new Set();
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return new Set();
        return new Set(parsed.map(String));
    }
    catch {
        return new Set();
    }
}
function saveExpandedFolders(set) {
    try {
        sessionStorage.setItem(STORAGE_KEY_EXPANDED, JSON.stringify([...set]));
    }
    catch {
        // sessionStorage can fail (private mode, quota); a stale Set in
        // memory is fine — folders just won't survive an HMR reload.
    }
}
export function Tree({ items, selectedId, selectedSet, onSelectItem, onToggleChecked, onSetChecked, templateWorkflowId, onToggleTemplateWorkflow, onCopyLogicalPath, onOpenFile, }) {
    // Group the (already-search-filtered) items by kind so each tab's
    // tree only sees its own subset. Workflows / agents / skills /
    // examples each get an independent folder hierarchy.
    const itemsByKind = useMemo(() => {
        const out = {
            agent: [],
            skill: [],
            workflow: [],
            example: [],
        };
        for (const item of items)
            out[item.kind].push(item);
        return out;
    }, [items]);
    // Each per-tab tree skips the kind-named folder (`workflows/`, `agents/`,
    // `skills/`, `examples/`) since the tab itself already filters by kind —
    // showing the folder layer would be redundant.
    const treesByKind = useMemo(() => ({
        workflow: buildTree(itemsByKind.workflow, "workflows"),
        agent: buildTree(itemsByKind.agent, "agents"),
        skill: buildTree(itemsByKind.skill, "skills"),
        example: buildTree(itemsByKind.example, "examples"),
    }), [itemsByKind]);
    // Default to Workflow — smallest set + the only kind the page's
    // primary action ("Run workflow") can target. Tab choice is per-
    // component-instance (resets on full renderer reload, persists for
    // the life of the page mount).
    const [activeTab, setActiveTab] = useState("workflow");
    const [expandedFolders, setExpandedFolders] = useState(() => loadExpandedFolders());
    const [menu, setMenu] = useState(null);
    useEffect(() => {
        const close = () => setMenu(null);
        window.addEventListener("click", close);
        return () => window.removeEventListener("click", close);
    }, []);
    function toggleFolder(id) {
        setExpandedFolders((prev) => {
            const next = new Set(prev);
            if (next.has(id))
                next.delete(id);
            else
                next.add(id);
            saveExpandedFolders(next);
            return next;
        });
    }
    function setExpandedTo(next) {
        setExpandedFolders(next);
        saveExpandedFolders(next);
    }
    const activeTree = treesByKind[activeTab];
    const activeFolderIds = useMemo(() => collectFolderIds(activeTree.children), [activeTree]);
    const activeVisibleIds = useMemo(() => itemsByKind[activeTab].map((item) => item.id), [itemsByKind, activeTab]);
    const selectedInActive = activeVisibleIds.reduce((count, id) => count + (selectedSet.has(id) ? 1 : 0), 0);
    const totalSelected = items.reduce((count, item) => count + (selectedSet.has(item.id) ? 1 : 0), 0);
    const activeLabel = TABS.find((tab) => tab.kind === activeTab)?.label ?? activeTab;
    return (_jsxs("div", { className: "library-tree-panel", children: [_jsxs("div", { className: "library-tree-head", children: [_jsxs("div", { children: [_jsx("h3", { style: { marginBottom: 4 }, children: "Library" }), _jsxs("div", { className: "muted", style: { fontSize: 12 }, children: [items.length.toLocaleString(), " files match \u00B7 ", totalSelected, " checked across all kinds"] })] }), _jsxs("div", { className: "library-tree-toolbar", children: [_jsx("button", { className: "button ghost", onClick: () => setExpandedTo(new Set([...expandedFolders, ...activeFolderIds])), disabled: activeFolderIds.length === 0, title: `Expand every folder in the ${activeLabel} tab`, children: "Expand all" }), _jsx("button", { className: "button ghost", onClick: () => {
                                    const next = new Set(expandedFolders);
                                    for (const id of activeFolderIds)
                                        next.delete(id);
                                    setExpandedTo(next);
                                }, disabled: activeFolderIds.length === 0, title: `Collapse every folder in the ${activeLabel} tab`, children: "Collapse all" }), _jsx("button", { className: "button ghost", onClick: () => onSetChecked(activeVisibleIds, true), disabled: activeVisibleIds.length === 0, title: `Check every visible ${activeLabel} item`, children: "Select visible" }), _jsx("button", { className: "button ghost", onClick: () => onSetChecked(activeVisibleIds, false), disabled: selectedInActive === 0, title: `Uncheck every visible ${activeLabel} item`, children: "Clear visible" })] })] }), _jsx("div", { className: "library-kind-tabs", role: "tablist", "aria-label": "Library kind", children: TABS.map(({ kind, label }) => {
                    const count = itemsByKind[kind].length;
                    const active = activeTab === kind;
                    return (_jsxs("button", { role: "tab", "aria-selected": active, className: `library-kind-tab${active ? " active" : ""}`, onClick: () => setActiveTab(kind), title: `${label} · ${count.toLocaleString()} ${count === 1 ? "item" : "items"}`, children: [_jsx("span", { className: "library-kind-tab-chevron", children: active ? "▾" : "▸" }), _jsx("span", { className: "library-kind-tab-label", children: label }), _jsx("span", { className: "library-kind-tab-count", children: count.toLocaleString() })] }, kind));
                }) }), _jsx("div", { role: "tabpanel", "aria-label": `${activeLabel} tree`, children: activeVisibleIds.length === 0 ? (_jsxs("p", { className: "muted", style: { fontSize: 13, padding: "12px 4px" }, children: ["No ", activeLabel, " items match the current search."] })) : (_jsx("div", { className: "library-tree-scroll", role: "tree", "aria-label": `${activeLabel} tree`, children: _jsx(TreeRows, { nodes: activeTree.children, expandedFolders: expandedFolders, selectedId: selectedId, selectedSet: selectedSet, onToggleFolder: toggleFolder, onSelectItem: onSelectItem, onToggleChecked: onToggleChecked, onSetChecked: onSetChecked, templateWorkflowId: templateWorkflowId, onToggleTemplateWorkflow: onToggleTemplateWorkflow, onContextMenu: (item, x, y) => setMenu({ item, x, y }) }) })) }), menu && (_jsxs("div", { className: "library-tree-menu", style: {
                    left: menu.x,
                    top: menu.y,
                }, onClick: (e) => e.stopPropagation(), children: [_jsx("button", { className: "button ghost", style: { textAlign: "left" }, onClick: () => {
                            onCopyLogicalPath(menu.item);
                            setMenu(null);
                        }, children: "Copy logical path" }), _jsx("button", { className: "button ghost", style: { textAlign: "left" }, onClick: () => {
                            onOpenFile(menu.item);
                            setMenu(null);
                        }, children: "Open file" })] }))] }));
}
function TreeRows({ nodes, expandedFolders, selectedId, selectedSet, onToggleFolder, onSelectItem, onToggleChecked, onSetChecked, templateWorkflowId, onToggleTemplateWorkflow, onContextMenu, }) {
    return (_jsx(_Fragment, { children: nodes.map((node) => {
            if (node.type === "folder") {
                const expanded = expandedFolders.has(node.id);
                return (_jsxs("div", { role: "group", children: [_jsx(FolderRow, { node: node, expanded: expanded, selectedSet: selectedSet, onToggleFolder: onToggleFolder, onSetChecked: onSetChecked }), expanded && (_jsx(TreeRows, { nodes: node.children, expandedFolders: expandedFolders, selectedId: selectedId, selectedSet: selectedSet, onToggleFolder: onToggleFolder, onSelectItem: onSelectItem, onToggleChecked: onToggleChecked, onSetChecked: onSetChecked, templateWorkflowId: templateWorkflowId, onToggleTemplateWorkflow: onToggleTemplateWorkflow, onContextMenu: onContextMenu }))] }, node.id));
            }
            return (_jsx(FileRow, { node: node, active: selectedId === node.item.id, checked: selectedSet.has(node.item.id), templateWorkflowId: templateWorkflowId, onSelectItem: onSelectItem, onToggleChecked: onToggleChecked, onToggleTemplateWorkflow: onToggleTemplateWorkflow, onContextMenu: onContextMenu }, node.id));
        }) }));
}
function FolderRow({ node, expanded, selectedSet, onToggleFolder, onSetChecked, }) {
    const ref = useRef(null);
    const selectedCount = node.itemIds.reduce((count, id) => count + (selectedSet.has(id) ? 1 : 0), 0);
    const allChecked = node.itemIds.length > 0 && selectedCount === node.itemIds.length;
    const indeterminate = selectedCount > 0 && selectedCount < node.itemIds.length;
    useEffect(() => {
        if (!ref.current)
            return;
        ref.current.indeterminate = indeterminate;
    }, [indeterminate]);
    return (_jsxs("div", { role: "treeitem", "aria-expanded": expanded, onClick: () => onToggleFolder(node.id), className: `library-tree-row library-tree-row-folder${selectedCount > 0 ? " has-selection" : ""}`, style: {
            paddingLeft: 8 + node.depth * 18,
        }, title: node.path, children: [_jsx("button", { className: "library-tree-chevron", "aria-label": expanded ? `Collapse ${node.name}` : `Expand ${node.name}`, onClick: (e) => {
                    e.stopPropagation();
                    onToggleFolder(node.id);
                }, children: expanded ? "▾" : "▸" }), _jsx("input", { ref: ref, type: "checkbox", checked: allChecked, onChange: (e) => {
                    e.stopPropagation();
                    onSetChecked(node.itemIds, !allChecked);
                }, onClick: (e) => e.stopPropagation() }), _jsxs("div", { className: "library-tree-label", children: [_jsxs("div", { className: "library-tree-titleline", children: [_jsx("span", { className: "library-tree-folder-name", children: node.name }), _jsx("span", { className: "library-tree-count", children: node.itemIds.length }), selectedCount > 0 && (_jsxs("span", { className: "pill info", style: { marginRight: 0 }, children: [selectedCount, " selected"] }))] }), _jsx("div", { className: "library-tree-path", children: node.path })] })] }));
}
function FileRow({ node, active, checked, templateWorkflowId, onSelectItem, onToggleChecked, onToggleTemplateWorkflow, onContextMenu, }) {
    const item = node.item;
    return (_jsxs("div", { role: "treeitem", "aria-selected": active, onClick: () => onSelectItem(item), onContextMenu: (e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(item, e.clientX, e.clientY);
        }, className: `library-tree-row library-tree-row-file${active ? " active" : ""}`, style: { paddingLeft: 34 + node.depth * 18 }, title: item.id, children: [_jsx("span", { className: "library-tree-glyph", children: kindGlyph(item.kind) }), _jsx("input", { type: "checkbox", checked: checked, onChange: (e) => {
                    e.stopPropagation();
                    onToggleChecked(item.id);
                }, onClick: (e) => e.stopPropagation() }), _jsxs("div", { className: "library-tree-label", children: [_jsx("div", { className: "library-tree-file-name", children: item.name }), _jsx("div", { className: "library-tree-path", title: item.logicalPath, children: (item.description ?? "").trim() || item.logicalPath })] }), _jsx("span", { className: "pill neutral", style: { marginRight: 0 }, children: item.kind }), item.kind === "workflow" && (_jsx("button", { className: "button ghost", style: {
                    padding: "2px 7px",
                    fontSize: 12,
                    color: templateWorkflowId === item.id ? "var(--warn)" : "var(--muted)",
                    borderColor: templateWorkflowId === item.id ? "var(--warn)" : "var(--border)",
                }, title: "Use as template", onClick: (e) => {
                    e.stopPropagation();
                    onToggleTemplateWorkflow(item.id);
                }, children: "\u2605" }))] }));
}
function buildTree(items, skipFolderName = null) {
    const root = createFolder("", "library", "", -1);
    const folderByPath = new Map([["", root]]);
    const sorted = [...items].sort((a, b) => a.logicalPath.localeCompare(b.logicalPath));
    for (const item of sorted) {
        const allParts = item.logicalPath.split("/").filter(Boolean);
        const fileName = allParts.at(-1) ?? item.name;
        // Skip the kind container folder (e.g. drop "workflows" anywhere it
        // appears in the path when building the Workflow tab's tree). The
        // file's own logicalPath stays intact on the item; only the tree
        // collapses the redundant layer.
        const folderParts = allParts
            .slice(0, -1)
            .filter((p) => skipFolderName === null || p !== skipFolderName);
        let cursor = root;
        addItemToFolder(cursor, item);
        for (let i = 0; i < folderParts.length; i += 1) {
            const folderPath = folderParts.slice(0, i + 1).join("/");
            let folder = folderByPath.get(folderPath);
            if (!folder) {
                folder = createFolder(folderPath, folderParts[i] ?? folderPath, folderPath, i);
                folderByPath.set(folderPath, folder);
                cursor.children.push(folder);
            }
            addItemToFolder(folder, item);
            cursor = folder;
        }
        cursor.children.push({
            type: "file",
            id: item.id,
            name: fileName,
            path: item.logicalPath,
            depth: folderParts.length,
            item,
        });
    }
    sortTree(root);
    return root;
}
function createFolder(idPath, name, folderPath, depth) {
    return {
        type: "folder",
        id: `folder:${idPath}`,
        name,
        path: folderPath || "library",
        depth,
        children: [],
        itemIds: [],
    };
}
function addItemToFolder(folder, item) {
    folder.itemIds.push(item.id);
}
function sortTree(folder) {
    folder.children.sort((a, b) => {
        if (a.type !== b.type)
            return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    for (const child of folder.children) {
        if (child.type === "folder")
            sortTree(child);
    }
}
function collectFolderIds(nodes) {
    const ids = [];
    for (const node of nodes) {
        if (node.type !== "folder")
            continue;
        ids.push(node.id, ...collectFolderIds(node.children));
    }
    return ids;
}
function kindGlyph(kind) {
    if (kind === "agent")
        return "A";
    if (kind === "skill")
        return "S";
    if (kind === "workflow")
        return "W";
    return "E";
}
