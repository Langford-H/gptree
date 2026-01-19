import React, { useEffect, useRef, useState } from "react";
import { Message, Node } from "../models/types";
import QuoteCard from "./QuoteCard";

interface ChatPaneProps {
  node: Node;
  breadcrumb: string[];
  isGenerating: boolean;
  quoteSourceTitle?: string;
  onOpenSource: () => void;
  onSend: (text: string) => void;
  onCreateBranch: (quoteText: string) => void;
  onMergeInline: () => void;
  onMergeLink: () => void;
  onOpenNode: (nodeId: string) => void;
}

function MessageBubble({
  message,
  onOpenNode,
}: {
  message: Message;
  onOpenNode: (nodeId: string) => void;
}) {
  if (message.meta?.linkNodeId) {
    return (
      <div className={`message ${message.role}`}>
        <div>{message.text}</div>
        <button
          className="link-button"
          type="button"
          onClick={() => onOpenNode(message.meta?.linkNodeId ?? "")}
        >
          Open Branch
        </button>
      </div>
    );
  }

  return <div className={`message ${message.role}`}>{message.text}</div>;
}

export default function ChatPane({
  node,
  breadcrumb,
  isGenerating,
  quoteSourceTitle,
  onOpenSource,
  onSend,
  onCreateBranch,
  onMergeInline,
  onMergeLink,
  onOpenNode,
}: ChatPaneProps) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const [composerText, setComposerText] = useState("");
  const [selectionError, setSelectionError] = useState("");

  useEffect(() => {
    setComposerText("");
    setSelectionError("");
  }, [node.id]);

  useEffect(() => {
    const element = transcriptRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [node.messages]);

  const handleSend = () => {
    const text = composerText.trim();
    if (!text || isGenerating) {
      return;
    }

    setComposerText("");
    onSend(text);
  };

  const handleCreateBranch = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionError("Select transcript text first.");
      return;
    }

    const quoteText = selection.toString().trim();
    if (!quoteText) {
      setSelectionError("Selection is empty.");
      return;
    }

    const anchorNode = selection.anchorNode;
    if (transcriptRef.current && anchorNode) {
      if (!transcriptRef.current.contains(anchorNode)) {
        setSelectionError("Selection must be inside the transcript.");
        return;
      }
    }

    selection.removeAllRanges();
    setSelectionError("");
    onCreateBranch(quoteText);
  };

  const canMerge = Boolean(node.parentId);

  return (
    <div className="chat-pane">
      <div className="pane-header">
        <div>
          <h2 className="pane-title">{node.title}</h2>
          <div className="breadcrumb">{breadcrumb.join(" / ")}</div>
        </div>
        <div className="pane-actions">
          <span className={`status-badge status-${node.status}`}>{node.status}</span>
        </div>
      </div>

      {node.anchor && quoteSourceTitle ? (
        <QuoteCard
          anchor={node.anchor}
          sourceTitle={quoteSourceTitle}
          onOpenSource={onOpenSource}
        />
      ) : null}

      <div className="transcript" ref={transcriptRef}>
        {node.messages.length === 0 ? (
          <div className="empty-state">No messages yet.</div>
        ) : (
          node.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onOpenNode={onOpenNode}
            />
          ))
        )}
      </div>

      <div className="composer">
        <textarea
          value={composerText}
          onChange={(event) => setComposerText(event.target.value)}
          placeholder="Write a message..."
        />
        {selectionError ? (
          <div className="selection-error">{selectionError}</div>
        ) : null}
        <div className="composer-actions">
          <button
            className="button-secondary"
            type="button"
            onClick={handleCreateBranch}
          >
            Create Branch from Quote
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={onMergeInline}
            disabled={!canMerge}
          >
            Merge Inline
          </button>
          <button
            className="button-secondary"
            type="button"
            onClick={onMergeLink}
            disabled={!canMerge}
          >
            Merge as Link
          </button>
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
