import React from "react";
import { Node, Session, Tree } from "../models/types";

interface TreeViewProps {
  trees: Record<string, Tree>;
  sessions: Record<string, Session>;
  nodes: Record<string, Node>;
  activeTreeId: string | null;
  activeSessionId: string | null;
  selectedNodeId: string | null;
  onSelectTree: (treeId: string) => void;
  onToggleTree: (treeId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onSelectNode: (nodeId: string) => void;
}

function truncateLabel(text: string, max = 60) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "Untitled question";
  }
  return trimmed.length > max ? `${trimmed.slice(0, max - 3)}...` : trimmed;
}

function getSessionNodes(session: Session, nodes: Record<string, Node>) {
  if (!session.headNodeId) {
    return [];
  }
  const chain: Node[] = [];
  let currentId: string | null = session.headNodeId;
  const visited = new Set<string>();
  while (currentId) {
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);
    const node = nodes[currentId];
    if (!node) {
      break;
    }
    chain.push(node);
    currentId = node.nextId;
  }
  return chain;
}

function getBranchSessionsBySource(
  sessions: Record<string, Session>
): Map<string, Session[]> {
  const map = new Map<string, Session[]>();
  Object.values(sessions).forEach((session) => {
    if (session.kind === "branch" && session.origin) {
      const list = map.get(session.origin.sourceNodeId) ?? [];
      list.push(session);
      map.set(session.origin.sourceNodeId, list);
    }
  });
  return map;
}

function getOriginLabel(session: Session, nodes: Record<string, Node>) {
  if (!session.origin) {
    return "Branch";
  }
  const source = nodes[session.origin.sourceNodeId];
  if (!source) {
    return "Branch";
  }
  return `Branch from: ${truncateLabel(source.question)}`;
}

function SessionChain({
  session,
  nodes,
  sessions,
  depth,
  activeSessionId,
  selectedNodeId,
  onSelectSession,
  onSelectNode,
  branchSessionsBySource,
}: {
  session: Session;
  nodes: Record<string, Node>;
  sessions: Record<string, Session>;
  depth: number;
  activeSessionId: string | null;
  selectedNodeId: string | null;
  onSelectSession: (sessionId: string) => void;
  onSelectNode: (nodeId: string) => void;
  branchSessionsBySource: Map<string, Session[]>;
}) {
  const chainNodes = getSessionNodes(session, nodes);
  const isActiveSession = session.id === activeSessionId;

  return (
    <div>
      {session.kind === "branch" ? (
        <div
          className={`tree-branch-label ${isActiveSession ? "active" : ""}`}
          style={{ paddingLeft: depth * 14 }}
        >
          <button
            className="tree-branch-title"
            type="button"
            onClick={() => onSelectSession(session.id)}
          >
            {getOriginLabel(session, nodes)}
          </button>
        </div>
      ) : null}

      {chainNodes.map((node) => (
        <div key={node.id}>
          <div
            className={`tree-item ${selectedNodeId === node.id ? "selected" : ""}`}
            style={{ paddingLeft: depth * 14 }}
          >
            <button
              className="tree-label"
              type="button"
              onClick={() => onSelectNode(node.id)}
            >
              {truncateLabel(node.question)}
            </button>
          </div>

          {(branchSessionsBySource.get(node.id) || []).map((branchSession) => (
            <SessionChain
              key={branchSession.id}
              session={branchSession}
              nodes={nodes}
              sessions={sessions}
              depth={depth + 1}
              activeSessionId={activeSessionId}
              selectedNodeId={selectedNodeId}
              onSelectSession={onSelectSession}
              onSelectNode={onSelectNode}
              branchSessionsBySource={branchSessionsBySource}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function TreeView({
  trees,
  sessions,
  nodes,
  activeTreeId,
  activeSessionId,
  selectedNodeId,
  onSelectTree,
  onToggleTree,
  onSelectSession,
  onSelectNode,
}: TreeViewProps) {
  const treeEntries = Object.values(trees);
  const branchSessionsBySource = getBranchSessionsBySource(sessions);

  if (treeEntries.length === 0) {
    return <div className="empty-state">No trees yet.</div>;
  }

  return (
    <div className="tree-list">
      {treeEntries.map((tree) => {
        const isActive = tree.id === activeTreeId;
        const trunkSession = sessions[tree.trunkSessionId];
        return (
          <div key={tree.id} className={`tree-group ${isActive ? "active" : ""}`}>
            <div className="tree-header">
              <button
                className="tree-toggle"
                type="button"
                onClick={() => onToggleTree(tree.id)}
              >
                {tree.collapsed ? ">" : "v"}
              </button>
              <button
                className="tree-title"
                type="button"
                onClick={() => onSelectTree(tree.id)}
              >
                {tree.title}
              </button>
            </div>
            {!tree.collapsed && trunkSession ? (
              <SessionChain
                session={trunkSession}
                nodes={nodes}
                sessions={sessions}
                depth={0}
                activeSessionId={activeSessionId}
                selectedNodeId={selectedNodeId}
                onSelectSession={onSelectSession}
                onSelectNode={onSelectNode}
                branchSessionsBySource={branchSessionsBySource}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
