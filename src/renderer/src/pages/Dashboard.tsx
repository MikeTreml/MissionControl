/**
 * Dashboard — the home view. Composes the same components we already built:
 * Topbar + KpiRow + Board + SelectedTaskPanel, in the content column.
 *
 * Sidebar and RightBar live in App.tsx because they're persistent across
 * every view, not dashboard-specific.
 */
import { Topbar } from "../components/Topbar";
import { KpiRow } from "../components/KpiRow";
import { Board } from "../components/Board";
import { SelectedTaskPanel } from "../components/SelectedTaskPanel";

export function Dashboard(): JSX.Element {
  return (
    <>
      <Topbar />
      <div className="content">
        <KpiRow />
        <Board />
        <SelectedTaskPanel />
      </div>
    </>
  );
}
