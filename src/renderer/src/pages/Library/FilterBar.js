import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Library page search input.
 *
 * Was a 5-facet filter (kind chips + Language / Source / Container / Tag
 * chips). The chip groups were removed because they read as noise:
 *   - Language values weren't programming languages — they were name-
 *     derived semantic labels ("change-expert", "accessibility-test-
 *     runner"), which made the facet useless.
 *   - Container was redundant with the kind-tab + folder tree.
 *   - Tags were sparsely populated (mostly only on specializations/*).
 *   - Kind chips overlapped with the new kind-tab accordion in Tree.tsx.
 *
 * The search input still matches against id, name, description,
 * logicalPath, role, originalSource.repo, tags, languages, expertise
 * (see useLibraryIndex.ts). So tag- and language-style terms remain
 * reachable as free-text searches even though the toggle pills are gone.
 *
 * Future direction: per-group multi-select dropdowns (e.g. one Tag
 * dropdown, one Language dropdown). Hook state in useLibraryIndex.ts
 * is left in place for that follow-up — it's just unused today.
 */
export function FilterBar({ search, onSearchChange, }) {
    return (_jsxs("div", { className: "card", style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("span", { className: "muted", style: { fontSize: 11, minWidth: 60 }, children: "Search" }), _jsx("input", { value: search, onChange: (e) => onSearchChange(e.target.value), placeholder: "Search id, name, description, tags, language\u2026", style: {
                    flex: 1,
                    background: "var(--bg)",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "10px 12px",
                    fontFamily: "inherit",
                    fontSize: 13,
                } }), search && (_jsx("button", { className: "button ghost", onClick: () => onSearchChange(""), title: "Clear search", style: { padding: "6px 10px", fontSize: 12 }, children: "\u2715" }))] }));
}
