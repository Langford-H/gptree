import React from "react";
import { Workspace } from "../models/types";

interface TreeViewProps {
  workspace: Workspace;
  activeNodeId: string;
  expandedNodeIds: string[];
  onSelectNode: (nodeId: string) => void;
  onToggleExpand: (nodeId: string) => void;
}

function TreeNode({
  nodeId,
  depth,
  workspace,
  activeNodeId,
  expandedNodeIds,
  onSelectNode,
  onToggleExpand,
}: {
  nodeId: string;
  depth: number;
  workspace: Workspace;
  activeNodeId: string;
  expandedNodeIds: string[];
  onSelectNode: (nodeId: string) => void;
  onToggleExpand: (nodeId: string) => void;
}) {
  const node = workspace.nodes[nodeId];
  const isExpanded = expandedNodeIds.includes(nodeId);
  const hasChildren = node.childrenIds.length > 0;

  return (
    <div>
      <div
        className={`tree-item ${nodeId === activeNodeId ? "active" : ""}`}
        style={{ paddingLeft: depth * 14 }}
      >
        {hasChildren ? (
          <button
            className="tree-toggle"
            onClick={() => onToggleExpand(nodeId)}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            type="button"
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="tree-toggle-placeholder" />
        )}
        <button
          className="tree-label"
          onClick={() => onSelectNode(nodeId)}
          type="button"
        >
          {node.title}
        </button>
        <span className={`status-badge status-${node.status}`}>{node.status}</span>
      </div>
      {hasChildren && isExpanded
        ? node.childrenIds.map((childId) => (
            <TreeNode
              key={childId}
              nodeId={childId}
              depth={depth + 1}
              workspace={workspace}
              activeNodeId={activeNodeId}
              expandedNodeIds={expandedNodeIds}
              onSelectNode={onSelectNode}
              onToggleExpand={onToggleExpand}
            />
          ))
        : null}
    </div>
  );
}

export default function TreeView({
  workspace,
  activeNodeId,
  expandedNodeIds,
  onSelectNode,
  onToggleExpand,
}: TreeViewProps) {
  return (
    <div className="tree">
      <TreeNode
        nodeId={workspace.rootNodeId}
        depth={0}
        workspace={workspace}
        activeNodeId={activeNodeId}
        expandedNodeIds={expandedNodeIds}
        onSelectNode={onSelectNode}
        onToggleExpand={onToggleExpand}
      />
    </div>
  );
}
