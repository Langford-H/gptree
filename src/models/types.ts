export interface ProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface WorkspaceSettings {
  rootSeed: string;
  providerMode: "dummy" | "external";
  providerConfig: ProviderConfig;
  uiTheme: {
    baseFontSize: number;
    palette: string[];
  };
}

export interface Tree {
  id: string;
  title: string;
  trunkSessionId: string;
  sessionIds: string[];
  createdAt: number;
  updatedAt: number;
  collapsed: boolean;
}

export interface SessionOrigin {
  sourceSessionId: string;
  sourceNodeId: string;
  quoteText: string;
  createdAt: number;
}

export interface Session {
  id: string;
  treeId: string;
  kind: "trunk" | "branch";
  headNodeId: string | null;
  tailNodeId: string | null;
  origin: SessionOrigin | null;
  branchSeed: BranchSeed | null;
  colorKey: number;
  createdAt: number;
  updatedAt: number;
}

export interface Node {
  id: string;
  sessionId: string;
  prevId: string | null;
  nextId: string | null;
  question: string;
  answer: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BranchSeed {
  sourceTreeId: string;
  sourceSessionId: string;
  sourceNodeId: string;
  quoteText: string;
  originSummary: string;
  createdAt: number;
}

export interface Workspace {
  trees: Record<string, Tree>;
  sessions: Record<string, Session>;
  nodes: Record<string, Node>;
  activeTreeId: string | null;
  activeSessionId: string | null;
  settings: WorkspaceSettings;
}
