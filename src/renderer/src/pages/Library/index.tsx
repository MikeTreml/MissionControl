import { useMemo, useState } from "react";
import { useEffect } from "react";
import type { LibraryIndexItem } from "../../types/library";

import { useLibraryIndex } from "../../hooks/useLibraryIndex";
import { useRoute } from "../../router";
import { FilterBar } from "./FilterBar";
import { Tree } from "./Tree";
import { DetailPanel } from "./DetailPanel";
import { SelectionBag } from "./SelectionBag";
import { RunWorkflowModal } from "./RunWorkflowModal";
import { LibraryCreatorModal } from "./LibraryCreatorModal";

export function LibraryBrowser(): JSX.Element {
  const { setView } = useRoute();
  // The kind/language/source/container/tag filters from useLibraryIndex
  // are intentionally NOT destructured here. The kind axis is now driven
  // by the kind-tab accordion inside Tree.tsx; the four facet axes were
  // removed from the FilterBar. Hook state stays for a future per-group
  // dropdown (see plan: graceful-floyd).
  const {
    index,
    items,
    loading,
    error,
    search,
    setSearch,
    filteredItems,
    rebuild,
    rebuilding,
  } = useLibraryIndex();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(() => loadStoredSet());
  const [templateWorkflowId, setTemplateWorkflowId] = useState<string | null>(() => loadStoredTemplate());
  const [runOpen, setRunOpen] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorKind, setCreatorKind] = useState<"workflow" | "agent" | "skill">("workflow");
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item] as const)),
    [items],
  );
  const selectedItem = selectedId ? itemById.get(selectedId) ?? null : null;
  const selectedItems = [...selectedSet]
    .map((id) => itemById.get(id))
    .filter((item): item is LibraryIndexItem => Boolean(item));

  function toggleChecked(id: string): void {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setChecked(ids: string[], checked: boolean): void {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function removeSelected(id: string): void {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (templateWorkflowId === id) setTemplateWorkflowId(null);
  }

  useEffect(() => {
    try {
      sessionStorage.setItem("mc.library.selection", JSON.stringify([...selectedSet]));
    } catch {
      // Ignore storage errors.
    }
  }, [selectedSet]);

  useEffect(() => {
    try {
      if (templateWorkflowId) sessionStorage.setItem("mc.library.templateWorkflow", templateWorkflowId);
      else sessionStorage.removeItem("mc.library.templateWorkflow");
    } catch {
      // Ignore storage errors.
    }
  }, [templateWorkflowId]);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Library Browser</h1>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {index
              ? `${index.items.length} indexed items · updated ${new Date(index.generatedAt).toLocaleString()}`
              : "No index loaded"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            className="button ghost"
            onClick={() => void rebuild()}
            disabled={rebuilding}
            title="Walk the library/ tree and rebuild the per-kind index files — picks up any agents/skills/workflows added on disk"
          >
            {rebuilding ? "Refreshing…" : "↻ Refresh"}
          </button>
          <button
            className="button ghost"
            onClick={() => {
              setCreatorKind("workflow");
              setCreatorOpen(true);
            }}
            title="Create a workflow, agent, or skill — pick the type from the form's tabs"
            aria-label="Create library item"
            style={{ width: 32, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="7" y1="2" x2="7" y2="12" />
              <line x1="2" y1="7" x2="12" y2="7" />
            </svg>
          </button>
          <button
            className="button"
            onClick={() => setRunOpen(true)}
            disabled={!resolveWorkflowSelection(selectedItem, selectedItems, templateWorkflowId)}
            title="Run selected workflow"
          >
            Run workflow
          </button>
          <button className="button ghost" onClick={() => setView("dashboard")}>
            ← Dashboard
          </button>
        </div>
      </div>
      <div className="content" style={{ gridTemplateRows: "auto auto 1fr auto" }}>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
        />
        {loading && (
          <div className="card">
            <p className="muted">Loading library index...</p>
          </div>
        )}
        {error && (
          <div className="card" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
            Failed to load `library/_index.*.json`: {error.message}
          </div>
        )}
        {!loading && !error && (
          <div className="library-browser-grid">
            <Tree
              items={filteredItems}
              selectedId={selectedId}
              selectedSet={selectedSet}
              onSelectItem={(item) => setSelectedId(item.id)}
              onToggleChecked={toggleChecked}
              onSetChecked={setChecked}
              templateWorkflowId={templateWorkflowId}
              onToggleTemplateWorkflow={(workflowId) =>
                setTemplateWorkflowId((prev) => (prev === workflowId ? null : workflowId))
              }
              onCopyLogicalPath={(item) => void navigator.clipboard?.writeText(item.logicalPath)}
              onOpenFile={(item) => void window.mc?.openPath(item.diskPath)}
            />
            <DetailPanel item={selectedItem} />
          </div>
        )}
        <SelectionBag
          selected={selectedItems}
          templateWorkflowId={templateWorkflowId}
          onClear={() => {
            setSelectedSet(new Set());
            setTemplateWorkflowId(null);
          }}
          onRemove={removeSelected}
        />
      </div>
      <RunWorkflowModal
        open={runOpen}
        workflowItem={resolveWorkflowSelection(selectedItem, selectedItems, templateWorkflowId)}
        onClose={() => setRunOpen(false)}
      />
      <LibraryCreatorModal
        open={creatorOpen}
        initialKind={creatorKind}
        onClose={() => setCreatorOpen(false)}
      />
    </>
  );
}

function loadStoredSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem("mc.library.selection");
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function loadStoredTemplate(): string | null {
  try {
    return sessionStorage.getItem("mc.library.templateWorkflow");
  } catch {
    return null;
  }
}

function resolveWorkflowSelection(
  selectedItem: LibraryIndexItem | null,
  selectedItems: LibraryIndexItem[],
  templateWorkflowId: string | null,
): LibraryIndexItem | null {
  if (selectedItem?.kind === "workflow") return selectedItem;
  if (templateWorkflowId) {
    const template = selectedItems.find((x) => x.id === templateWorkflowId && x.kind === "workflow");
    if (template) return template;
  }
  return selectedItems.find((x) => x.kind === "workflow") ?? null;
}

