/**
 * App shell — 3 columns (Sidebar | Main | RightBar). Main content swaps
 * based on the current view id. Sidebar + RightBar persist across views.
 *
 * Router: see ./router.ts. Just a React context with {view, setView}.
 * Simple enough that we don't need React Router or history API.
 */
import { useState } from "react";

import { Sidebar } from "./components/Sidebar";
import { RightBar } from "./components/RightBar";
import { Toaster } from "./components/Toaster";

import { Dashboard } from "./pages/Dashboard";
import { LibraryBrowser } from "./pages/Library";
import { ProjectDetail } from "./pages/ProjectDetail";
import { TaskDetail } from "./pages/TaskDetail";
import { Metrics } from "./pages/Metrics";
import { SettingsGlobal } from "./pages/Settings";

import { RouteContext, type ViewId } from "./router";

// `window.mc` type is declared in ./global.d.ts — preload exposes it.

function CurrentView({ view }: { view: ViewId }): JSX.Element {
  switch (view) {
    case "dashboard":           return <Dashboard />;
    case "library":             return <LibraryBrowser />;
    case "project":             return <ProjectDetail />;
    case "task":                return <TaskDetail />;
    case "metrics":             return <Metrics />;
    case "settings-global":     return <SettingsGlobal />;
  }
}

export function App(): JSX.Element {
  const [view, setView] = useState<ViewId>("dashboard");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const openTask = (id: string): void => {
    setSelectedTaskId(id);
    setView("task");
  };
  const openProject = (id: string): void => {
    setSelectedProjectId(id);
    setView("project");
  };

  return (
    <RouteContext.Provider
      value={{
        view,
        selectedTaskId,
        selectedProjectId,
        setView,
        openTask,
        openProject,
      }}
    >
      <>
        <div className="app-shell">
          <Sidebar />
          <main className="main">
            <CurrentView view={view} />
          </main>
          <RightBar />
        </div>
        <Toaster />
      </>
    </RouteContext.Provider>
  );
}
