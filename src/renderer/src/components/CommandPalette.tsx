/**
 * ⌘K command palette — global search across tasks, projects, and
 * library items. Opens on ⌘K / Ctrl+K (global) or via the topbar
 * search button (which dispatches the `mc:open-command-palette`
 * window event).
 *
 * Result groups (capped per group so the panel stays tight):
 *   • Tasks    — id / title / description hits
 *   • Projects — name / prefix / notes hits
 *   • Library  — id / name / description / tags / languages hits
 *
 * Keyboard:
 *   ⌘K / Ctrl+K   open
 *   Esc           close
 *   ↑ ↓           move selection
 *   Enter         activate selected result
 *   any printable advance the query
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { useTasks } from "../hooks/useTasks";
import { useProjects } from "../hooks/useProjects";
import { useLibraryIndex } from "../hooks/useLibraryIndex";
import { useRoute } from "../router";
import { colorForKey } from "../lib/color-hash";

const PER_GROUP = 5;
const OPEN_EVENT = "mc:open-command-palette";

export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

type ResultKind = "task" | "project" | "library";

interface PaletteResult {
  kind: ResultKind;
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  accent?: string;
  /** Lower = better match. Used for sort. */
  score: number;
  /** Activated when the user picks the result. */
  onActivate: () => void;
}

export function CommandPalette(): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { tasks } = useTasks();
  const { projects } = useProjects();
  const { items: libraryItems } = useLibraryIndex();
  const { openTask, openProject, setView } = useRoute();

  // Open on ⌘K / Ctrl+K. Listen on the document so the shortcut works
  // regardless of focus (input, button, body) — except when the user
  // is already typing in a text field elsewhere we still want the
  // palette to open since ⌘K is a near-universal "search everywhere"
  // gesture.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen(true);
        setQuery("");
        setActiveIndex(0);
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // External open trigger (topbar search button).
  useEffect(() => {
    function onExternal(): void {
      setOpen(true);
      setQuery("");
      setActiveIndex(0);
    }
    window.addEventListener(OPEN_EVENT, onExternal);
    return () => window.removeEventListener(OPEN_EVENT, onExternal);
  }, []);

  // Focus the input every time the palette opens.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return { tasks: [], projects: [], library: [] };
    }

    const taskHits: PaletteResult[] = [];
    for (const t of tasks) {
      const score = scoreFields(q, [t.id, t.summary, t.stepLine ?? ""]);
      if (score === Infinity) continue;
      const pfx = t.id.split("-")[0] ?? "";
      taskHits.push({
        kind: "task",
        id: t.id,
        title: `${t.id} — ${t.summary}`,
        subtitle: t.stepLine || t.lane,
        badge: t.lane,
        accent: pfx ? colorForKey(pfx) : undefined,
        score,
        onActivate: () => {
          openTask(t.id);
          setOpen(false);
        },
      });
    }

    const projectHits: PaletteResult[] = [];
    for (const p of projects) {
      const score = scoreFields(q, [p.name, p.prefix, p.notes ?? "", p.sourceHint]);
      if (score === Infinity) continue;
      projectHits.push({
        kind: "project",
        id: p.id,
        title: p.name,
        subtitle: p.sourceHint || `prefix ${p.prefix}`,
        badge: p.prefix,
        accent: colorForKey(p.prefix),
        score,
        onActivate: () => {
          openProject(p.id);
          setOpen(false);
        },
      });
    }

    const libHits: PaletteResult[] = [];
    for (const item of libraryItems) {
      const score = scoreFields(q, [
        item.id,
        item.name,
        item.description ?? "",
        item.role ?? "",
        ...(item.tags ?? []),
        ...(item.languages ?? []),
      ]);
      if (score === Infinity) continue;
      libHits.push({
        kind: "library",
        id: item.id,
        title: item.name,
        subtitle: item.description ?? item.logicalPath,
        badge: item.kind,
        score,
        onActivate: () => {
          // Open the source file in the OS editor — fastest "go to it"
          // action that doesn't require the Library page to expose a
          // selection-from-outside API. A future slice can route into
          // the Library page with the item pre-selected.
          if (window.mc?.openPath) void window.mc.openPath(item.diskPath);
          setOpen(false);
        },
      });
    }

    taskHits.sort((a, b) => a.score - b.score);
    projectHits.sort((a, b) => a.score - b.score);
    libHits.sort((a, b) => a.score - b.score);

    return {
      tasks: taskHits.slice(0, PER_GROUP),
      projects: projectHits.slice(0, PER_GROUP),
      library: libHits.slice(0, PER_GROUP),
    };
  }, [query, tasks, projects, libraryItems, openTask, openProject]);

  const flat = useMemo(() => [...groups.projects, ...groups.tasks, ...groups.library], [groups]);

  // Clamp selection when results change.
  useEffect(() => {
    if (activeIndex >= flat.length) setActiveIndex(Math.max(0, flat.length - 1));
  }, [flat.length, activeIndex]);

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = flat[activeIndex];
      if (r) r.onActivate();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  // Suppress global view nav key handlers when the palette has focus —
  // setView is a no-op the way the route hook is structured, but we
  // also want the unused setView to count as a real reference for TS.
  void setView;

  if (!open) return null;

  return (
    <div className="cmdk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="cmdk-panel" role="dialog" aria-label="Command palette">
        <div className="cmdk-input-row">
          <span className="cmdk-glyph">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKey}
            placeholder="Search tasks, projects, library…"
            spellCheck={false}
            autoComplete="off"
          />
          <span className="cmdk-kbd">Esc</span>
        </div>

        <div className="cmdk-results">
          {flat.length === 0 && (
            <div className="cmdk-empty">
              {query.trim()
                ? "No matches."
                : "Type to search across tasks, projects, and the library."}
            </div>
          )}

          {groups.projects.length > 0 && (
            <Section label="Projects">
              {groups.projects.map((r) => (
                <Row
                  key={r.id}
                  result={r}
                  active={flat.indexOf(r) === activeIndex}
                  onHover={() => setActiveIndex(flat.indexOf(r))}
                />
              ))}
            </Section>
          )}

          {groups.tasks.length > 0 && (
            <Section label="Tasks">
              {groups.tasks.map((r) => (
                <Row
                  key={r.id}
                  result={r}
                  active={flat.indexOf(r) === activeIndex}
                  onHover={() => setActiveIndex(flat.indexOf(r))}
                />
              ))}
            </Section>
          )}

          {groups.library.length > 0 && (
            <Section label="Library">
              {groups.library.map((r) => (
                <Row
                  key={r.id}
                  result={r}
                  active={flat.indexOf(r) === activeIndex}
                  onHover={() => setActiveIndex(flat.indexOf(r))}
                />
              ))}
            </Section>
          )}
        </div>

        <div className="cmdk-footer">
          <span className="cmdk-hint"><span className="cmdk-kbd">↑ ↓</span> navigate</span>
          <span className="cmdk-hint"><span className="cmdk-kbd">↵</span> open</span>
          <span className="cmdk-hint"><span className="cmdk-kbd">Esc</span> close</span>
          <span className="cmdk-hint" style={{ marginLeft: "auto" }}>
            {flat.length > 0 ? `${flat.length} match${flat.length === 1 ? "" : "es"}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="cmdk-section">
      <div className="cmdk-section-label">{label}</div>
      <div className="cmdk-section-rows">{children}</div>
    </div>
  );
}

function Row({
  result,
  active,
  onHover,
}: {
  result: PaletteResult;
  active: boolean;
  onHover: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className={active ? "cmdk-row active" : "cmdk-row"}
      onMouseEnter={onHover}
      onClick={() => result.onActivate()}
    >
      {result.accent && (
        <span className="cmdk-dot" style={{ background: result.accent }} />
      )}
      <span className="cmdk-row-body">
        <span className="cmdk-row-title">{result.title}</span>
        {result.subtitle && <span className="cmdk-row-subtitle">{result.subtitle}</span>}
      </span>
      {result.badge && <span className="cmdk-row-badge">{result.badge}</span>}
    </button>
  );
}

/**
 * Score a query against a list of fields. Lower = better. Returns
 * Infinity if the query doesn't match any field. Fast string-match
 * heuristic, no fancy fuzz: exact > prefix > word-boundary > substring.
 */
function scoreFields(query: string, fields: string[]): number {
  let best = Infinity;
  for (const raw of fields) {
    if (!raw) continue;
    const f = raw.toLowerCase();
    if (f === query) return 0;
    if (f.startsWith(query)) {
      best = Math.min(best, 1);
      continue;
    }
    // Word boundary match
    if (new RegExp(`\\b${escapeRegex(query)}`).test(f)) {
      best = Math.min(best, 2);
      continue;
    }
    if (f.includes(query)) {
      best = Math.min(best, 3);
    }
  }
  return best;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
