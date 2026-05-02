import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LibraryIndexItem, LibraryItemKind } from "../../types/library";
import { deviconSvgUrl, languageToDeviconSlug } from "../../lib/devicon-languages";
import { publish } from "../../hooks/data-bus";
import { pushToast, pushErrorToast } from "../../hooks/useToasts";

const KIND_OPTIONS: LibraryItemKind[] = ["agent", "skill", "workflow", "example"];

const CONTAINER_KIND_OPTIONS = [
  "",
  "methodology",
  "specialization",
  "cradle",
  "contrib",
  "core",
  "domain",
] as const;

const DOMAIN_GROUP_OPTIONS = ["", "business", "science", "social-sciences-humanities"] as const;

export function DetailPanel({ item }: { item: LibraryIndexItem | null }): JSX.Element {
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<LibraryItemDraft | null>(null);
  const [original, setOriginal] = useState<LibraryItemDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item) {
      setDraft(null);
      setOriginal(null);
      setEditMode(false);
      return;
    }
    const d = itemToDraft(item);
    setDraft(d);
    setOriginal(d);
    setEditMode(false);
  }, [item?.id]);

  const display = useMemo(() => {
    if (!item || !draft) return null;
    return mergeDraft(item, draft);
  }, [item, draft]);

  const dirty = useMemo(() => {
    if (!draft || !original) return false;
    return JSON.stringify(draft) !== JSON.stringify(original);
  }, [draft, original]);

  /**
   * Persist edits to the item's sidecar (`INFO.json` next to AGENT.md/
   * SKILL.md, or `<stem>.info.json` next to flat workflow/example
   * sources). Only the SIDECAR_OVERRIDE_FIELDS subset reaches disk —
   * the IPC drops anything else. Computed fields (id / diskPath /
   * sizeBytes / modifiedAt) are recomputed by the walker on rebuild.
   */
  async function handleSave(): Promise<void> {
    if (!item || !draft || !window.mc?.saveItemInfo) return;
    setSaving(true);
    try {
      // Build a patch of only the editable fields. Empty strings → null
      // so the sidecar reverts to source-derived values for that field.
      const patch: Record<string, unknown> = {
        name: draft.name.trim() || null,
        description: draft.description.trim() || null,
        role: draft.role.trim() || null,
        version: draft.version.trim() || null,
        container: draft.container.trim() || null,
        containerKind: draft.containerKind.trim() || null,
        domainGroup: draft.domainGroup.trim() || null,
        tags: parseList(draft.tagsText),
        languages: parseList(draft.languagesText),
        expertise: parseList(draft.expertiseText),
      };
      if (item.kind === "workflow") {
        patch.hasParallel = draft.hasParallel === "yes";
        patch.hasBreakpoints = draft.hasBreakpoints === "yes";
        const steps = Number(draft.estimatedStepsText);
        patch.estimatedSteps = Number.isFinite(steps) && steps > 0 ? Math.floor(steps) : null;
        patch.usesAgents = parseList(draft.usesAgentsText);
        patch.usesSkills = parseList(draft.usesSkillsText);
      }
      await window.mc.saveItemInfo({
        kind: item.kind,
        diskPath: item.diskPath,
        patch,
      });
      pushToast({ taskId: "", tone: "good", title: "Item saved", detail: item.name });
      setOriginal(draft);
      setEditMode(false);
      // Refresh the library index so the new fields show up everywhere
      // (tree, Run Workflow modal, etc.).
      publish("workflows");
    } catch (e) {
      pushErrorToast("Failed to save item", e, item.id);
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard(): void {
    if (original) setDraft(original);
    setEditMode(false);
  }

  return (
    <div className="card" style={{ minHeight: 480 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Detail</h3>
        {item && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input
              type="checkbox"
              checked={editMode}
              onChange={(e) => {
                const on = e.target.checked;
                setEditMode(on);
                // Reset draft from the original (which mirrors disk) on
                // toggle. Same effect as Discard — keeps the toggle
                // explicit + non-destructive of saved work.
                if (item && original) setDraft(original);
              }}
            />
            Edit
          </label>
        )}
      </div>
      {!item && (
        <p className="muted" style={{ fontSize: 13 }}>
          Select an item to inspect metadata.
        </p>
      )}
      {item && display && (
        <div style={{ display: "grid", gap: 12 }}>
          {editMode && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 8,
                background: "var(--panel)",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <span className="muted" style={{ flex: 1 }}>
                Edits write to a sidecar (<code>INFO.json</code> or{" "}
                <code>&lt;stem&gt;.info.json</code>) next to the source file. Source files
                are not modified. Empty a field to clear the override.
              </span>
              <button
                className="button ghost"
                onClick={() => handleDiscard()}
                disabled={saving || !dirty}
                style={{ padding: "4px 10px", fontSize: 12 }}
              >
                Discard
              </button>
              <button
                className="button"
                onClick={() => void handleSave()}
                disabled={saving || !dirty}
                style={{ padding: "4px 10px", fontSize: 12 }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="button ghost"
              onClick={() => void navigator.clipboard?.writeText(item.logicalPath)}
            >
              Copy logical path
            </button>
            <button className="button ghost" onClick={() => void window.mc?.openPath(item.diskPath)}>
              Open file
            </button>
            {item.inputsSchemaPath && (
              <button className="button ghost" onClick={() => void window.mc?.openPath(item.inputsSchemaPath!)}>
                Open schema
              </button>
            )}
            {item.companionDoc && (
              <button className="button ghost" onClick={() => void window.mc?.openPath(item.companionDoc!)}>
                Open companion doc
              </button>
            )}
            {item.examplesDir && (
              <button className="button ghost" onClick={() => void window.mc?.openPath(item.examplesDir!)}>
                Open examples folder
              </button>
            )}
            {item.readmeMdPath && (
              <button className="button ghost" onClick={() => void window.mc?.openPath(item.readmeMdPath!)}>
                Open README
              </button>
            )}
            {item.descriptionMdPath && (
              <button className="button ghost" onClick={() => void window.mc?.openPath(item.descriptionMdPath!)}>
                Open description
              </button>
            )}
            {item.containerReadmePath && (
              <button className="button ghost" onClick={() => void window.mc?.openPath(item.containerReadmePath!)}>
                Open container README
              </button>
            )}
          </div>

          <Section title="Overview">
            {editMode ? (
              <>
                <EnumRow
                  label="Kind"
                  value={draft!.kind}
                  options={KIND_OPTIONS}
                  onChange={(v) => setDraft((d) => (d ? { ...d, kind: v as LibraryItemKind } : d))}
                />
                <InputRow label="Name" value={draft!.name} onChange={(v) => setDraft((d) => (d ? { ...d, name: v } : d))} />
                <InputRow label="Logical path" value={draft!.logicalPath} mono onChange={(v) => setDraft((d) => (d ? { ...d, logicalPath: v } : d))} />
                <InputRow label="Version" value={draft!.version} onChange={(v) => setDraft((d) => (d ? { ...d, version: v } : d))} />
                <InputRow label="Container" value={draft!.container} onChange={(v) => setDraft((d) => (d ? { ...d, container: v } : d))} />
                <EnumRow
                  label="Container kind"
                  value={draft!.containerKind}
                  options={[...CONTAINER_KIND_OPTIONS]}
                  onChange={(v) => setDraft((d) => (d ? { ...d, containerKind: v } : d))}
                />
                <EnumRow
                  label="Domain group"
                  value={draft!.domainGroup}
                  options={[...DOMAIN_GROUP_OPTIONS]}
                  onChange={(v) => setDraft((d) => (d ? { ...d, domainGroup: v } : d))}
                />
                <TextAreaRow label="Description" value={draft!.description} onChange={(v) => setDraft((d) => (d ? { ...d, description: v } : d))} />
                <InputRow label="Role" value={draft!.role} onChange={(v) => setDraft((d) => (d ? { ...d, role: v } : d))} />
              </>
            ) : (
              <>
                <ReadRow label="Kind" value={display.kind} mono />
                <ReadRow label="Name" value={display.name} />
                <ReadRow label="Logical path" value={display.logicalPath} mono />
                <ReadRow label="Version" value={display.version || "(none)"} />
                <ReadRow label="Container" value={display.container ?? "(none)"} />
                <ReadRow label="Container kind" value={display.containerKind ?? "(none)"} />
                <ReadRow label="Domain group" value={display.domainGroup ?? "(none)"} />
                <ReadRow label="Description" value={display.description ?? "(none)"} />
                <ReadRow label="Role" value={display.role ?? "(none)"} />
              </>
            )}
          </Section>

          <Section title="Languages">
            {editMode ? (
              <TextAreaRow
                label="Languages (comma or newline separated)"
                value={draft!.languagesText}
                onChange={(v) => setDraft((d) => (d ? { ...d, languagesText: v } : d))}
              />
            ) : (
              <LanguageDisplay languages={display.languages} />
            )}
          </Section>

          <Section title="Tags & expertise">
            {editMode ? (
              <>
                <TextAreaRow label="Tags" value={draft!.tagsText} onChange={(v) => setDraft((d) => (d ? { ...d, tagsText: v } : d))} />
                <TextAreaRow label="Expertise" value={draft!.expertiseText} onChange={(v) => setDraft((d) => (d ? { ...d, expertiseText: v } : d))} />
              </>
            ) : (
              <>
                <ReadRow label="Tags" value={display.tags.length ? display.tags.join(", ") : "(none)"} />
                <ReadRow label="Expertise" value={display.expertise.length ? display.expertise.join(", ") : "(none)"} />
              </>
            )}
          </Section>

          <Section title="Source (originalSource)">
            {display.originalSource && Object.keys(display.originalSource).length > 0 ? (
              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                {Object.entries(display.originalSource).map(([k, v]) => (
                  <ReadRow key={k} label={k} value={v === undefined || v === null || v === "" ? "(none)" : String(v)} mono={typeof v === "string" && v.includes("/")} />
                ))}
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 12, margin: 0 }}>
                (none)
              </p>
            )}
          </Section>

          {display.kind === "workflow" && (
            <Section title="Workflow">
              {editMode ? (
                <>
                  <InputRow label="Estimated steps" value={draft!.estimatedStepsText} onChange={(v) => setDraft((d) => (d ? { ...d, estimatedStepsText: v } : d))} />
                  <EnumRow
                    label="Has parallel"
                    value={draft!.hasParallel}
                    options={["yes", "no"]}
                    onChange={(v) => setDraft((d) => (d ? { ...d, hasParallel: v as "yes" | "no" } : d))}
                  />
                  <EnumRow
                    label="Has breakpoints"
                    value={draft!.hasBreakpoints}
                    options={["yes", "no"]}
                    onChange={(v) => setDraft((d) => (d ? { ...d, hasBreakpoints: v as "yes" | "no" } : d))}
                  />
                  <TextAreaRow label="Uses agents (one path per line)" value={draft!.usesAgentsText} onChange={(v) => setDraft((d) => (d ? { ...d, usesAgentsText: v } : d))} />
                  <TextAreaRow label="Uses skills (one path per line)" value={draft!.usesSkillsText} onChange={(v) => setDraft((d) => (d ? { ...d, usesSkillsText: v } : d))} />
                  <ReadRow label="Inputs schema path" value={display.inputsSchemaPath ?? "(none)"} mono />
                  <ReadRow label="Examples dir" value={display.examplesDir ?? "(none)"} mono />
                  <ReadRow label="Companion doc" value={display.companionDoc ?? "(none)"} mono />
                </>
              ) : (
                <>
                  <ReadRow label="Estimated steps" value={String(display.estimatedSteps ?? 0)} />
                  <ReadRow label="Has parallel" value={display.hasParallel ? "yes" : "no"} />
                  <ReadRow label="Has breakpoints" value={display.hasBreakpoints ? "yes" : "no"} />
                  <ReadRow label="Inputs schema path" value={display.inputsSchemaPath ?? "(none)"} mono />
                  <ReadRow label="Examples dir" value={display.examplesDir ?? "(none)"} mono />
                  <ReadRow label="Companion doc" value={display.companionDoc ?? "(none)"} mono />
                  <ListBlock label="Uses agents" items={display.usesAgents} />
                  <ListBlock label="Uses skills" items={display.usesSkills} />
                </>
              )}
            </Section>
          )}

        </div>
      )}
    </div>
  );
}

type LibraryItemDraft = {
  kind: LibraryItemKind;
  name: string;
  logicalPath: string;
  version: string;
  container: string;
  containerKind: string;
  domainGroup: string;
  description: string;
  role: string;
  languagesText: string;
  tagsText: string;
  expertiseText: string;
  estimatedStepsText: string;
  hasParallel: "yes" | "no";
  hasBreakpoints: "yes" | "no";
  usesAgentsText: string;
  usesSkillsText: string;
};

function itemToDraft(item: LibraryIndexItem): LibraryItemDraft {
  return {
    kind: item.kind,
    name: item.name,
    logicalPath: item.logicalPath,
    version: item.version ?? "",
    container: item.container ?? "",
    containerKind: item.containerKind ?? "",
    domainGroup: item.domainGroup ?? "",
    description: item.description ?? "",
    role: item.role ?? "",
    languagesText: (item.languages ?? []).join(", "),
    tagsText: (item.tags ?? []).join(", "),
    expertiseText: (item.expertise ?? []).join(", "),
    estimatedStepsText: String(item.estimatedSteps ?? 0),
    hasParallel: item.hasParallel ? "yes" : "no",
    hasBreakpoints: item.hasBreakpoints ? "yes" : "no",
    usesAgentsText: (item.usesAgents ?? []).join("\n"),
    usesSkillsText: (item.usesSkills ?? []).join("\n"),
  };
}

function parseList(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mergeDraft(item: LibraryIndexItem, draft: LibraryItemDraft): LibraryIndexItem {
  const base: LibraryIndexItem = {
    ...item,
    kind: draft.kind,
    name: draft.name,
    logicalPath: draft.logicalPath,
    version: draft.version || null,
    container: draft.container || null,
    containerKind: draft.containerKind || null,
    domainGroup: draft.domainGroup || null,
    description: draft.description || null,
    role: draft.role || null,
    languages: parseList(draft.languagesText),
    tags: parseList(draft.tagsText),
    expertise: parseList(draft.expertiseText),
  };
  if (draft.kind !== "workflow") {
    return {
      ...base,
      inputsSchemaPath: undefined,
      examplesDir: undefined,
      companionDoc: undefined,
      usesAgents: undefined,
      usesSkills: undefined,
      estimatedSteps: undefined,
      hasParallel: undefined,
      hasBreakpoints: undefined,
    };
  }
  const est = Number.parseInt(draft.estimatedStepsText, 10);
  return {
    ...base,
    estimatedSteps: Number.isFinite(est) ? est : item.estimatedSteps,
    hasParallel: draft.hasParallel === "yes",
    hasBreakpoints: draft.hasBreakpoints === "yes",
    usesAgents: parseList(draft.usesAgentsText),
    usesSkills: parseList(draft.usesSkillsText),
    readmeMdPath: null,
  };
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {title}
      </div>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}

function ReadRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontFamily: mono ? "Consolas, monospace" : "inherit", wordBreak: "break-word" }}>
        {value}
      </div>
    </div>
  );
}

function InputRow({
  label,
  value,
  mono = false,
  onChange,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span className="muted" style={{ fontSize: 11 }}>
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "var(--bg)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "8px 10px",
          fontFamily: mono ? "Consolas, monospace" : "inherit",
          fontSize: 13,
        }}
      />
    </label>
  );
}

function TextAreaRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span className="muted" style={{ fontSize: 11 }}>
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        style={{
          background: "var(--bg)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "8px 10px",
          fontFamily: "inherit",
          fontSize: 13,
          resize: "vertical",
        }}
      />
    </label>
  );
}

function EnumRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <label style={{ display: "grid", gap: 4 }}>
      <span className="muted" style={{ fontSize: 11 }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "var(--bg)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          padding: "8px 10px",
          fontSize: 13,
          maxWidth: "100%",
        }}
      >
        {options.map((opt) => (
          <option key={opt || "__empty"} value={opt}>
            {opt === "" ? "(none)" : opt}
          </option>
        ))}
      </select>
    </label>
  );
}

function ListBlock({ label, items }: { label: string; items: string[] | undefined }): JSX.Element {
  const list = items ?? [];
  if (list.length === 0) {
    return <ReadRow label={label} value="(none)" />;
  }
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
        {label}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, fontFamily: "Consolas, monospace" }}>
        {list.map((line) => (
          <li key={line} style={{ wordBreak: "break-all" }}>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LanguageDisplay({ languages }: { languages: string[] }): JSX.Element {
  if (!languages.length) {
    return <ReadRow label="Languages" value="(none)" />;
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      {languages.map((lang) => (
        <LanguageChip key={lang} lang={lang} />
      ))}
    </div>
  );
}

function LanguageChip({ lang }: { lang: string }): JSX.Element {
  const slug = useMemo(() => languageToDeviconSlug(lang), [lang]);
  const [iconFailed, setIconFailed] = useState(false);

  if (!slug || iconFailed) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 8px",
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: "var(--panel)",
          fontSize: 12,
        }}
      >
        {lang}
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 8px",
        borderRadius: 6,
        border: "1px solid var(--border)",
        background: "var(--panel)",
        fontSize: 12,
      }}
    >
      <img
        src={deviconSvgUrl(slug, "original")}
        alt=""
        width={20}
        height={20}
        style={{ flexShrink: 0 }}
        onError={(e) => {
          const el = e.currentTarget;
          if (el.dataset["triedPlain"] === "1") {
            setIconFailed(true);
            return;
          }
          el.dataset["triedPlain"] = "1";
          el.src = deviconSvgUrl(slug, "plain");
        }}
      />
      <span>{lang}</span>
    </span>
  );
}
