import { Anchor, Node, Workspace } from "../models/types";
import { createId } from "../utils/id";

const WORKSPACE_STORAGE_KEY = "gptree_workspace_v020";

export function createNode(options: {
  parentId: string | null;
  title: string;
  anchor?: Anchor;
}): Node {
  const now = Date.now();
  return {
    id: createId("node"),
    parentId: options.parentId,
    childrenIds: [],
    title: options.title,
    status: "draft",
    anchor: options.anchor,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createWorkspace(): Workspace {
  const now = Date.now();
  const rootNode: Node = {
    id: createId("node"),
    parentId: null,
    childrenIds: [],
    title: "Root",
    status: "open",
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  return {
    workspaceId: createId("ws"),
    createdAt: now,
    updatedAt: now,
    rootNodeId: rootNode.id,
    nodes: {
      [rootNode.id]: rootNode,
    },
    ui: {
      activeNodeId: rootNode.id,
      expandedNodeIds: [rootNode.id],
    },
  };
}

export function normalizeWorkspace(data: unknown): Workspace | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  const raw = data as Workspace;
  if (!raw.nodes || typeof raw.rootNodeId !== "string") {
    return null;
  }

  if (!raw.nodes[raw.rootNodeId]) {
    return null;
  }

  const ui = raw.ui || { activeNodeId: raw.rootNodeId, expandedNodeIds: [] };
  const activeNodeId =
    typeof ui.activeNodeId === "string" && raw.nodes[ui.activeNodeId]
      ? ui.activeNodeId
      : raw.rootNodeId;
  const expandedNodeIds = Array.isArray(ui.expandedNodeIds)
    ? ui.expandedNodeIds.filter(
        (value): value is string =>
          typeof value === "string" && raw.nodes[value]
      )
    : [];

  return {
    workspaceId:
      typeof raw.workspaceId === "string" ? raw.workspaceId : createId("ws"),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    rootNodeId: raw.rootNodeId,
    nodes: raw.nodes,
    ui: {
      activeNodeId,
      expandedNodeIds:
        expandedNodeIds.length > 0 ? expandedNodeIds : [raw.rootNodeId],
    },
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
