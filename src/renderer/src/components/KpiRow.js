import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Four KPI cards along the top of the Board surface. Markup mirrors
 * NewUI/Mission Control Design System/ui_kits/mission-control/index.html:
 *
 *   .kpi-card
 *     .label   — uppercase tracked label
 *     .value   — large tabular number / string
 *     .delta   — optional secondary line (.up green / .down red)
 *
 * Values come from useKpis() (real numbers in normal mode, canned
 * mockup numbers in demo mode).
 */
import { useKpis } from "../hooks/useKpis";
export function KpiRow() {
    const { kpis } = useKpis();
    return (_jsx("section", { className: "card-grid", style: { gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 14 }, children: kpis.map((k) => (_jsxs("div", { className: "kpi-card", children: [_jsx("div", { className: "label", children: k.label }), _jsx("div", { className: "value", children: k.value }), k.delta && (_jsx("div", { className: `delta${k.deltaTone ? ` ${k.deltaTone}` : ""}`, children: k.delta }))] }, k.label))) }));
}
