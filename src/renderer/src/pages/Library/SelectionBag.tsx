import type { LibraryIndexItem } from "../../types/library";

export function SelectionBag({
  selected,
  templateWorkflowId,
  onClear,
}: {
  selected: LibraryIndexItem[];
  templateWorkflowId: string | null;
  onClear: () => void;
}): JSX.Element {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3>Selection Bag</h3>
        <button className="button ghost" onClick={onClear} disabled={selected.length === 0}>
          Clear
        </button>
      </div>
      {selected.length === 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>
          Nothing selected yet.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {selected.map((item) => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
              <span>
                {item.name}
                {templateWorkflowId === item.id ? " ★" : ""}
              </span>
              <span className="muted">{item.kind}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

