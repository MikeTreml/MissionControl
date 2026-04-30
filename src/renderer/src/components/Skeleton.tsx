/**
 * Shimmer placeholder for async loading states.
 *
 * Use one of:
 *   <SkeletonLine width="60%" />        — single shimmering line
 *   <SkeletonBlock height={120} />      — solid block (e.g. card body)
 *   <SkeletonRows rows={4} />           — stack of lines for list previews
 *   <SkeletonCard />                    — card-shaped placeholder
 *
 * CSS lives in `styles.css` under `── skeleton loaders ──`. The shimmer
 * runs continuously; consumers should swap to real content the moment
 * data arrives so the page doesn't stay visually busy.
 */

interface SkeletonLineProps {
  /** CSS width, e.g. "60%", "120px". Defaults to "100%". */
  width?: string;
  /** CSS height, e.g. "1em", 14. Defaults to "1em". */
  height?: string | number;
  /** Apply margin-bottom to space rows. Default 0. */
  marginBottom?: string | number;
}

export function SkeletonLine({ width = "100%", height = "1em", marginBottom = 0 }: SkeletonLineProps): JSX.Element {
  return (
    <span
      className="skeleton block"
      style={{ width, height, marginBottom }}
      aria-hidden="true"
    />
  );
}

interface SkeletonBlockProps {
  width?: string;
  height?: string | number;
  borderRadius?: string | number;
}

export function SkeletonBlock({ width = "100%", height = 80, borderRadius = 8 }: SkeletonBlockProps): JSX.Element {
  return (
    <span
      className="skeleton block"
      style={{ width, height, borderRadius }}
      aria-hidden="true"
    />
  );
}

interface SkeletonRowsProps {
  rows?: number;
  /** Width pattern — defaults to varied widths so rows look natural. */
  widths?: string[];
}

export function SkeletonRows({ rows = 3, widths }: SkeletonRowsProps): JSX.Element {
  const w = widths ?? ["90%", "75%", "60%", "85%", "50%"];
  return (
    <div style={{ display: "grid", gap: 8 }} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonLine key={i} width={w[i % w.length]} height="0.95em" />
      ))}
    </div>
  );
}

/**
 * Card-shaped placeholder — title + meta + body line. Mimics TaskCard's
 * approximate height so the layout doesn't shift when real data arrives.
 */
export function SkeletonCard(): JSX.Element {
  return (
    <div
      className="task"
      style={{ display: "grid", gap: 8, cursor: "default" }}
      aria-hidden="true"
    >
      <SkeletonLine width="40%" height="0.95em" />
      <SkeletonLine width="85%" height="0.85em" />
      <SkeletonLine width="55%" height="0.75em" />
    </div>
  );
}
