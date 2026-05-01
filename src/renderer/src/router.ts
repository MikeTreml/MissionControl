/**
 * Dumb in-app router — no React Router, no history API. Just a string view id
 * plus optional selected ids held in React state, passed through context.
 *
 * Why so small: the app has ~8 views, navigation is a sidebar click away,
 * deep-linking isn't useful for a desktop tool. Upgrading later is easy.
 */
import { createContext, useContext } from "react";

export type ViewId =
  | "dashboard"
  | "library"
  | "project"
  | "task"
  | "settings-global"
  | "metrics"
  | "run-history"
  | "handoffs";

export interface Route {
  view: ViewId;
  selectedTaskId: string | null;
  selectedProjectId: string | null;
  setView: (v: ViewId) => void;
  /** Convenience: go to Task Detail for a specific id. */
  openTask: (taskId: string) => void;
  /** Convenience: go to Project Detail for a specific id. */
  openProject: (projectId: string) => void;
}

export const RouteContext = createContext<Route>({
  view: "dashboard",
  selectedTaskId: null,
  selectedProjectId: null,
  setView: () => {},
  openTask: () => {},
  openProject: () => {},
});

export function useRoute(): Route {
  return useContext(RouteContext);
}
