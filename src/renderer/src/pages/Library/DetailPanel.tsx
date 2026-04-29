import type { LibraryIndexItem } from "../../types/library";

export function DetailPanel({
  item,
  onRawJson,
}: {
  item: LibraryIndexItem | null;
  onRawJson: (item: LibraryIndexItem) => void;
}): JSX.Element {
  return (
    <div className="card" style={{ minHeight: 480 }}>
      <h3 style={{ marginBottom: 10 }}>Detail</h3>
      {!item && (
        <p className="muted" style={{ fontSize: 13 }}>
          Select an item to inspect metadata.
        </p>
      )}
      {item && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="button ghost"
              onClick={() => void navigator.clipboard?.writeText(item.logicalPath)}
            >
              Copy logical path
            </button>
            <button
              className="button ghost"
              onClick={() => void window.mc?.openPath(item.diskPath)}
            >
              Open source
            </button>
            <button className="button ghost" onClick={() => onRawJson(item)}>
              View raw JSON
            </button>
          </div>
          <Field label="Name" value={item.name} />
          <Field label="Kind" value={item.kind} />
          <Field label="Logical path" value={item.logicalPath} mono />
          <Field label="Container" value={item.container ?? "(none)"} />
          <Field label="Container kind" value={item.containerKind ?? "(none)"} />
          <Field label="Description" value={item.description ?? "(none)"} />
          <Field label="Languages" value={item.languages.join(", ") || "(none)"} />
          <Field label="Tags" value={item.tags.join(", ") || "(none)"} />
          <Field label="Role" value={item.role ?? "(none)"} />
          <Field label="Source" value={item.originalSource?.repo ?? "(none)"} />
          {item.kind === "workflow" && (
            <>
              <Field label="Estimated steps" value={String(item.estimatedSteps ?? 0)} />
              <Field label="Has parallel" value={item.hasParallel ? "yes" : "no"} />
              <Field label="Has breakpoints" value={item.hasBreakpoints ? "yes" : "no"} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontFamily: mono ? "Consolas, monospace" : "inherit", wordBreak: "break-word" }}>
        {value}
      </div>
    </div>
  );
}

