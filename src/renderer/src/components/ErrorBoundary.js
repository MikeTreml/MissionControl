import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Renderer-wide error boundary — keeps a crash in any component from
 * rendering a white screen. Shows the error message + stack + a
 * "reload" button. Logs to the DevTools console so the main-process
 * terminal doesn't need to be open.
 *
 * Intentionally class-based: React's error-boundary hook (`useErrorBoundary`)
 * only exists in experimental builds + third-party libs.
 */
import { Component } from "react";
export class ErrorBoundary extends Component {
    state = { error: null, info: null };
    static getDerivedStateFromError(error) {
        return { error, info: null };
    }
    componentDidCatch(error, info) {
        console.error("[ErrorBoundary] caught:", error, info);
        this.setState({ error, info });
    }
    reset = () => this.setState({ error: null, info: null });
    render() {
        if (!this.state.error)
            return this.props.children;
        return (_jsx("div", { style: {
                padding: 24,
                background: "var(--bg)",
                color: "var(--text)",
                fontFamily: "inherit",
                height: "100vh",
                overflow: "auto",
            }, children: _jsxs("div", { style: {
                    maxWidth: 900,
                    margin: "40px auto",
                    padding: 24,
                    border: "1px solid var(--bad)",
                    borderRadius: 12,
                    background: "rgba(232, 116, 116,0.06)",
                }, children: [_jsx("h1", { style: { marginTop: 0, color: "var(--bad)" }, children: "\u26A0 Renderer crashed" }), _jsx("p", { className: "muted", style: { fontSize: 13 }, children: "A React component threw and the UI couldn't recover on its own. The error is logged in DevTools. Copy the message + stack below into an issue, then click Reload." }), _jsx("div", { style: {
                            margin: "14px 0 4px",
                            fontSize: 12,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                            color: "var(--muted)",
                        }, children: "Message" }), _jsx("pre", { style: {
                            padding: 12,
                            background: "var(--panel-2)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 13,
                            whiteSpace: "pre-wrap",
                            margin: 0,
                        }, children: this.state.error.message }), this.state.error.stack && (_jsxs(_Fragment, { children: [_jsx("div", { style: {
                                    margin: "14px 0 4px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    textTransform: "uppercase",
                                    letterSpacing: 0.5,
                                    color: "var(--muted)",
                                }, children: "Stack" }), _jsx("pre", { style: {
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
                                }, children: this.state.error.stack })] })), _jsxs("div", { style: { display: "flex", gap: 8, marginTop: 16 }, children: [_jsx("button", { className: "button", onClick: () => window.location.reload(), children: "Reload" }), _jsx("button", { className: "button ghost", onClick: this.reset, children: "Try again" })] })] }) }));
    }
}
