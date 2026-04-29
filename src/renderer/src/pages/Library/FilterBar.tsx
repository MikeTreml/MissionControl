import type { LibraryItemKind } from "../../types/library";

export function FilterBar({
  search,
  onSearchChange,
  kindFilter,
  onToggleKind,
  facets,
  languageFilter,
  sourceFilter,
  containerKindFilter,
  tagFilter,
  onToggleLanguage,
  onToggleSource,
  onToggleContainerKind,
  onToggleTag,
}: {
  search: string;
  onSearchChange: (next: string) => void;
  kindFilter: Set<LibraryItemKind>;
  onToggleKind: (kind: LibraryItemKind) => void;
  facets: {
    languages: string[];
    sources: string[];
    containerKinds: string[];
    tags: string[];
  };
  languageFilter: Set<string>;
  sourceFilter: Set<string>;
  containerKindFilter: Set<string>;
  tagFilter: Set<string>;
  onToggleLanguage: (value: string) => void;
  onToggleSource: (value: string) => void;
  onToggleContainerKind: (value: string) => void;
  onToggleTag: (value: string) => void;
}): JSX.Element {
  const kinds: LibraryItemKind[] = ["agent", "skill", "workflow", "example"];
  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search id, name, description, tags, language..."
        style={{
          background: "var(--bg)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "10px 12px",
          fontFamily: "inherit",
          fontSize: 13,
        }}
      />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {kinds.map((kind) => {
          const active = kindFilter.has(kind);
          return (
            <button
              key={kind}
              className="button ghost"
              onClick={() => onToggleKind(kind)}
              style={{
                padding: "6px 10px",
                borderColor: active ? "var(--accent)" : "var(--border)",
                color: active ? "var(--accent)" : "var(--text)",
              }}
            >
              {kind}
            </button>
          );
        })}
      </div>
      <FacetRow
        label="Language"
        values={facets.languages}
        active={languageFilter}
        onToggle={onToggleLanguage}
      />
      <FacetRow
        label="Source"
        values={facets.sources}
        active={sourceFilter}
        onToggle={onToggleSource}
      />
      <FacetRow
        label="Container"
        values={facets.containerKinds}
        active={containerKindFilter}
        onToggle={onToggleContainerKind}
      />
      <FacetRow
        label="Tag"
        values={facets.tags}
        active={tagFilter}
        onToggle={onToggleTag}
      />
    </div>
  );
}

function FacetRow({
  label,
  values,
  active,
  onToggle,
}: {
  label: string;
  values: string[];
  active: Set<string>;
  onToggle: (value: string) => void;
}): JSX.Element {
  if (values.length === 0) return <></>;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div className="muted" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {values.map((value) => {
          const isActive = active.has(value);
          return (
            <button
              key={value}
              className="button ghost"
              onClick={() => onToggle(value)}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                borderColor: isActive ? "var(--accent)" : "var(--border)",
                color: isActive ? "var(--accent)" : "var(--text)",
              }}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

