import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRoute } from "../router";
import { useToasts } from "../hooks/useToasts";
export function Toaster() {
    const { toasts, dismiss } = useToasts();
    const { openTask } = useRoute();
    if (toasts.length === 0)
        return _jsx(_Fragment, {});
    return (_jsx("div", { className: "toaster", "aria-live": "polite", "aria-atomic": "true", children: toasts.map((toast) => (_jsxs("div", { className: "toast", "data-tone": toast.tone, onClick: () => openTask(toast.taskId), onKeyDown: (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openTask(toast.taskId);
                }
            }, title: `Open task ${toast.taskId}`, role: "button", tabIndex: 0, children: [_jsxs("div", { className: "toast-row", children: [_jsx("strong", { children: toast.title }), _jsx("button", { className: "toast-close", onClick: (e) => {
                                e.stopPropagation();
                                dismiss(toast.id);
                            }, "aria-label": `Dismiss toast for ${toast.taskId}`, type: "button", children: "\u00D7" })] }), _jsx("div", { className: "sub", style: { marginTop: 4 }, children: toast.detail })] }, toast.id))) }));
}
