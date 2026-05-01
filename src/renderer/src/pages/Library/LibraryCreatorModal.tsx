import { useEffect, useState } from "react";

import { Modal } from "../../components/Modal";
import { publish } from "../../hooks/data-bus";

type CreatorKind = "workflow" | "agent" | "skill";

const WORKFLOW_CATEGORIES = [
  "business/knowledge-management",
  "business/operations",
  "business/project-management",
  "methodologies/atdd-tdd",
  "methodologies/process-hardening",
  "methodologies/shared",
  "methodologies/spec-kit",
  "reference/babysitter",
  "specializations/devops-sre-platform",
  "specializations/software-architecture",
] as const;
const ITEM_ROOTS = [
  "business/knowledge-management",
  "specializations/ai-agents-conversational",
  "specializations/gpu-programming",
  "specializations/software-architecture",
] as const;

export function LibraryCreatorModal({
  open,
  initialKind,
  onClose,
}: {
  open: boolean;
  initialKind: CreatorKind;
  onClose: () => void;
}): JSX.Element {
  const [kind, setKind] = useState<CreatorKind>(initialKind);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workflowCategory, setWorkflowCategory] = useState<(typeof WORKFLOW_CATEGORIES)[number]>("methodologies/atdd-tdd");
  const [targetRoot, setTargetRoot] = useState<(typeof ITEM_ROOTS)[number]>("business/knowledge-management");
  const [agentName, setAgentName] = useState("general-purpose");
  const [phaseTitle, setPhaseTitle] = useState("Draft and validate output");
  const [role, setRole] = useState("");
  const [philosophy, setPhilosophy] = useState("");
  const [capabilities, setCapabilities] = useState("");
  const [tags, setTags] = useState("");
  const [tools, setTools] = useState("Read, Write, Edit, Glob, Grep, Bash(*)");
  const [prerequisites, setPrerequisites] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setKind(initialKind);
  }, [initialKind, open]);

  const slugValid = /^[a-z][a-z0-9-]*$/.test(slug);
  const hasDescription = description.trim().length > 0;
  const canSubmit = slugValid && hasDescription && !submitting;

  function reset(): void {
    setSlug("");
    setName("");
    setDescription("");
    setWorkflowCategory("methodologies/atdd-tdd");
    setTargetRoot("business/knowledge-management");
    setAgentName("general-purpose");
    setPhaseTitle("Draft and validate output");
    setRole("");
    setPhilosophy("");
    setCapabilities("");
    setTags("");
    setTools("Read, Write, Edit, Glob, Grep, Bash(*)");
    setPrerequisites("");
    setError(null);
    setSubmitting(false);
  }

  async function handleCreate(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const result = kind === "workflow"
        ? await window.mc.createLibraryWorkflow({
            category: workflowCategory,
            slug,
            spec: buildWorkflowSpec({
              category: workflowCategory,
              slug,
              description,
              agentName,
              phaseTitle,
            }),
          })
        : await window.mc.createLibraryItem({
            kind,
            targetRoot,
            slug,
            name: name.trim() || titleFromSlug(slug),
            description: description.trim(),
            role: role.trim() || undefined,
            philosophy: philosophy.trim() || undefined,
            tags: splitList(tags),
            capabilities: splitList(capabilities),
            tools: splitList(tools),
            prerequisites: splitList(prerequisites),
          });

      publish("workflows");
      void window.mc.openPath(result.diskPath);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} title="Create library item" onClose={() => { reset(); onClose(); }}>
      <div className="library-creator-tabs" role="tablist" aria-label="Library item type">
        <CreatorTab label="Workflow" active={kind === "workflow"} onClick={() => setKind("workflow")} />
        <CreatorTab label="Agent" active={kind === "agent"} onClick={() => setKind("agent")} />
        <CreatorTab label="Skill" active={kind === "skill"} onClick={() => setKind("skill")} />
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span className="muted" style={{ fontSize: 11 }}>Slug</span>
          <input
            className="input"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={kind === "workflow" ? "repo-migration-review" : `${kind}-name`}
            disabled={submitting}
          />
          {slug.length > 0 && !slugValid && (
            <span style={{ color: "var(--bad)", fontSize: 11 }}>
              Use kebab-case: lowercase letters, digits, and hyphens.
            </span>
          )}
        </label>

        {kind !== "workflow" && (
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 11 }}>Display name</span>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={slug ? titleFromSlug(slug) : "Library Item Name"}
              disabled={submitting}
            />
          </label>
        )}

        <label style={{ display: "grid", gap: 4 }}>
          <span className="muted" style={{ fontSize: 11 }}>Description</span>
          <textarea
            className="input"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="One-line summary of what this item does"
            disabled={submitting}
          />
        </label>

        {kind === "workflow" ? (
          <WorkflowFields
            category={workflowCategory}
            agentName={agentName}
            phaseTitle={phaseTitle}
            onCategory={setWorkflowCategory}
            onAgentName={setAgentName}
            onPhaseTitle={setPhaseTitle}
            disabled={submitting}
            slug={slug}
          />
        ) : (
          <MarkdownItemFields
            kind={kind}
            targetRoot={targetRoot}
            role={role}
            philosophy={philosophy}
            capabilities={capabilities}
            tags={tags}
            tools={tools}
            prerequisites={prerequisites}
            onTargetRoot={setTargetRoot}
            onRole={setRole}
            onPhilosophy={setPhilosophy}
            onCapabilities={setCapabilities}
            onTags={setTags}
            onTools={setTools}
            onPrerequisites={setPrerequisites}
            disabled={submitting}
            slug={slug}
          />
        )}
      </div>

      {error && (
        <div className="card" style={{ marginTop: 12, color: "var(--bad)", fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button className="button ghost" onClick={() => { reset(); onClose(); }} disabled={submitting}>
          Cancel
        </button>
        <button className="button" onClick={() => void handleCreate()} disabled={!canSubmit}>
          {submitting ? "Creating..." : `Create ${kind}`}
        </button>
      </div>
    </Modal>
  );
}

function CreatorTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button className={active ? "tab active" : "tab"} role="tab" aria-selected={active} onClick={onClick}>
      {label}
    </button>
  );
}

function WorkflowFields({
  category,
  agentName,
  phaseTitle,
  onCategory,
  onAgentName,
  onPhaseTitle,
  disabled,
  slug,
}: {
  category: (typeof WORKFLOW_CATEGORIES)[number];
  agentName: string;
  phaseTitle: string;
  onCategory: (next: (typeof WORKFLOW_CATEGORIES)[number]) => void;
  onAgentName: (next: string) => void;
  onPhaseTitle: (next: string) => void;
  disabled: boolean;
  slug: string;
}): JSX.Element {
  return (
    <>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="muted" style={{ fontSize: 11 }}>Workflow category</span>
        <select className="input" value={category} onChange={(e) => onCategory(e.target.value as (typeof WORKFLOW_CATEGORIES)[number])} disabled={disabled}>
          {WORKFLOW_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="muted" style={{ fontSize: 11 }}>First phase</span>
        <input className="input" value={phaseTitle} onChange={(e) => onPhaseTitle(e.target.value)} disabled={disabled} />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="muted" style={{ fontSize: 11 }}>Agent name</span>
        <input className="input" value={agentName} onChange={(e) => onAgentName(e.target.value)} disabled={disabled} />
      </label>
      <div className="muted" style={{ fontSize: 11 }}>
        {slug ? (
          <>Writes <code>library/{category}/workflows/{slug}.js</code></>
        ) : (
          <>Pick a slug to preview the target path.</>
        )}
      </div>
    </>
  );
}

function MarkdownItemFields({
  kind,
  targetRoot,
  role,
  philosophy,
  capabilities,
  tags,
  tools,
  prerequisites,
  onTargetRoot,
  onRole,
  onPhilosophy,
  onCapabilities,
  onTags,
  onTools,
  onPrerequisites,
  disabled,
  slug,
}: {
  kind: "agent" | "skill";
  targetRoot: (typeof ITEM_ROOTS)[number];
  role: string;
  philosophy: string;
  capabilities: string;
  tags: string;
  tools: string;
  prerequisites: string;
  onTargetRoot: (next: (typeof ITEM_ROOTS)[number]) => void;
  onRole: (next: string) => void;
  onPhilosophy: (next: string) => void;
  onCapabilities: (next: string) => void;
  onTags: (next: string) => void;
  onTools: (next: string) => void;
  onPrerequisites: (next: string) => void;
  disabled: boolean;
  slug: string;
}): JSX.Element {
  return (
    <>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="muted" style={{ fontSize: 11 }}>Target root</span>
        <select className="input" value={targetRoot} onChange={(e) => onTargetRoot(e.target.value as (typeof ITEM_ROOTS)[number])} disabled={disabled}>
          {ITEM_ROOTS.map((root) => (
            <option key={root} value={root}>{root}</option>
          ))}
        </select>
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="muted" style={{ fontSize: 11 }}>{kind === "agent" ? "Role" : "Operator role"}</span>
        <input className="input" value={role} onChange={(e) => onRole(e.target.value)} placeholder={kind === "agent" ? "Library Knowledge Architect" : "Skill operator"} disabled={disabled} />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="muted" style={{ fontSize: 11 }}>Philosophy</span>
        <input className="input" value={philosophy} onChange={(e) => onPhilosophy(e.target.value)} placeholder="Make the reusable path clear and easy to validate." disabled={disabled} />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span className="muted" style={{ fontSize: 11 }}>Capabilities</span>
        <textarea className="input" rows={3} value={capabilities} onChange={(e) => onCapabilities(e.target.value)} placeholder="One per line or comma-separated" disabled={disabled} />
      </label>
      {kind === "skill" && (
        <>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 11 }}>Allowed tools</span>
            <input className="input" value={tools} onChange={(e) => onTools(e.target.value)} disabled={disabled} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span className="muted" style={{ fontSize: 11 }}>Prerequisites</span>
            <textarea className="input" rows={3} value={prerequisites} onChange={(e) => onPrerequisites(e.target.value)} placeholder="One per line or comma-separated" disabled={disabled} />
          </label>
        </>
      )}
      <label style={{ display: "grid", gap: 4 }}>
        <span className="muted" style={{ fontSize: 11 }}>Tags</span>
        <input className="input" value={tags} onChange={(e) => onTags(e.target.value)} placeholder="knowledge-management, templates" disabled={disabled} />
      </label>
      <div className="muted" style={{ fontSize: 11 }}>
        {slug ? (
          <>Writes <code>{targetRoot}/{kind === "agent" ? "agents" : "skills"}/{slug}/{kind === "agent" ? "AGENT.md" : "SKILL.md"}</code></>
        ) : (
          <>Pick a slug to preview the target path.</>
        )}
      </div>
    </>
  );
}

function buildWorkflowSpec({
  category,
  slug,
  description,
  agentName,
  phaseTitle,
}: {
  category: string;
  slug: string;
  description: string;
  agentName: string;
  phaseTitle: string;
}): Record<string, unknown> {
  const taskName = `${camel(slug)}Task`;
  return {
    processId: `${category}/${slug}`,
    description: description.trim(),
    inputs: [{ name: "request", jsDocType: "string", defaultLiteral: "''" }],
    outputs: [
      { name: "summary", jsDocType: "string", expression: "draft.summary" },
      { name: "missingInfo", jsDocType: "string[]", expression: "draft.missingInfo ?? []" },
    ],
    successExpression: "draft.success === true",
    phases: [
      {
        kind: "sequential",
        title: phaseTitle.trim() || "Draft and validate output",
        resultVar: "draft",
        taskRef: taskName,
        args: { request: "request" },
      },
    ],
    tasks: [
      {
        kind: "agent",
        factoryName: taskName,
        taskKey: slug,
        title: titleFromSlug(slug),
        agentName: agentName.trim() || "general-purpose",
        role: "Mission Control workflow agent",
        taskDescription: description.trim(),
        contextKeys: ["request"],
        instructions: [
          "Read the request and identify the concrete output needed.",
          "Use local library conventions before inventing new structure.",
          "Return a summary, missingInfo array, and success boolean.",
        ],
        outputFormat: "JSON with { success: boolean, summary: string, missingInfo: string[] }",
        outputSchema: {
          type: "object",
          required: ["success", "summary"],
          properties: {
            success: { type: "boolean" },
            summary: { type: "string" },
            missingInfo: { type: "array", items: { type: "string" } },
          },
        },
        labels: ["agent", "library-generated"],
      },
    ],
  };
}

function splitList(value: string): string[] {
  return value.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function camel(slug: string): string {
  const titled = titleFromSlug(slug).replace(/\s+/g, "");
  return `${titled.slice(0, 1).toLowerCase()}${titled.slice(1)}`;
}
