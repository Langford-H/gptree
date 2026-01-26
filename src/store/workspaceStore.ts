import {
  BranchSeed,
  Node,
  Session,
  SessionOrigin,
  Tree,
  Workspace,
  WorkspaceSettings,
} from "../models/types";
import { createId } from "../utils/id";

const WORKSPACE_STORAGE_KEY = "gptree_workspace_v021_sessions";

export const DEFAULT_ROOT_SEED =
  "You are an assistant helping manage a tree-structured Q&A workflow (GPTree).\n" +
  "Rules:\n" +
  "- Treat each user message as a commit node.\n" +
  "- Be concise and technical.\n" +
  "- Do not hallucinate missing context.\n" +
  "- Ask at most one clarifying question if needed.\n" +
  "- Prioritize branch seed context in branch sessions.";

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  rootSeed: DEFAULT_ROOT_SEED,
  providerMode: "dummy",
  providerConfig: {
    baseUrl: "https://api-inference.modelscope.cn/v1",
    apiKey: "",
    model: "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
    stream: true,
    maxTokens: 512,
    temperature: undefined,
  },
  uiTheme: {
    baseFontSize: 17,
    palette: ["#5b9bff", "#35c3a9", "#f6b26b", "#e06666", "#8e7cc3", "#6fa8dc"],
  },
};

export function createNode(options: {
  sessionId: string;
  question: string;
  prevId: string | null;
}): Node {
  const now = Date.now();
  return {
    id: createId("node"),
    sessionId: options.sessionId,
    prevId: options.prevId,
    nextId: null,
    question: options.question,
    answer: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createSession(options: {
  treeId: string;
  kind: "trunk" | "branch";
  origin?: SessionOrigin | null;
  branchSeed?: BranchSeed | null;
  colorKey?: number;
}): Session {
  const now = Date.now();
  return {
    id: createId("session"),
    treeId: options.treeId,
    kind: options.kind,
    headNodeId: null,
    tailNodeId: null,
    origin: options.origin ?? null,
    branchSeed: options.branchSeed ?? null,
    colorKey: typeof options.colorKey === "number" ? options.colorKey : 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createTree(): { tree: Tree; session: Session } {
  const now = Date.now();
  const trunkSession = createSession({
    treeId: createId("tree"),
    kind: "trunk",
    colorKey: 0,
  });
  const tree: Tree = {
    id: trunkSession.treeId,
    title: "Untitled tree",
    trunkSessionId: trunkSession.id,
    sessionIds: [trunkSession.id],
    createdAt: now,
    updatedAt: now,
    collapsed: false,
  };
  return { tree, session: { ...trunkSession, treeId: tree.id } };
}

export function createWorkspace(): Workspace {
  return {
    trees: {},
    sessions: {},
    nodes: {},
    activeTreeId: null,
    activeSessionId: null,
    settings: {
      ...DEFAULT_SETTINGS,
      providerConfig: { ...DEFAULT_SETTINGS.providerConfig },
      uiTheme: {
        baseFontSize: DEFAULT_SETTINGS.uiTheme.baseFontSize,
        palette: [...DEFAULT_SETTINGS.uiTheme.palette],
      },
    },
  };
}

function coerceSettings(value: unknown): WorkspaceSettings {
  if (!value || typeof value !== "object") {
    return {
      ...DEFAULT_SETTINGS,
      providerConfig: { ...DEFAULT_SETTINGS.providerConfig },
      uiTheme: {
        baseFontSize: DEFAULT_SETTINGS.uiTheme.baseFontSize,
        palette: [...DEFAULT_SETTINGS.uiTheme.palette],
      },
    };
  }
  const raw = value as WorkspaceSettings;
  return {
    rootSeed:
      typeof raw.rootSeed === "string" && raw.rootSeed.trim().length > 0
        ? raw.rootSeed
        : DEFAULT_ROOT_SEED,
    providerMode: raw.providerMode === "external" ? "external" : "dummy",
    providerConfig: {
      ...DEFAULT_SETTINGS.providerConfig,
      ...(raw.providerConfig || {}),
      apiKey:
        raw.providerConfig && typeof raw.providerConfig.apiKey === "string"
          ? raw.providerConfig.apiKey
          : "",
    },
    uiTheme: {
      baseFontSize:
        raw.uiTheme && typeof raw.uiTheme.baseFontSize === "number"
          ? raw.uiTheme.baseFontSize
          : DEFAULT_SETTINGS.uiTheme.baseFontSize,
      palette:
        raw.uiTheme && Array.isArray(raw.uiTheme.palette) && raw.uiTheme.palette.length > 0
          ? raw.uiTheme.palette.filter((color): color is string => typeof color === "string")
          : [...DEFAULT_SETTINGS.uiTheme.palette],
    },
  };
}

function normalizeTree(value: unknown): Tree | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Tree;
  if (typeof raw.id !== "string" || typeof raw.trunkSessionId !== "string") {
    return null;
  }
  return {
    id: raw.id,
    title: typeof raw.title === "string" && raw.title.trim().length > 0 ? raw.title : "Untitled tree",
    trunkSessionId: raw.trunkSessionId,
    sessionIds: Array.isArray(raw.sessionIds)
      ? raw.sessionIds.filter((id): id is string => typeof id === "string")
      : [],
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    collapsed: typeof raw.collapsed === "boolean" ? raw.collapsed : false,
  };
}

function normalizeSessionOrigin(value: unknown): SessionOrigin | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const origin = value as SessionOrigin;
  if (
    typeof origin.sourceSessionId !== "string" ||
    typeof origin.sourceNodeId !== "string" ||
    typeof origin.quoteText !== "string"
  ) {
    return null;
  }
  return {
    sourceSessionId: origin.sourceSessionId,
    sourceNodeId: origin.sourceNodeId,
    quoteText: origin.quoteText,
    createdAt: typeof origin.createdAt === "number" ? origin.createdAt : Date.now(),
  };
}

function normalizeBranchSeed(value: unknown): BranchSeed | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const seed = value as BranchSeed;
  if (
    typeof seed.sourceTreeId !== "string" ||
    typeof seed.sourceSessionId !== "string" ||
    typeof seed.sourceNodeId !== "string" ||
    typeof seed.quoteText !== "string"
  ) {
    return null;
  }
  return {
    sourceTreeId: seed.sourceTreeId,
    sourceSessionId: seed.sourceSessionId,
    sourceNodeId: seed.sourceNodeId,
    quoteText: seed.quoteText,
    originSummary: typeof seed.originSummary === "string" ? seed.originSummary : "",
    createdAt: typeof seed.createdAt === "number" ? seed.createdAt : Date.now(),
  };
}

function normalizeSession(value: unknown): Session | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const session = value as Session;
  if (typeof session.id !== "string" || typeof session.treeId !== "string") {
    return null;
  }
  return {
    id: session.id,
    treeId: session.treeId,
    kind: session.kind === "branch" ? "branch" : "trunk",
    headNodeId: typeof session.headNodeId === "string" ? session.headNodeId : null,
    tailNodeId: typeof session.tailNodeId === "string" ? session.tailNodeId : null,
    origin: normalizeSessionOrigin(session.origin),
    branchSeed: normalizeBranchSeed(session.branchSeed),
    colorKey: typeof session.colorKey === "number" ? session.colorKey : 0,
    createdAt: typeof session.createdAt === "number" ? session.createdAt : Date.now(),
    updatedAt: typeof session.updatedAt === "number" ? session.updatedAt : Date.now(),
  };
}

function normalizeNode(value: unknown): Node | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const node = value as Node;
  if (
    typeof node.id !== "string" ||
    typeof node.sessionId !== "string" ||
    typeof node.question !== "string"
  ) {
    return null;
  }
  return {
    id: node.id,
    sessionId: node.sessionId,
    prevId: typeof node.prevId === "string" ? node.prevId : null,
    nextId: typeof node.nextId === "string" ? node.nextId : null,
    question: node.question,
    answer: typeof node.answer === "string" ? node.answer : null,
    createdAt: typeof node.createdAt === "number" ? node.createdAt : Date.now(),
    updatedAt: typeof node.updatedAt === "number" ? node.updatedAt : Date.now(),
  };
}

export function normalizeWorkspace(data: unknown): Workspace | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const raw = data as Workspace;
  const trees: Record<string, Tree> = {};
  if (raw.trees && typeof raw.trees === "object") {
    for (const [id, value] of Object.entries(raw.trees)) {
      const tree = normalizeTree(value);
      if (tree) {
        trees[id] = tree;
      }
    }
  }

  const sessions: Record<string, Session> = {};
  if (raw.sessions && typeof raw.sessions === "object") {
    for (const [id, value] of Object.entries(raw.sessions)) {
      const session = normalizeSession(value);
      if (session) {
        sessions[id] = session;
      }
    }
  }

  const nodes: Record<string, Node> = {};
  if (raw.nodes && typeof raw.nodes === "object") {
    for (const [id, value] of Object.entries(raw.nodes)) {
      const node = normalizeNode(value);
      if (node) {
        nodes[id] = node;
      }
    }
  }

  const treeIds = Object.keys(trees);
  const activeTreeId =
    typeof raw.activeTreeId === "string" && trees[raw.activeTreeId]
      ? raw.activeTreeId
      : treeIds[0] ?? null;

  const activeSessionId =
    typeof raw.activeSessionId === "string" && sessions[raw.activeSessionId]
      ? raw.activeSessionId
      : activeTreeId && trees[activeTreeId]
        ? trees[activeTreeId].trunkSessionId
        : null;

  return {
    trees,
    sessions,
    nodes,
    activeTreeId,
    activeSessionId,
    settings: coerceSettings(raw.settings),
  };
}

export function loadWorkspace(): Workspace {
  const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (!raw) {
    return createWorkspace();
  }
  try {
    const parsed = JSON.parse(raw) as Workspace;
    const normalized = normalizeWorkspace(parsed);
    return normalized ?? createWorkspace();
  } catch {
    return createWorkspace();
  }
}

export function saveWorkspace(workspace: Workspace) {
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
}
