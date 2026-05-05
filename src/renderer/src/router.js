/**
 * Dumb in-app router — no React Router, no history API. Just a string view id
 * plus optional selected ids held in React state, passed through context.
 *
 * Why so small: the app has ~8 views, navigation is a sidebar click away,
 * deep-linking isn't useful for a desktop tool. Upgrading later is easy.
 */
import { createContext, useContext } from "react";
export const RouteContext = createContext({
    view: "dashboard",
    selectedTaskId: null,
    selectedProjectId: null,
    setView: () => { },
    openTask: () => { },
    openProject: () => { },
});
export function useRoute() {
    return useContext(RouteContext);
}
