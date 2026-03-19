import React, { useEffect, useRef, useState } from "react";
import { Node, Session, Tree } from "../models/types";

interface TreeViewProps {
  trees: Record<string, Tree>;
  sessions: Record<string, Session>;
  nodes: Record<string, Node>;
  activeTreeId: string | null;
  activeSessionId: string | null;
  selectedNodeId: string | null;
  palette: string[];
  onSelectTree: (treeId: string) => void;
  onToggleTree: (treeId: string) => void;
  onRenameTree: (treeId: string, title: string) => void;
  onRenameNode: (nodeId: string, title: string) => void;
  onSelectSession: (sessionId: string) => void;
  onSelectNode: (nodeId: string) => void;
}

const TREE_LABEL_MAX = 45;
const TREE_LABEL_BREAK = 25;

function normalizeLabelText(text: string) {
  return text
    .replace(/\$\$/g, "")
    .replace(/\$/g, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateLabel(text: string, max = TREE_LABEL_MAX) {
  const trimmed = normalizeLabelText(text);
  if (!trimmed) {
    return "Untitled question";
  }
  return trimmed.length > max ? `${trimmed.slice(0, max - 3)}...` : trimmed;
}

function splitLabel(text: string) {
  const truncated = truncateLabel(text);
  if (truncated.length <= TREE_LABEL_BREAK) {
    return { first: truncated, second: "" };
  }
  return {
    first: truncated.slice(0, TREE_LABEL_BREAK),
    second: truncated.slice(TREE_LABEL_BREAK),
  };
}

function renderLabel(text: string) {
  const { first, second } = splitLabel(text);
  if (!second) {
    return first;
  }
  return (
    <>
      {first}
      <br />
      {second}
    </>
  );
}

function getNodeLabel(node: Node) {
  return node.title && node.title.trim().length > 0 ? node.title : node.question;
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
  return `Branch from: ${truncateLabel(getNodeLabel(source))}`;
}

const COLLAPSED_ARROW = "\u25B8";
const EXPANDED_ARROW = "\u25BE";

function SessionChain({
  session,
  nodes,
  depth,
  activeSessionId,
  selectedNodeId,
  onSelectSession,
  onSelectNode,
  onRenameNode,
  branchSessionsBySource,
  palette,
}: {
  session: Session;
  nodes: Record<string, Node>;
  depth: number;
  activeSessionId: string | null;
  selectedNodeId: string | null;
  onSelectSession: (sessionId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onRenameNode: (nodeId: string, title: string) => void;
  branchSessionsBySource: Map<string, Session[]>;
  palette: string[];
}) {
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [draftNodeTitle, setDraftNodeTitle] = useState("");
  const chainNodes = getSessionNodes(session, nodes);
  const isActiveSession = session.id === activeSessionId;
  const sessionColor = palette.length
    ? palette[Math.abs(session.colorKey) % palette.length]
    : "#5b9bff";

  const finishEditingNode = (node: Node) => {
    onRenameNode(node.id, normalizeLabelText(draftNodeTitle) || node.question);
    setEditingNodeId(null);
    setDraftNodeTitle("");
  };

  return (
    <div>
      {session.kind === "branch" ? (
        <div
          className={`tree-branch-label ${isActiveSession ? "active" : ""}`}
          style={{ paddingLeft: depth * 14 }}
        >
          <span className="tree-band" style={{ background: sessionColor }} />
          <span className="tree-connector" style={{ background: sessionColor }} />
          <button
            className="tree-branch-title"
            type="button"
            onClick={() => onSelectSession(session.id)}
          >
            <span className="tree-kind">B</span>
            {renderLabel(getOriginLabel(session, nodes))}
          </button>
        </div>
      ) : null}

      {chainNodes.map((node) => (
        <div key={node.id}>
          <div
            className={`tree-item ${selectedNodeId === node.id ? "selected" : ""}`}
            style={{ paddingLeft: depth * 14 }}
          >
            <span className="tree-band" style={{ background: sessionColor }} />
            <span
              className={`commit-dot ${node.answer ? "filled" : "pending"}`}
              style={{ borderColor: sessionColor, color: sessionColor }}
            />
            {editingNodeId === node.id ? (
              <input
                className="tree-node-input"
                value={draftNodeTitle}
                onChange={(event) => setDraftNodeTitle(event.target.value)}
                onBlur={() => finishEditingNode(node)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    finishEditingNode(node);
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setEditingNodeId(null);
                    setDraftNodeTitle("");
                  }
                }}
                autoFocus
              />
            ) : (
              <button
                className="tree-label"
                type="button"
                onClick={() => onSelectNode(node.id)}
                onDoubleClick={() => {
                  setEditingNodeId(node.id);
                  setDraftNodeTitle(getNodeLabel(node));
                }}
                title="Double-click to rename"
              >
                {renderLabel(getNodeLabel(node))}
              </button>
            )}
          </div>

          {(branchSessionsBySource.get(node.id) || []).map((branchSession) => (
            <SessionChain
              key={branchSession.id}
              session={branchSession}
              nodes={nodes}
              depth={depth + 1}
              activeSessionId={activeSessionId}
              selectedNodeId={selectedNodeId}
              onSelectSession={onSelectSession}
              onSelectNode={onSelectNode}
              onRenameNode={onRenameNode}
              branchSessionsBySource={branchSessionsBySource}
              palette={palette}
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
  palette,
  onSelectTree,
  onToggleTree,
  onRenameTree,
  onRenameNode,
  onSelectSession,
  onSelectNode,
}: TreeViewProps) {
  const [editingTreeId, setEditingTreeId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const treeEntries = Object.values(trees);
  const branchSessionsBySource = getBranchSessionsBySource(sessions);

  useEffect(() => {
    if (!editingTreeId) {
      return;
    }
    const tree = trees[editingTreeId];
    if (!tree) {
      setEditingTreeId(null);
      setDraftTitle("");
    }
  }, [editingTreeId, trees]);

  useEffect(() => {
    if (!editingTreeId || !titleInputRef.current) {
      return;
    }
    titleInputRef.current.focus();
    titleInputRef.current.select();
  }, [editingTreeId]);

  const startEditingTree = (tree: Tree) => {
    setEditingTreeId(tree.id);
    setDraftTitle(tree.title);
  };

  const finishEditingTree = (tree: Tree) => {
    const nextTitle = normalizeLabelText(draftTitle) || "Untitled tree";
    onRenameTree(tree.id, nextTitle);
    setEditingTreeId(null);
    setDraftTitle("");
  };

  const cancelEditingTree = () => {
    setEditingTreeId(null);
    setDraftTitle("");
  };

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
                {tree.collapsed ? COLLAPSED_ARROW : EXPANDED_ARROW}
              </button>
              {editingTreeId === tree.id ? (
                <div className="tree-title tree-title-editing">
                  <span className="tree-kind">T</span>
                  <input
                    ref={titleInputRef}
                    className="tree-title-input"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onBlur={() => finishEditingTree(tree)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        finishEditingTree(tree);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        cancelEditingTree();
                      }
                    }}
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  className="tree-title"
                  type="button"
                  onClick={() => onSelectTree(tree.id)}
                  onDoubleClick={() => startEditingTree(tree)}
                  title="Double-click to rename"
                >
                  <span className="tree-kind">T</span>
                  {renderLabel(tree.title)}
                </button>
              )}
            </div>
            {!tree.collapsed && trunkSession ? (
              <SessionChain
                session={trunkSession}
                nodes={nodes}
                depth={0}
                activeSessionId={activeSessionId}
                selectedNodeId={selectedNodeId}
                onSelectSession={onSelectSession}
                onSelectNode={onSelectNode}
                onRenameNode={onRenameNode}
                branchSessionsBySource={branchSessionsBySource}
                palette={palette}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
