import type { LibraryIndexItem, LibraryItemKind } from "../../types/library";
import { useEffect, useMemo, useRef, useState } from "react";

function groupByKind(items: LibraryIndexItem[]): Record<LibraryItemKind, LibraryIndexItem[]> {
  return {
    agent: items.filter((x) => x.kind === "agent"),
    skill: items.filter((x) => x.kind === "skill"),
    workflow: items.filter((x) => x.kind === "workflow"),
    example: items.filter((x) => x.kind === "example"),
  };
}

export function Tree({
  items,
  selectedId,
  selectedSet,
  onSelectItem,
  onToggleChecked,
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
  templateWorkflowId: string | null;
  onToggleTemplateWorkflow: (workflowId: string) => void;
  onCopyLogicalPath: (item: LibraryIndexItem) => void;
  onOpenFile: (item: LibraryIndexItem) => void;
}): JSX.Element {
  const grouped = groupByKind(items);
  const [menu, setMenu] = useState<{ x: number; y: number; item: LibraryIndexItem } | null>(null);

  useEffect(() => {
    const close = (): void => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  return (
    <div className="card" style={{ minHeight: 480, position: "relative" }}>
      <h3 style={{ marginBottom: 10 }}>Library Tree</h3>
      <div style={{ display: "grid", gap: 12 }}>
        {(Object.keys(grouped) as LibraryItemKind[]).map((kind) => (
          <div key={kind}>
            <KindHeader
              kind={kind}
              items={grouped[kind]}
              selectedSet={selectedSet}
              onToggleChecked={onToggleChecked}
            />
            <GroupedItems
              items={grouped[kind]}
              selectedId={selectedId}
              selectedSet={selectedSet}
              onSelectItem={onSelectItem}
              onToggleChecked={onToggleChecked}
              templateWorkflowId={templateWorkflowId}
              onToggleTemplateWorkflow={onToggleTemplateWorkflow}
              onContextMenu={(item, x, y) => setMenu({ item, x, y })}
            />
          </div>
        ))}
      </div>
      {menu && (
        <div
          className="card"
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            zIndex: 2000,
            padding: 8,
            minWidth: 180,
            display: "grid",
            gap: 6,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="button ghost" style={{ textAlign: "left" }} onClick={() => onCopyLogicalPath(menu.item)}>
            Copy logical path
          </button>
          <button className="button ghost" style={{ textAlign: "left" }} onClick={() => onOpenFile(menu.item)}>
            Open file
          </button>
        </div>
      )}
    </div>
  );
}

function GroupedItems({
  items,
  selectedId,
  selectedSet,
  onSelectItem,
  onToggleChecked,
  templateWorkflowId,
  onToggleTemplateWorkflow,
  onContextMenu,
}: {
  items: LibraryIndexItem[];
  selectedId: string | null;
  selectedSet: Set<string>;
  onSelectItem: (item: LibraryIndexItem) => void;
  onToggleChecked: (id: string) => void;
  templateWorkflowId: string | null;
  onToggleTemplateWorkflow: (workflowId: string) => void;
  onContextMenu: (item: LibraryIndexItem, x: number, y: number) => void;
}): JSX.Element {
  const groups = useMemo(() => {
    const map = new Map<string, LibraryIndexItem[]>();
    for (const item of items) {
      const key = subgroupKey(item);
      const bucket = map.get(key);
      if (bucket) bucket.push(item);
      else map.set(key, [item]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  return (
    <div style={{ display: "grid", gap: 8, maxHeight: 280, overflow: "auto", paddingRight: 4 }}>
      {groups.map(([key, entries]) => (
        <div key={key}>
          <SubgroupHeader
            label={key}
            items={entries}
            selectedSet={selectedSet}
            onToggleChecked={onToggleChecked}
          />
          <div style={{ display: "grid", gap: 6 }}>
            {entries.slice(0, 300).map((item) => {
              const active = selectedId === item.id;
              const checked = selectedSet.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => onSelectItem(item)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onContextMenu(item, e.clientX, e.clientY);
                  }}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: 8,
                    padding: "6px 8px",
                    cursor: "pointer",
                    background: active ? "rgba(110, 168, 254, 0.08)" : "var(--panel-2)",
                  }}
                  title={item.id}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleChecked(item.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.name}
                    </div>
                    <div className="muted" style={{ fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.logicalPath}
                    </div>
                  </div>
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
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function KindHeader({
  kind,
  items,
  selectedSet,
  onToggleChecked,
}: {
  kind: LibraryItemKind;
  items: LibraryIndexItem[];
  selectedSet: Set<string>;
  onToggleChecked: (id: string) => void;
}): JSX.Element {
  const ref = useRef<HTMLInputElement | null>(null);
  const selectedCount = items.reduce((acc, item) => acc + (selectedSet.has(item.id) ? 1 : 0), 0);
  const allChecked = items.length > 0 && selectedCount === items.length;
  const indeterminate = selectedCount > 0 && selectedCount < items.length;

  useEffect(() => {
    if (!ref.current) return;
    ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <div className="muted" style={{ fontSize: 12, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
      <input
        ref={ref}
        type="checkbox"
        checked={allChecked}
        onChange={() => {
          if (allChecked) {
            for (const item of items) {
              if (selectedSet.has(item.id)) onToggleChecked(item.id);
            }
            return;
          }
          for (const item of items) {
            if (!selectedSet.has(item.id)) onToggleChecked(item.id);
          }
        }}
      />
      <span>{kind} ({items.length})</span>
    </div>
  );
}

function SubgroupHeader({
  label,
  items,
  selectedSet,
  onToggleChecked,
}: {
  label: string;
  items: LibraryIndexItem[];
  selectedSet: Set<string>;
  onToggleChecked: (id: string) => void;
}): JSX.Element {
  const ref = useRef<HTMLInputElement | null>(null);
  const selectedCount = items.reduce((acc, item) => acc + (selectedSet.has(item.id) ? 1 : 0), 0);
  const allChecked = items.length > 0 && selectedCount === items.length;
  const indeterminate = selectedCount > 0 && selectedCount < items.length;

  useEffect(() => {
    if (!ref.current) return;
    ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, marginTop: 4 }}>
      <input
        ref={ref}
        type="checkbox"
        checked={allChecked}
        onChange={() => {
          if (allChecked) {
            for (const item of items) {
              if (selectedSet.has(item.id)) onToggleChecked(item.id);
            }
            return;
          }
          for (const item of items) {
            if (!selectedSet.has(item.id)) onToggleChecked(item.id);
          }
        }}
      />
      <span className="muted" style={{ fontSize: 11 }}>
        {label} ({items.length})
      </span>
    </div>
  );
}

function subgroupKey(item: LibraryIndexItem): string {
  const parts = item.logicalPath.split("/");
  if (parts.length <= 1) return parts[0] ?? "root";
  return parts.slice(0, Math.min(3, parts.length - 1)).join("/");
}

