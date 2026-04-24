/**
 * Shared stub layout for pages that aren't built yet.
 * Keeps a consistent topbar (title + "← Dashboard" link) and a placeholder
 * card describing what the page will eventually do. Swap real content in
 * as each page is filled.
 */
import type { ReactNode } from "react";
import { useRoute } from "../router";

export function PageStub({
  title,
  purpose,
  plan,
  children,
}: {
  title: string;
  purpose: string;
  plan?: ReactNode;
  children?: ReactNode;
}): JSX.Element {
  const { setView } = useRoute();
  return (
    <>
      <div className="topbar">
        <div>
          <h1>{title}</h1>
          <p className="muted">{purpose}</p>
        </div>
        <button
          className="button ghost"
          onClick={() => setView("dashboard")}
        >
          ← Dashboard
        </button>
      </div>
      <div className="content">
        {children}
        {plan && (
          <section className="card" style={{ borderStyle: "dashed" }}>
            <h3>Page plan</h3>
            <div style={{ marginTop: 8 }} className="muted">
              {plan}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
