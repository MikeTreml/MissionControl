export type LibraryItemKind = "agent" | "skill" | "workflow" | "example";

export interface LibrarySourceRef {
  repo?: string;
  url?: string;
  license?: string;
  viaUpstream?: string;
  absorbedBy?: string;
  absorbedAt?: string;
}

export interface LibraryIndexItem {
  kind: LibraryItemKind;
  id: string;
  name: string;
  diskPath: string;
  logicalPath: string;
  container: string | null;
  containerKind: string | null;
  domainGroup: string | null;
  description: string | null;
  role: string | null;
  expertise: string[];
  languages: string[];
  tags: string[];
  originalSource: LibrarySourceRef | null;
  version: string | null;
  sizeBytes: number;
  modifiedAt: string;
  inputsSchemaPath?: string | null;
  examplesDir?: string | null;
  companionDoc?: string | null;
  usesAgents?: string[];
  usesSkills?: string[];
  estimatedSteps?: number;
  hasParallel?: boolean;
  hasBreakpoints?: boolean;
  /** Co-located DESCRIPTION.md next to the entry file; set by library index build. */
  descriptionMdPath?: string | null;
  /** README.md beside AGENT.md / SKILL.md / example JSON; workflows use companionDoc instead. */
  readmeMdPath?: string | null;
  /** Nearest ancestor README under `library/`; set by library index build. */
  containerReadmePath?: string | null;
}

export interface LibraryIndex {
  generatedAt: string;
  summary: {
    agents: number;
    skills: number;
    workflows: number;
    examples: number;
  };
  items: LibraryIndexItem[];
}

