import { useRoute } from "../router";
import { useToasts } from "../hooks/useToasts";

export function Toaster(): JSX.Element {
  const { toasts, dismiss } = useToasts();
  const { openTask } = useRoute();

  if (toasts.length === 0) return <></>;

  return (
    <div className="toaster" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="toast"
          data-tone={toast.tone}
          onClick={() => openTask(toast.taskId)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openTask(toast.taskId);
            }
          }}
          title={`Open task ${toast.taskId}`}
          role="button"
          tabIndex={0}
        >
          <div className="toast-row">
            <strong>{toast.title}</strong>
            <button
              className="toast-close"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(toast.id);
              }}
              aria-label={`Dismiss toast for ${toast.taskId}`}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="sub" style={{ marginTop: 4 }}>{toast.detail}</div>
        </div>
      ))}
    </div>
  );
}
