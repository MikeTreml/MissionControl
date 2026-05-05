import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useRoute } from "../router";
export function PageStub({ title, purpose, plan, children, }) {
    const { setView } = useRoute();
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: "topbar", children: [_jsxs("div", { children: [_jsx("h1", { children: title }), _jsx("p", { className: "muted", children: purpose })] }), _jsx("button", { className: "button ghost", onClick: () => setView("dashboard"), children: "\u2190 Dashboard" })] }), _jsxs("div", { className: "content", children: [children, plan && (_jsxs("section", { className: "card", style: { borderStyle: "dashed" }, children: [_jsx("h3", { children: "Page plan" }), _jsx("div", { style: { marginTop: 8 }, className: "muted", children: plan })] }))] })] }));
}
