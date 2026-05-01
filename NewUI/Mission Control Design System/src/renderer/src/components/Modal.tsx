/**
 * Tiny modal primitive — no library. Renders a fixed-position backdrop
 * with a centered panel. Closes on Esc, backdrop click, or the X button.
 * Keyboard focus is NOT trapped (we're one-keyboard app; keep simple).
 */
import { useEffect, type ReactNode } from "react";

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      // NOTE: backdrop click does NOT close the modal. User flows often
      // need to tab out (e.g. to look up a URL) and come back; closing on
      // focus loss loses work. Only Esc and the ✕/buttons dismiss.
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        style={{
          width: 520, maxWidth: "calc(100vw - 40px)", maxHeight: "85vh",
          overflow: "auto",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 14, padding: 20,
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center",
            justifyContent: "space-between", marginBottom: 12,
          }}
        >
          <h2>{title}</h2>
          <button
            onClick={onClose}
            className="button ghost"
            style={{ padding: "4px 10px" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
