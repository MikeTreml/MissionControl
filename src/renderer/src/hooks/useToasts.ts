import { useEffect, useRef, useState } from "react";

import type { TaskEvent } from "../../../shared/models";

export interface ToastItem {
  id: string;
  taskId: string;
  title: string;
  detail: string;
  tone: "info" | "good" | "warn" | "bad";
}

const MAX_VISIBLE = 3;
const DEFAULT_MS = 5000;
const LONG_MS = 8000;

export function useToasts(): {
  toasts: ToastItem[];
  dismiss: (id: string) => void;
} {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    if (!window.mc) return;
    const unsubscribe = window.mc.onTaskEvent(({ taskId, event }) => {
      const next = toToast(taskId, event);
      if (!next) return;
      setToasts((prev) => [next, ...prev].slice(0, MAX_VISIBLE));
      const ms = next.tone === "bad" || event.type === "pi:awaiting_input" ? LONG_MS : DEFAULT_MS;
      const timer = window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== next.id));
        timers.current.delete(next.id);
      }, ms);
      timers.current.set(next.id, timer);
    });
    return () => {
      unsubscribe();
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    };
  }, []);

  function dismiss(id: string): void {
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return { toasts, dismiss };
}

function toToast(taskId: string, event: TaskEvent): ToastItem | null {
  const id = `${taskId}:${event.timestamp}:${event.type}`;

  if (event.type === "run-started") {
    return { id, taskId, title: taskId, detail: "Run started", tone: "info" };
  }
  if (event.type === "run-ended") {
    const reason = typeof event.reason === "string" ? event.reason : "completed";
    return {
      id,
      taskId,
      title: taskId,
      detail: `Run ended — ${reason}`,
      tone: reason === "failed" ? "bad" : reason === "completed" ? "good" : "warn",
    };
  }
  if (event.type === "lane-changed") {
    const to = typeof event.to === "string" ? event.to : "updated";
    return { id, taskId, title: taskId, detail: `Moved to ${to}`, tone: "info" };
  }
  if (event.type === "pi:awaiting_input") {
    return { id, taskId, title: taskId, detail: "Needs your input", tone: "warn" };
  }
  return null;
}
