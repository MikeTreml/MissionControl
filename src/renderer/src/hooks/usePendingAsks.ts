/**
 * usePendingAsks — drives the AskUserCard list on Task Detail.
 *
 * Two data sources:
 *   1. window.mc.listPendingAsks(taskId) on mount — seeds the card list
 *      so refreshing the page or navigating in mid-ask still shows it.
 *   2. window.mc.onTaskEvent — picks up `pi:awaiting_input` (new ask),
 *      `pi:input_answered` (drop the answered ask), and `run-ended` (drop
 *      anything left).
 *
 * Returns the current list of pending asks for the given task. Empty
 * array when no asks (or no bridge / demo mode).
 */
import { useEffect, useState } from "react";

import { useSubscribe } from "./data-bus";
import type { PendingAskInfo } from "../global";

export function usePendingAsks(taskId: string | null): PendingAskInfo[] {
  const [asks, setAsks] = useState<PendingAskInfo[]>([]);

  async function refresh(): Promise<void> {
    if (!taskId || !window.mc) {
      setAsks([]);
      return;
    }
    try {
      const list = await window.mc.listPendingAsks(taskId);
      setAsks(list);
    } catch {
      setAsks([]);
    }
  }

  useEffect(() => { void refresh(); }, [taskId]);

  // Refetch whenever any consumer publishes "tasks" (answer / cancel routes
  // through here, plus arbitrary saves). Lightweight — just a single IPC.
  useSubscribe("tasks", () => { void refresh(); });

  // Live: subscribe to per-task events so a fresh ask appears without
  // waiting for the next data-bus tick.
  useEffect(() => {
    if (!taskId || !window.mc) return;
    const unsubscribe = window.mc.onTaskEvent(({ taskId: tid, event }) => {
      if (tid !== taskId) return;
      if (
        event.type === "pi:awaiting_input" ||
        event.type === "pi:input_answered" ||
        event.type === "run-ended"
      ) {
        void refresh();
      }
    });
    return unsubscribe;
  }, [taskId]);

  return asks;
}
