/**
 * Four KPI cards along the top of the main content area.
 * Values come from useKpis() (derived from useTasks()); mock fallback when
 * demo mode.
 */
import { useKpis } from "../hooks/useKpis";

export function KpiRow(): JSX.Element {
  const { kpis } = useKpis();
  return (
    <section className="card-grid">
      {kpis.map((k) => (
        <div key={k.label} className="card">
          <div className="muted">{k.label}</div>
          <div className="kpi">{k.value}</div>
        </div>
      ))}
    </section>
  );
}
