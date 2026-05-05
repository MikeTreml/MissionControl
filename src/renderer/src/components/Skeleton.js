import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SkeletonLine({ width = "100%", height = "1em", marginBottom = 0 }) {
    return (_jsx("span", { className: "skeleton block", style: { width, height, marginBottom }, "aria-hidden": "true" }));
}
export function SkeletonBlock({ width = "100%", height = 80, borderRadius = 8 }) {
    return (_jsx("span", { className: "skeleton block", style: { width, height, borderRadius }, "aria-hidden": "true" }));
}
export function SkeletonRows({ rows = 3, widths }) {
    const w = widths ?? ["90%", "75%", "60%", "85%", "50%"];
    return (_jsx("div", { style: { display: "grid", gap: 8 }, "aria-hidden": "true", children: Array.from({ length: rows }, (_, i) => (_jsx(SkeletonLine, { width: w[i % w.length], height: "0.95em" }, i))) }));
}
/**
 * Card-shaped placeholder — title + meta + body line. Mimics TaskCard's
 * approximate height so the layout doesn't shift when real data arrives.
 */
export function SkeletonCard() {
    return (_jsxs("div", { className: "task", style: { display: "grid", gap: 8, cursor: "default" }, "aria-hidden": "true", children: [_jsx(SkeletonLine, { width: "40%", height: "0.95em" }), _jsx(SkeletonLine, { width: "85%", height: "0.85em" }), _jsx(SkeletonLine, { width: "55%", height: "0.75em" })] }));
}
