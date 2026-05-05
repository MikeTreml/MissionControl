/**
 * useProjects — calls window.mc.listProjects().
 *
 * Two important behaviors:
 *   1. If `window.mc` isn't available (tests, static preview, first boot
 *      before preload), returns the mock list with `isDemo: true` so the
 *      wireframe stays alive.
 *   2. If the real store returns [], same demo default — otherwise every new
 *      user boots into an empty dashboard, which looks broken.
 *
 * When the user creates a real project, this re-fetches and the demo flag
 * flips off.
 */
import { useEffect, useMemo, useState } from "react";
import { mockProjects } from "../mock-data";
import { useSubscribe } from "./data-bus";
import { useSettings } from "./useSettings";
function toUiProject(p) {
    const sourceHint = p.gitInfo.kind !== "none" && p.gitInfo.label
        ? p.gitInfo.label
        : p.path || "(no path)";
    return {
        id: p.id,
        name: p.name,
        prefix: p.prefix,
        icon: p.icon,
        path: p.path,
        notes: p.notes,
        sourceHint,
        stats: "—",
        isSample: p.isSample === true,
    };
}
function mockToUi(p) {
    return {
        id: p.id,
        name: p.name,
        prefix: p.prefix,
        icon: "",
        path: "",
        notes: "",
        sourceHint: p.source,
        stats: p.stats,
        active: p.active,
        isSample: false,
    };
}
export function useProjects() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isDemo, setIsDemo] = useState(false);
    const [error, setError] = useState(null);
    async function load() {
        try {
            setLoading(true);
            if (!window.mc) {
                setProjects(mockProjects.map(mockToUi));
                setIsDemo(true);
                return;
            }
            const real = await window.mc.listProjects();
            if (real.length === 0) {
                setProjects(mockProjects.map(mockToUi));
                setIsDemo(true);
            }
            else {
                setProjects(real.map(toUiProject));
                setIsDemo(false);
            }
        }
        catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
            setProjects(mockProjects.map(mockToUi));
            setIsDemo(true);
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void load();
    }, []);
    // Re-fetch when any mutation publishes "projects" (or tasks, which affect
    // project stats).
    useSubscribe("projects", () => { void load(); });
    useSubscribe("tasks", () => { void load(); });
    // Filter sample projects when the user has hidden them.
    const { showSampleData } = useSettings();
    const visible = useMemo(() => (showSampleData ? projects : projects.filter((p) => !p.isSample)), [projects, showSampleData]);
    return { projects: visible, loading, isDemo, error, refresh: load };
}
