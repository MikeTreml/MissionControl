/**
 * Four KPI cards along the top of the main content area.
 * Values come from useKpis() (derived from useTasks()); mock defaults in
 * demo mode.
 */
import { useKpis } from "../hooks/useKpis";

export function KpiRow(): JSX.Element {
  const { kpis } = useKpis();
  return (
    <section className="card-grid compact-kpis">
      {kpis.map((k) => (
        <div key={k.label} className="card" style={{ padding: "10px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>{k.label}</div>
            <div className="kpi" style={{ marginTop: 0 }}>{k.value}</div>
          </div>
        </div>
      ))}
    </section>
  );
}
