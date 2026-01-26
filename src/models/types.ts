export interface ProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface WorkspaceSettings {
  systemPrompt: string;
  providerMode: "dummy" | "external";
  providerConfig: ProviderConfig;
  summarizationPolicy: {
    maxContextNodes: number;
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

export interface Workspace {
  trees: Record<string, Tree>;
  sessions: Record<string, Session>;
  nodes: Record<string, Node>;
  activeTreeId: string | null;
  activeSessionId: string | null;
  settings: WorkspaceSettings;
}
