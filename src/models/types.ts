export type Role = "user" | "assistant" | "system";

export interface Message {
  id: string;
  role: Role;
  text: string;
  ts: number;
  meta?: {
    linkNodeId?: string;
  };
}

export type NodeStatus = "draft" | "open" | "linked" | "merged";

export interface Anchor {
  sourceNodeId: string;
  quoteText: string;
}

export interface MergeInfo {
  mode: "inline" | "link";
  note?: string;
  targetNodeId: string;
}

export interface Node {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  title: string;
  status: NodeStatus;
  anchor?: Anchor;
  messages: Message[];
  merge?: MergeInfo;
  createdAt: number;
  updatedAt: number;
}

export interface Workspace {
  workspaceId: string;
  createdAt: number;
  updatedAt: number;
  rootNodeId: string;
  nodes: Record<string, Node>;
  ui: {
    activeNodeId: string;
    expandedNodeIds: string[];
  };
}

export interface ProviderSettings {
  providerMode: "dummy" | "external";
  baseUrl: string;
  apiKey: string;
  model: string;
  stream: boolean;
  maxTokens: number;
  temperature?: number;
  proxyUrl: string;
}
