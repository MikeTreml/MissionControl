/**
 * React entry point for the renderer.
 * Mounts <App /> into #root and attaches the main→renderer live events
 * bridge so hook refetches fire as soon as the main process emits.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { attachLiveEventsBridge } from "./lib/live-events-bridge";

attachLiveEventsBridge();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
