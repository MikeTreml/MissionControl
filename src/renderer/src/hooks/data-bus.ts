/**
 * Tiny in-process pub/sub so multiple hook instances stay in sync.
 *
 * Problem it solves: useProjects() is called in Sidebar, Topbar, ProjectDetail,
 * AddProjectForm, etc. Each call creates its own useState + useEffect. When
 * the form calls its own refresh() after createProject, only that component
 * re-fetches. The Sidebar keeps showing stale data.
 *
 * With this bus: hooks subscribe to a topic; after a mutation anywhere in
 * the app, `publish(topic)` fires — every subscriber re-fetches.
 */
import { useEffect, useRef } from "react";

export type Topic = "projects" | "tasks" | "models" | "agents" | "workflows" | "settings";

const subscribers = new Map<Topic, Set<() => void>>();

/** Fire all subscribers for a topic. Safe to call anywhere (sync). */
export function publish(topic: Topic): void {
  console.log(`[data-bus] publish "${topic}" →`, subscribers.get(topic)?.size ?? 0, "subscribers");
  subscribers.get(topic)?.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      console.error(`[data-bus] subscriber for "${topic}" threw:`, err);
    }
  });
}

/**
 * Subscribe to a topic for the lifetime of the component. The handler ref
 * is captured via useRef so callers don't need useCallback to avoid
 * re-subscribing every render.
 */
export function useSubscribe(topic: Topic, handler: () => void): void {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const stable = () => ref.current();
    let set = subscribers.get(topic);
    if (!set) {
      set = new Set();
      subscribers.set(topic, set);
    }
    set.add(stable);
    return () => { set!.delete(stable); };
  }, [topic]);
}
