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
  const tree = useMemo(() => buildTree(items), [items]);
  const folderIds = useMemo(() => collectFolderIds(tree.children), [tree]);
  const visibleIds = useMemo(() => items.map((item) => item.id), [items]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; item: LibraryIndexItem } | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (tree.children.length === 0) return;
    if (!initialized.current) {
      initialized.current = true;
      setExpandedFolders(new Set(tree.children.filter((node): node is FolderNode => node.type === "folder").map((node) => node.id)));
      return;
    }
    if (items.length <= 200) {
      setExpandedFolders((prev) => new Set([...prev, ...folderIds]));
    }
  }, [folderIds, items.length, tree]);

  useEffect(() => {
    const close = (): void => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const selectedVisible = visibleIds.reduce((count, id) => count + (selectedSet.has(id) ? 1 : 0), 0);

  function toggleFolder(id: string): void {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="library-tree-panel">
      <div className="library-tree-head">
        <div>
          <h3 style={{ marginBottom: 4 }}>Library Tree</h3>
          <div className="muted" style={{ fontSize: 12 }}>
            {items.length} files visible · {selectedVisible} selected here
          </div>
        </div>
        <div className="library-tree-toolbar">
          <button className="button ghost" onClick={() => setExpandedFolders(new Set(folderIds))}>
            Expand all
          </button>
          <button className="button ghost" onClick={() => setExpandedFolders(new Set())}>
            Collapse all
          </button>
          <button className="button ghost" onClick={() => onSetChecked(visibleIds, true)} disabled={visibleIds.length === 0}>
            Select visible
          </button>
          <button className="button ghost" onClick={() => onSetChecked(visibleIds, false)} disabled={selectedVisible === 0}>
            Clear visible
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>
          No library files match the current filters.
        </p>
      ) : (
        <div
          className="library-tree-scroll"
          role="tree"
          aria-label="Library files"
        >
          <TreeRows
            nodes={tree.children}
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
