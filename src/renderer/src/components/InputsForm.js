import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo } from "react";
export function InputsForm({ schema, value, onChange, }) {
    const parsed = useMemo(() => normalizeSchema(schema), [schema]);
    if (!parsed || parsed.type !== "object" || !parsed.properties) {
        return (_jsx("textarea", { rows: 8, value: JSON.stringify(value, null, 2), onChange: (e) => {
                try {
                    const parsedJson = JSON.parse(e.target.value);
                    onChange(parsedJson);
                }
                catch {
                    // Keep text editable; invalid JSON is handled in caller validation.
                }
            }, style: inputStyle }));
    }
    const required = new Set(parsed.required ?? []);
    const entries = Object.entries(parsed.properties);
    return (_jsx("div", { style: { display: "grid", gap: 10 }, children: entries.map(([key, prop]) => (_jsx(SchemaField, { name: key, schema: prop, required: required.has(key), value: value[key], onChange: (fieldValue) => onChange({ ...value, [key]: fieldValue }) }, key))) }));
}
function SchemaField({ name, schema, required, value, onChange, }) {
    const type = schema.type ?? "string";
    const label = schema.title ?? name;
    const help = schema.description ?? "";
    const current = value ?? schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length > 0) {
        return (_jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsxs("label", { className: "muted", style: { fontSize: 12 }, children: [label, " ", required ? "*" : ""] }), _jsxs("select", { value: String(current ?? ""), onChange: (e) => onChange(e.target.value), style: inputStyle, children: [_jsx("option", { value: "", children: "(select)" }), schema.enum.map((option) => (_jsx("option", { value: String(option), children: String(option) }, String(option))))] }), help && _jsx("div", { className: "muted", style: { fontSize: 11 }, children: help })] }));
    }
    if (type === "number" || type === "integer") {
        return (_jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsxs("label", { className: "muted", style: { fontSize: 12 }, children: [label, " ", required ? "*" : ""] }), _jsx("input", { type: "number", value: current === undefined || current === null ? "" : String(current), onChange: (e) => {
                        const raw = e.target.value.trim();
                        if (!raw)
                            onChange(undefined);
                        else
                            onChange(Number(raw));
                    }, style: inputStyle }), help && _jsx("div", { className: "muted", style: { fontSize: 11 }, children: help })] }));
    }
    if (type === "boolean") {
        return (_jsxs("label", { style: { display: "flex", gap: 8, alignItems: "center", fontSize: 13 }, children: [_jsx("input", { type: "checkbox", checked: Boolean(current), onChange: (e) => onChange(e.target.checked) }), label, " ", required ? "*" : ""] }));
    }
    if (type === "string" && looksMultiline(name, schema)) {
        return (_jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsxs("label", { className: "muted", style: { fontSize: 12 }, children: [label, " ", required ? "*" : ""] }), _jsx("textarea", { rows: 4, value: current === undefined || current === null ? "" : String(current), onChange: (e) => onChange(e.target.value), style: inputStyle }), help && _jsx("div", { className: "muted", style: { fontSize: 11 }, children: help })] }));
    }
    return (_jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsxs("label", { className: "muted", style: { fontSize: 12 }, children: [label, " ", required ? "*" : ""] }), _jsx("input", { type: "text", value: current === undefined || current === null ? "" : String(current), onChange: (e) => onChange(e.target.value), style: inputStyle }), help && _jsx("div", { className: "muted", style: { fontSize: 11 }, children: help })] }));
}
function normalizeSchema(value) {
    if (!value || typeof value !== "object")
        return null;
    return value;
}
function looksMultiline(name, schema) {
    const low = `${name} ${schema.title ?? ""} ${schema.description ?? ""}`.toLowerCase();
    return low.includes("description") || low.includes("prompt") || low.includes("text") || low.includes("content");
}
const inputStyle = {
    background: "var(--bg)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "8px 10px",
    fontFamily: "inherit",
    fontSize: 13,
    width: "100%",
};
