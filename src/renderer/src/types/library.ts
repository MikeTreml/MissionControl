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

