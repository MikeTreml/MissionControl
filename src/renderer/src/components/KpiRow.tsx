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

export function KpiRow(): JSX.Element {
  const { kpis } = useKpis();
  return (
    <section className="card-grid dashboard-kpi-grid">
      {kpis.map((k) => (
        <div key={k.label} className="kpi-card">
          <div className="label">{k.label}</div>
          <div className="value">{k.value}</div>
          {k.delta && (
            <div className={`delta${k.deltaTone ? ` ${k.deltaTone}` : ""}`}>
              {k.delta}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
