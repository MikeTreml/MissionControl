import { useEffect, useMemo, useRef, useState } from "react";
import type { LibraryIndexItem, LibraryItemKind } from "../../types/library";

type TreeNode = FolderNode | FileNode;

type FolderNode = {
  type: "folder";
  id: string;
  name: string;
  path: string;
  depth: number;
  children: TreeNode[];
  itemIds: string[];
  counts: Record<LibraryItemKind, number>;
};

type FileNode = {
  type: "file";
  id: string;
  name: string;
  path: string;
  depth: number;
  item: LibraryIndexItem;
};

const KIND_ORDER: LibraryItemKind[] = ["agent", "skill", "workflow", "example"];

const TABS: ReadonlyArray<{ kind: LibraryItemKind; label: string }> = [
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
function loadExpandedFolders(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_EXPANDED);
    if (raw === null) {
      sessionStorage.setItem(STORAGE_KEY_EXPANDED, "[]");
      return new Set();
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(String));
  } catch {
    return new Set();
  }
}

function saveExpandedFolders(set: Set<string>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY_EXPANDED, JSON.stringify([...set]));
  } catch {
    // sessionStorage can fail (private mode, quota); a stale Set in
    // memory is fine — folders just won't survive an HMR reload.
  }
}

export function Tree({
  items,
  selectedId,
  selectedSet,
  onSelectItem,
  onToggleChecked,
  onSetChecked,
  templateWorkflowId,
  onToggleTemplateWorkflow,
  onCopyLogicalPath,
  onOpenFile,
}: {
  items: LibraryIndexItem[];
  selectedId: string | null;
  selectedSet: Set<string>;
  onSelectItem: (item: LibraryIndexItem) => void;
  onToggleChecked: (id: string) => void;
  onSetChecked: (ids: string[], checked: boolean) => void;
  templateWorkflowId: string | null;
  onToggleTemplateWorkflow: (workflowId: string) => void;
  onCopyLogicalPath: (item: LibraryIndexItem) => void;
  onOpenFile: (item: LibraryIndexItem) => void;
}): JSX.Element {
  // Group the (already-search-filtered) items by kind so each tab's
  // tree only sees its own subset. Workflows / agents / skills /
  // examples each get an independent folder hierarchy.
  const itemsByKind = useMemo(() => {
    const out: Record<LibraryItemKind, LibraryIndexItem[]> = {
      agent: [],
      skill: [],
      workflow: [],
      example: [],
    };
    for (const item of items) out[item.kind].push(item);
    return out;
  }, [items]);

  const treesByKind = useMemo(
    () => ({
      workflow: buildTree(itemsByKind.workflow),
      agent: buildTree(itemsByKind.agent),
      skill: buildTree(itemsByKind.skill),
      example: buildTree(itemsByKind.example),
    }),
    [itemsByKind],
  );

  // Default to Workflow — smallest set + the only kind the page's
  // primary action ("Run workflow") can target. Tab choice is per-
  // component-instance (resets on full renderer reload, persists for
  // the life of the page mount).
  const [activeTab, setActiveTab] = useState<LibraryItemKind>("workflow");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => loadExpandedFolders());
  const [menu, setMenu] = useState<{ x: number; y: number; item: LibraryIndexItem } | null>(null);

  useEffect(() => {
    const close = (): void => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  function toggleFolder(id: string): void {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveExpandedFolders(next);
      return next;
    });
  }

  function setExpandedTo(next: Set<string>): void {
    setExpandedFolders(next);
    saveExpandedFolders(next);
  }

  const activeTree = treesByKind[activeTab];
  const activeFolderIds = useMemo(() => collectFolderIds(activeTree.children), [activeTree]);
  const activeVisibleIds = useMemo(() => itemsByKind[activeTab].map((item) => item.id), [itemsByKind, activeTab]);
  const selectedInActive = activeVisibleIds.reduce((count, id) => count + (selectedSet.has(id) ? 1 : 0), 0);
  const totalSelected = items.reduce((count, item) => count + (selectedSet.has(item.id) ? 1 : 0), 0);
  const activeLabel = TABS.find((tab) => tab.kind === activeTab)?.label ?? activeTab;

  return (
    <div className="library-tree-panel">
      <div className="library-tree-head">
        <div>
          <h3 style={{ marginBottom: 4 }}>Library</h3>
          <div className="muted" style={{ fontSize: 12 }}>
            {items.length.toLocaleString()} files match · {totalSelected} checked across all kinds
          </div>
        </div>
        <div className="library-tree-toolbar">
          <button
            className="button ghost"
            onClick={() => setExpandedTo(new Set([...expandedFolders, ...activeFolderIds]))}
            disabled={activeFolderIds.length === 0}
            title={`Expand every folder in the ${activeLabel} tab`}
          >
            Expand all
          </button>
          <button
            className="button ghost"
            onClick={() => {
              const next = new Set(expandedFolders);
              for (const id of activeFolderIds) next.delete(id);
              setExpandedTo(next);
            }}
            disabled={activeFolderIds.length === 0}
            title={`Collapse every folder in the ${activeLabel} tab`}
          >
            Collapse all
          </button>
          <button
            className="button ghost"
            onClick={() => onSetChecked(activeVisibleIds, true)}
            disabled={activeVisibleIds.length === 0}
            title={`Check every visible ${activeLabel} item`}
          >
            Select visible
          </button>
          <button
            className="button ghost"
            onClick={() => onSetChecked(activeVisibleIds, false)}
            disabled={selectedInActive === 0}
            title={`Uncheck every visible ${activeLabel} item`}
          >
            Clear visible
          </button>
        </div>
      </div>

      {/* Horizontal accordion: one tab body open at a time, others
       * collapsed to header-only. Click a tab header → become the
       * active tab. Counts reflect the current search-filtered set
       * across all kinds, so the user can scan all four counts to
       * pick the most useful tab to expand. */}
      <div className="library-kind-tabs" role="tablist" aria-label="Library kind">
        {TABS.map(({ kind, label }) => {
          const count = itemsByKind[kind].length;
          const active = activeTab === kind;
          return (
            <button
              key={kind}
              role="tab"
              aria-selected={active}
              className={`library-kind-tab${active ? " active" : ""}`}
              onClick={() => setActiveTab(kind)}
              title={`${label} · ${count.toLocaleString()} ${count === 1 ? "item" : "items"}`}
            >
              <span className="library-kind-tab-chevron">{active ? "▾" : "▸"}</span>
              <span className="library-kind-tab-label">{label}</span>
              <span className="library-kind-tab-count">{count.toLocaleString()}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" aria-label={`${activeLabel} tree`}>
        {activeVisibleIds.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, padding: "12px 4px" }}>
            No {activeLabel} items match the current search.
          </p>
        ) : (
          <div
            className="library-tree-scroll"
            role="tree"
            aria-label={`${activeLabel} tree`}
          >
            <TreeRows
              nodes={activeTree.children}
              expandedFolders={expandedFolders}
              selectedId={selectedId}
              selectedSet={selectedSet}
              onToggleFolder={toggleFolder}
              onSelectItem={onSelectItem}
              onToggleChecked={onToggleChecked}
              onSetChecked={onSetChecked}
              templateWorkflowId={templateWorkflowId}
              onToggleTemplateWorkflow={onToggleTemplateWorkflow}
              onContextMenu={(item, x, y) => setMenu({ item, x, y })}
            />
          </div>
        )}
      </div>

      {menu && (
        <div
          className="library-tree-menu"
          style={{
            left: menu.x,
            top: menu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="button ghost"
            style={{ textAlign: "left" }}
            onClick={() => {
              onCopyLogicalPath(menu.item);
              setMenu(null);
            }}
          >
            Copy logical path
          </button>
          <button
            className="button ghost"
            style={{ textAlign: "left" }}
            onClick={() => {
              onOpenFile(menu.item);
              setMenu(null);
            }}
          >
            Open file
          </button>
        </div>
      )}
    </div>
  );
}

function TreeRows({
  nodes,
  expandedFolders,
  selectedId,
  selectedSet,
  onToggleFolder,
  onSelectItem,
  onToggleChecked,
  onSetChecked,
  templateWorkflowId,
  onToggleTemplateWorkflow,
  onContextMenu,
}: {
  nodes: TreeNode[];
  expandedFolders: Set<string>;
  selectedId: string | null;
  selectedSet: Set<string>;
  onToggleFolder: (id: string) => void;
  onSelectItem: (item: LibraryIndexItem) => void;
  onToggleChecked: (id: string) => void;
  onSetChecked: (ids: string[], checked: boolean) => void;
  templateWorkflowId: string | null;
  onToggleTemplateWorkflow: (workflowId: string) => void;
  onContextMenu: (item: LibraryIndexItem, x: number, y: number) => void;
}): JSX.Element {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === "folder") {
          const expanded = expandedFolders.has(node.id);
          return (
            <div key={node.id} role="group">
              <FolderRow
                node={node}
                expanded={expanded}
                selectedSet={selectedSet}
                onToggleFolder={onToggleFolder}
                onSetChecked={onSetChecked}
              />
              {expanded && (
                <TreeRows
                  nodes={node.children}
                  expandedFolders={expandedFolders}
                  selectedId={selectedId}
                  selectedSet={selectedSet}
                  onToggleFolder={onToggleFolder}
                  onSelectItem={onSelectItem}
                  onToggleChecked={onToggleChecked}
                  onSetChecked={onSetChecked}
                  templateWorkflowId={templateWorkflowId}
                  onToggleTemplateWorkflow={onToggleTemplateWorkflow}
                  onContextMenu={onContextMenu}
                />
              )}
            </div>
          );
        }
        return (
          <FileRow
            key={node.id}
            node={node}
            active={selectedId === node.item.id}
            checked={selectedSet.has(node.item.id)}
            templateWorkflowId={templateWorkflowId}
            onSelectItem={onSelectItem}
            onToggleChecked={onToggleChecked}
            onToggleTemplateWorkflow={onToggleTemplateWorkflow}
            onContextMenu={onContextMenu}
          />
        );
      })}
    </>
  );
}

function FolderRow({
  node,
  expanded,
  selectedSet,
  onToggleFolder,
  onSetChecked,
}: {
  node: FolderNode;
  expanded: boolean;
  selectedSet: Set<string>;
  onToggleFolder: (id: string) => void;
  onSetChecked: (ids: string[], checked: boolean) => void;
}): JSX.Element {
  const ref = useRef<HTMLInputElement | null>(null);
  const selectedCount = node.itemIds.reduce((count, id) => count + (selectedSet.has(id) ? 1 : 0), 0);
  const allChecked = node.itemIds.length > 0 && selectedCount === node.itemIds.length;
  const indeterminate = selectedCount > 0 && selectedCount < node.itemIds.length;

  useEffect(() => {
    if (!ref.current) return;
    ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <div
      role="treeitem"
      aria-expanded={expanded}
      onClick={() => onToggleFolder(node.id)}
      className={`library-tree-row library-tree-row-folder${selectedCount > 0 ? " has-selection" : ""}`}
      style={{
        paddingLeft: 8 + node.depth * 18,
      }}
      title={node.path}
    >
      <button
        className="library-tree-chevron"
        aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggleFolder(node.id);
        }}
      >
        {expanded ? "▾" : "▸"}
      </button>
      <input
        ref={ref}
        type="checkbox"
        checked={allChecked}
        onChange={(e) => {
          e.stopPropagation();
          onSetChecked(node.itemIds, !allChecked);
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="library-tree-label">
        <div className="library-tree-titleline">
          <span className="library-tree-folder-name">
            {node.name}
          </span>
          <span className="library-tree-count">
            {node.itemIds.length}
          </span>
          {selectedCount > 0 && (
            <span className="pill info" style={{ marginRight: 0 }}>
              {selectedCount} selected
            </span>
          )}
        </div>
        <div className="library-tree-path">
          {node.path}
        </div>
      </div>
      <KindCounts counts={node.counts} />
    </div>
  );
}

function FileRow({
  node,
  active,
  checked,
  templateWorkflowId,
  onSelectItem,
  onToggleChecked,
  onToggleTemplateWorkflow,
  onContextMenu,
}: {
  node: FileNode;
  active: boolean;
  checked: boolean;
  templateWorkflowId: string | null;
  onSelectItem: (item: LibraryIndexItem) => void;
  onToggleChecked: (id: string) => void;
  onToggleTemplateWorkflow: (workflowId: string) => void;
  onContextMenu: (item: LibraryIndexItem, x: number, y: number) => void;
}): JSX.Element {
  const item = node.item;
  return (
    <div
      role="treeitem"
      aria-selected={active}
      onClick={() => onSelectItem(item)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(item, e.clientX, e.clientY);
      }}
      className={`library-tree-row library-tree-row-file${active ? " active" : ""}`}
      style={{ paddingLeft: 34 + node.depth * 18 }}
      title={item.id}
    >
      <span className="library-tree-glyph">
        {kindGlyph(item.kind)}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => {
          e.stopPropagation();
          onToggleChecked(item.id);
        }}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="library-tree-label">
        <div className="library-tree-file-name">
          {item.name}
        </div>
        <div className="library-tree-path">
          {item.logicalPath}
        </div>
      </div>
      <span className="pill neutral" style={{ marginRight: 0 }}>
        {item.kind}
      </span>
      {item.kind === "workflow" && (
        <button
          className="button ghost"
          style={{
            padding: "2px 7px",
            fontSize: 12,
            color: templateWorkflowId === item.id ? "var(--warn)" : "var(--muted)",
            borderColor: templateWorkflowId === item.id ? "var(--warn)" : "var(--border)",
          }}
          title="Use as template"
          onClick={(e) => {
            e.stopPropagation();
            onToggleTemplateWorkflow(item.id);
          }}
        >
          ★
        </button>
      )}
    </div>
  );
}

function KindCounts({ counts }: { counts: Record<LibraryItemKind, number> }): JSX.Element {
  return (
    <div className="library-tree-kind-counts">
      {KIND_ORDER.filter((kind) => counts[kind] > 0).map((kind) => (
        <span key={kind} className="pill neutral" style={{ marginRight: 0 }} title={kind}>
          {kind.slice(0, 1)} {counts[kind]}
        </span>
      ))}
    </div>
  );
}

function buildTree(items: LibraryIndexItem[]): FolderNode {
  const root = createFolder("", "library", "", -1);
  const folderByPath = new Map<string, FolderNode>([["", root]]);
  const sorted = [...items].sort((a, b) => a.logicalPath.localeCompare(b.logicalPath));

  for (const item of sorted) {
    const parts = item.logicalPath.split("/").filter(Boolean);
    const folderParts = parts.slice(0, -1);
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
      name: parts.at(-1) ?? item.name,
      path: item.logicalPath,
      depth: folderParts.length,
      item,
    });
  }

  sortTree(root);
  return root;
}

function createFolder(idPath: string, name: string, folderPath: string, depth: number): FolderNode {
  return {
    type: "folder",
    id: `folder:${idPath}`,
    name,
    path: folderPath || "library",
    depth,
    children: [],
    itemIds: [],
    counts: { agent: 0, skill: 0, workflow: 0, example: 0 },
  };
}

function addItemToFolder(folder: FolderNode, item: LibraryIndexItem): void {
  folder.itemIds.push(item.id);
  folder.counts[item.kind] += 1;
}

function sortTree(folder: FolderNode): void {
  folder.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of folder.children) {
    if (child.type === "folder") sortTree(child);
  }
}

function collectFolderIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.type !== "folder") continue;
    ids.push(node.id, ...collectFolderIds(node.children));
  }
  return ids;
}

function kindGlyph(kind: LibraryItemKind): string {
  if (kind === "agent") return "A";
  if (kind === "skill") return "S";
  if (kind === "workflow") return "W";
  return "E";
}
