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

export function LibraryBrowser(): JSX.Element {
  const { setView } = useRoute();
  const {
    index,
    loading,
    error,
    search,
    setSearch,
    kindFilter,
    toggleKind,
    languageFilter,
    sourceFilter,
    containerKindFilter,
    tagFilter,
    toggleLanguage,
    toggleSource,
    toggleContainerKind,
    toggleTag,
    facets,
    filteredItems,
  } = useLibraryIndex();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(() => loadStoredSet());
  const [templateWorkflowId, setTemplateWorkflowId] = useState<string | null>(() => loadStoredTemplate());
  const [runOpen, setRunOpen] = useState(false);
  const itemById = useMemo(
    () => new Map(filteredItems.map((item) => [item.id, item] as const)),
    [filteredItems],
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
        <div style={{ display: "flex", gap: 8 }}>
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
          kindFilter={kindFilter}
          onToggleKind={toggleKind}
          facets={facets}
          languageFilter={languageFilter}
          sourceFilter={sourceFilter}
          containerKindFilter={containerKindFilter}
          tagFilter={tagFilter}
          onToggleLanguage={toggleLanguage}
          onToggleSource={toggleSource}
          onToggleContainerKind={toggleContainerKind}
          onToggleTag={toggleTag}
        />
        {loading && (
          <div className="card">
            <p className="muted">Loading library index...</p>
          </div>
        )}
        {error && (
          <div className="card" style={{ borderColor: "var(--bad)", color: "var(--bad)" }}>
            Failed to load `library/_index.json`: {error.message}
          </div>
        )}
        {!loading && !error && (
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 14 }}>
            <Tree
              items={filteredItems}
              selectedId={selectedId}
              selectedSet={selectedSet}
              onSelectItem={(item) => setSelectedId(item.id)}
              onToggleChecked={toggleChecked}
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
        />
      </div>
      <RunWorkflowModal
        open={runOpen}
        workflowItem={resolveWorkflowSelection(selectedItem, selectedItems, templateWorkflowId)}
        onClose={() => setRunOpen(false)}
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

