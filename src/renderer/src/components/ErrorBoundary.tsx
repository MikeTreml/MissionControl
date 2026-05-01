/**
 * Renderer-wide error boundary — keeps a crash in any component from
 * rendering a white screen. Shows the error message + stack + a
 * "reload" button. Logs to the DevTools console so the main-process
 * terminal doesn't need to be open.
 *
 * Intentionally class-based: React's error-boundary hook (`useErrorBoundary`)
 * only exists in experimental builds + third-party libs.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] caught:", error, info);
    this.setState({ error, info });
  }

  reset = (): void => this.setState({ error: null, info: null });

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          padding: 24,
          background: "var(--bg)",
          color: "var(--text)",
          fontFamily: "inherit",
          height: "100vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            maxWidth: 900,
            margin: "40px auto",
            padding: 24,
            border: "1px solid var(--bad)",
            borderRadius: 12,
            background: "rgba(232, 116, 116,0.06)",
          }}
        >
          <h1 style={{ marginTop: 0, color: "var(--bad)" }}>
            ⚠ Renderer crashed
          </h1>
          <p className="muted" style={{ fontSize: 13 }}>
            A React component threw and the UI couldn't recover on its own.
            The error is logged in DevTools. Copy the message + stack below
            into an issue, then click Reload.
          </p>
          <div
            style={{
              margin: "14px 0 4px",
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "var(--muted)",
            }}
          >
            Message
          </div>
          <pre
            style={{
              padding: 12,
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 13,
              whiteSpace: "pre-wrap",
              margin: 0,
            }}
          >
            {this.state.error.message}
          </pre>
          {this.state.error.stack && (
            <>
              <div
                style={{
                  margin: "14px 0 4px",
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  color: "var(--muted)",
                }}
              >
                Stack
              </div>
              <pre
                style={{
                  padding: 12,
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  margin: 0,
                  maxHeight: 260,
                  overflow: "auto",
                }}
              >
                {this.state.error.stack}
              </pre>
            </>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="button" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button className="button ghost" onClick={this.reset}>
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
