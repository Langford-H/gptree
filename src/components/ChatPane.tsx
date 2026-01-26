import React, { useEffect, useRef, useState } from "react";
import { Node } from "../models/types";

interface ChatPaneProps {
  nodes: Node[];
  treeTitle: string;
  sessionLabel: string;
  sessionKind: "trunk" | "branch";
  branchQuote?: string;
  selectedNodeId?: string | null;
  scrollToNodeId?: string | null;
  errorMessage?: string;
  isGenerating: boolean;
  onNewQuestion: () => void;
  onCreateBranch: (quoteText: string, sourceNodeId: string) => void;
  onClearAll: () => void;
  onSend: (text: string) => void;
  onScrollComplete: () => void;
}

function findNodeIdFromSelection(selection: Selection | null) {
  if (!selection) {
    return null;
  }
  const nodes = [selection.anchorNode, selection.focusNode];
  for (const node of nodes) {
    if (!node) {
      continue;
    }
    const element = node instanceof Element ? node : node.parentElement;
    const container = element?.closest("[data-node-id]");
    if (container) {
      return container.getAttribute("data-node-id");
    }
  }
  return null;
}

export default function ChatPane({
  nodes,
  treeTitle,
  sessionLabel,
  sessionKind,
  branchQuote,
  selectedNodeId,
  scrollToNodeId,
  errorMessage,
  isGenerating,
  onNewQuestion,
  onCreateBranch,
  onClearAll,
  onSend,
  onScrollComplete,
}: ChatPaneProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<{ text: string; nodeId: string } | null>(null);
  const [composerText, setComposerText] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [selectionHint, setSelectionHint] = useState("");

  useEffect(() => {
    if (!scrollToNodeId || !transcriptRef.current) {
      return;
    }
    const target = transcriptRef.current.querySelector(
      `[data-node-id="${scrollToNodeId}"]`
    ) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    onScrollComplete();
  }, [scrollToNodeId, onScrollComplete]);

  const handleSend = () => {
    const text = composerText.trim();
    if (!text || isGenerating) {
      return;
    }
    setComposerText("");
    onSend(text);
  };

  const captureSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      selectionRef.current = null;
      setSelectionHint("");
      return;
    }
    const quoteText = selection.toString().trim();
    if (!quoteText) {
      selectionRef.current = null;
      setSelectionHint("");
      return;
    }
    const nodeId = findNodeIdFromSelection(selection);
    if (!nodeId) {
      selectionRef.current = null;
      setSelectionHint("");
      return;
    }
    selectionRef.current = { text: quoteText, nodeId };
    setSelectionError("");
    setSelectionHint("Quote selected. Click Create Branch from Quote.");
  };

  const handleCreateBranch = () => {
    const selection = selectionRef.current;
    if (!selection) {
      setSelectionError("Select text in the transcript first.");
      return;
    }
    setSelectionError("");
    selectionRef.current = null;
    setSelectionHint("");
    onCreateBranch(selection.text, selection.nodeId);
  };

  return (
    <div className="chat-pane">
      <div className="pane-header">
        <div>
          <h2 className="pane-title">{treeTitle}</h2>
          <div className="breadcrumb">
            <span className="session-badge">{sessionKind === "trunk" ? "TRUNK" : "BRANCH"}</span>
            <span>{sessionLabel}</span>
          </div>
        </div>
        <div className="pane-actions">
          <button className="button-secondary" type="button" onClick={onNewQuestion}>
            New Question
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={handleCreateBranch}
            title="Select text in the transcript to create a branch session."
          >
            Create Branch from Quote
          </button>
          <button className="button-secondary" type="button" onClick={onClearAll}>
            Clear All
          </button>
        </div>
      </div>

      {sessionKind === "branch" && branchQuote ? (
        <div className="branch-banner">
          <div className="branch-title">Branch discussion</div>
          <div className="branch-quote">{branchQuote}</div>
        </div>
      ) : null}

      <div className="chat-transcript" ref={transcriptRef} onMouseUp={captureSelection}>
        {nodes.length === 0 ? (
          <div className="empty-transcript">
            No messages yet. Ask a question to start this chat.
          </div>
        ) : (
          nodes.map((node, index) => {
            const isLast = index === nodes.length - 1;
            return (
            <div
              key={node.id}
              className={`message-group ${
                selectedNodeId === node.id ? "selected" : ""
              }`}
              data-node-id={node.id}
            >
              <div className="message message-user">{node.question}</div>
              <div className="message message-assistant">
                {node.answer
                  ? node.answer
                  : isGenerating && isLast
                    ? "Generating response..."
                    : "Awaiting response."}
              </div>
            </div>
            );
          })
        )}
      </div>

      {selectionError ? <div className="selection-error">{selectionError}</div> : null}
      {selectionHint ? <div className="selection-hint">{selectionHint}</div> : null}
      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

      <div className="composer">
        <textarea
          value={composerText}
          onChange={(event) => setComposerText(event.target.value)}
          placeholder="Type your question..."
        />
        <div className="composer-actions">
          <button
            className="button-primary"
            type="button"
            onClick={handleSend}
            disabled={isGenerating}
          >
            {isGenerating ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
