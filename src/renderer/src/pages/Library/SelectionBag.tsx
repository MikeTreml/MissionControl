import type { LibraryIndexItem } from "../../types/library";

export function SelectionBag({
  selected,
  templateWorkflowId,
  onClear,
  onRemove,
}: {
  selected: LibraryIndexItem[];
  templateWorkflowId: string | null;
  onClear: () => void;
  onRemove: (id: string) => void;
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
            <div key={item.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 12 }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.logicalPath}>
                {item.name}
                {templateWorkflowId === item.id ? " ★" : ""}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span className="muted">{item.kind}</span>
                <button
                  className="button ghost"
                  onClick={() => onRemove(item.id)}
                  title={`Remove ${item.name} from selection`}
                  style={{ padding: "2px 7px", fontSize: 12, lineHeight: 1.2 }}
                >
                  ×
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

