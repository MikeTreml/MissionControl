import { useMemo } from "react";
import type { CSSProperties } from "react";

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  default?: unknown;
  enum?: unknown[];
  title?: string;
  description?: string;
};

export function InputsForm({
  schema,
  value,
  onChange,
}: {
  schema: Record<string, unknown> | null;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}): JSX.Element {
  const parsed = useMemo(() => normalizeSchema(schema), [schema]);
  if (!parsed || parsed.type !== "object" || !parsed.properties) {
    return (
      <textarea
        rows={8}
        value={JSON.stringify(value, null, 2)}
        onChange={(e) => {
          try {
            const parsedJson = JSON.parse(e.target.value) as Record<string, unknown>;
            onChange(parsedJson);
          } catch {
            // Keep text editable; invalid JSON is handled in caller validation.
          }
        }}
        style={inputStyle}
      />
    );
  }

  const required = new Set(parsed.required ?? []);
  const entries = Object.entries(parsed.properties);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {entries.map(([key, prop]) => (
        <SchemaField
          key={key}
          name={key}
          schema={prop}
          required={required.has(key)}
          value={value[key]}
          onChange={(fieldValue) => onChange({ ...value, [key]: fieldValue })}
        />
      ))}
    </div>
  );
}

function SchemaField({
  name,
  schema,
  required,
  value,
  onChange,
}: {
  name: string;
  schema: JsonSchema;
  required: boolean;
  value: unknown;
  onChange: (next: unknown) => void;
}): JSX.Element {
  const type = schema.type ?? "string";
  const label = schema.title ?? name;
  const help = schema.description ?? "";
  const current = value ?? schema.default;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <label className="muted" style={{ fontSize: 12 }}>
          {label} {required ? "*" : ""}
        </label>
        <select
          value={String(current ?? "")}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        >
          <option value="">(select)</option>
          {schema.enum.map((option) => (
            <option key={String(option)} value={String(option)}>
              {String(option)}
            </option>
          ))}
        </select>
        {help && <div className="muted" style={{ fontSize: 11 }}>{help}</div>}
      </div>
    );
  }
  if (type === "number" || type === "integer") {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <label className="muted" style={{ fontSize: 12 }}>
          {label} {required ? "*" : ""}
        </label>
        <input
          type="number"
          value={current === undefined || current === null ? "" : String(current)}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) onChange(undefined);
            else onChange(Number(raw));
          }}
          style={inputStyle}
        />
        {help && <div className="muted" style={{ fontSize: 11 }}>{help}</div>}
      </div>
    );
  }
  if (type === "boolean") {
    return (
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
        <input
          type="checkbox"
          checked={Boolean(current)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label} {required ? "*" : ""}
      </label>
    );
  }
  if (type === "string" && looksMultiline(name, schema)) {
    return (
      <div style={{ display: "grid", gap: 4 }}>
        <label className="muted" style={{ fontSize: 12 }}>
          {label} {required ? "*" : ""}
        </label>
        <textarea
          rows={4}
          value={current === undefined || current === null ? "" : String(current)}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
        />
        {help && <div className="muted" style={{ fontSize: 11 }}>{help}</div>}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label className="muted" style={{ fontSize: 12 }}>
        {label} {required ? "*" : ""}
      </label>
      <input
        type="text"
        value={current === undefined || current === null ? "" : String(current)}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
      {help && <div className="muted" style={{ fontSize: 11 }}>{help}</div>}
    </div>
  );
}

function normalizeSchema(value: Record<string, unknown> | null): JsonSchema | null {
  if (!value || typeof value !== "object") return null;
  return value as JsonSchema;
}

function looksMultiline(name: string, schema: JsonSchema): boolean {
  const low = `${name} ${schema.title ?? ""} ${schema.description ?? ""}`.toLowerCase();
  return low.includes("description") || low.includes("prompt") || low.includes("text") || low.includes("content");
}

const inputStyle: CSSProperties = {
  background: "var(--bg)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 10px",
  fontFamily: "inherit",
  fontSize: 13,
  width: "100%",
};

