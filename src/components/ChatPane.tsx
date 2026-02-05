import React, { useEffect, useMemo, useRef, useState } from "react";
import MarkdownIt from "markdown-it";
import katex from "katex";
import type { Node as WorkspaceNode } from "../models/types";

interface ChatPaneProps {
  nodes: WorkspaceNode[];
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

function injectMath(text: string) {
  const replacements = new Map<string, string>();
  let tokenIndex = 0;
  const withBlocks = text
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expr) => {
      const token = `@@KATEX_BLOCK_${tokenIndex++}@@`;
      replacements.set(
        token,
        katex.renderToString(String(expr).trim(), {
          throwOnError: false,
          displayMode: true,
        })
      );
      return token;
    })
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, expr) => {
      const token = `@@KATEX_BLOCK_${tokenIndex++}@@`;
      replacements.set(
        token,
        katex.renderToString(String(expr).trim(), {
          throwOnError: false,
          displayMode: true,
        })
      );
      return token;
    });
  const withInline = withBlocks
    .replace(/\\\(((?:.|\n)*?)\\\)/g, (_, expr) => {
      const token = `@@KATEX_INLINE_${tokenIndex++}@@`;
      replacements.set(
        token,
        katex.renderToString(String(expr).trim(), {
          throwOnError: false,
          displayMode: false,
        })
      );
      return token;
    })
    .replace(/\$(\s*[^$]*?\s*)\$/g, (_, expr) => {
      const token = `@@KATEX_INLINE_${tokenIndex++}@@`;
      replacements.set(
        token,
        katex.renderToString(String(expr).trim(), {
          throwOnError: false,
          displayMode: false,
        })
      );
      return token;
    });
  return { text: withInline, replacements };
}

function renderWithMath(markdown: MarkdownIt, text: string) {
  const { text: normalized, replacements } = injectMath(text.trimEnd());
  let html = markdown.render(normalized);
  replacements.forEach((value, key) => {
    html = html.split(key).join(value);
  });
  return sanitizeRenderedHtml(html);
}

function renderMarkdown(markdown: MarkdownIt, text: string) {
  return sanitizeRenderedHtml(markdown.render(text.trimEnd()));
}

function sanitizeRenderedHtml(html: string) {
  return html
    .replace(/(?:<p><br\s*\/?><\/p>\s*)+$/gi, "")
    .replace(/(<br\s*\/?\s*>\s*)+$/gi, "")
    .replace(/(?:<p>\s*<\/p>\s*)+$/gi, "")
    .replace(/\s+$/g, "");
}
function normalizeWithMap(source: string) {
  const normalizedChars: string[] = [];
  const indexMap: number[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (!/[a-z0-9]/i.test(char)) {
      continue;
    }
    normalizedChars.push(char.toLowerCase());
    indexMap.push(i);
  }
  return { normalized: normalizedChars.join(""), indexMap };
}

function normalizePlain(text: string) {
  return text.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function findSourceSlice(source: string, selectionText: string) {
  if (!source || !selectionText) {
    return selectionText;
  }
  const directIndex = source.indexOf(selectionText);
  if (directIndex >= 0) {
    return source.slice(directIndex, directIndex + selectionText.length);
  }
  const { normalized: normalizedSource, indexMap } = normalizeWithMap(source);
  const normalizedSelection = normalizePlain(selectionText);
  if (!normalizedSelection) {
    return selectionText;
  }
  const normalizedIndex = normalizedSource.indexOf(normalizedSelection);
  if (normalizedIndex < 0) {
    return selectionText;
  }
  const start = indexMap[Math.min(normalizedIndex, indexMap.length - 1)];
  const endIndex = normalizedIndex + normalizedSelection.length - 1;
  const end = indexMap[Math.min(endIndex, indexMap.length - 1)] ?? start;
  return source.slice(start, end + 1);
}


function extractSelectionText(selection: Selection) {
  const range = selection.getRangeAt(0);
  const ancestor =
    (range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement) ?? null;
  const katexElements = ancestor
    ? Array.from(ancestor.querySelectorAll(".katex, .katex-display"))
    : [];
  if (katexElements.length === 0) {
    return selection.toString().trim();
  }
  const fragment = range.cloneContents();
  const walker = document.createTreeWalker(
    fragment,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
  );
  const pieces: string[] = [];
  let current: globalThis.Node | null = walker.nextNode();
  while (current) {
    if (current.nodeType === globalThis.Node.TEXT_NODE) {
      const text = current.textContent ?? "";
      if (text.trim()) {
        pieces.push(text);
      }
      current = walker.nextNode();
      continue;
    }
    const element = current as Element;
    if (element.classList.contains("katex") || element.classList.contains("katex-display")) {
      const annotation = element.querySelector("annotation");
      const tex = annotation?.textContent?.trim();
      if (tex) {
        const isDisplay = Boolean(
          element.classList.contains("katex-display") ||
            element.closest(".katex-display")
        );
        pieces.push(isDisplay ? `$$${tex}$$` : `$${tex}$`);
      }
      walker.currentNode = element;
      current = walker.nextSibling();
      continue;
    }
    current = walker.nextNode();
  }
  return pieces.join(" ").replace(/\s+/g, " ").trim();
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
  const markdown = useMemo(
    () =>
      new MarkdownIt({
        linkify: true,
        breaks: true,
      }),
    []
  );

  useEffect(() => {
    if (!scrollToNodeId || !transcriptRef.current) {
      return;
    }
    const target = transcriptRef.current.querySelector(
      `[data-node-id="${scrollToNodeId}"]`
    ) as HTMLElement | null;
    if (target) {
      const container = transcriptRef.current;
      const offsetTop = target.offsetTop;
      const nextTop = Math.max(0, offsetTop - container.clientHeight / 2);
      container.scrollTo({ top: nextTop, behavior: "smooth" });
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

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    handleSend();
  };

  const captureSelection = () => {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    selectionRef.current = null;
    setSelectionHint("");
      return;
    }
    const quoteText = extractSelectionText(selection);
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
    const sourceNode = nodes.find((item) => item.id === nodeId);
    const sourceText = sourceNode?.answer || sourceNode?.question || "";
    const mappedText = findSourceSlice(sourceText, quoteText);
    selectionRef.current = { text: mappedText, nodeId };
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
              <div
                className="message message-user"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(markdown, node.question),
                }}
              />
              <div className="message message-assistant">
                {node.answer ? (
                  <div
                    className="message-content"
                    dangerouslySetInnerHTML={{ __html: renderWithMath(markdown, node.answer) }}
                  />
                ) : (
                  <div className="message-content">
                    {isGenerating && isLast ? "Generating response..." : "Awaiting response."}
                  </div>
                )}
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
        <div className="composer-row">
          <textarea
            value={composerText}
            onChange={(event) => setComposerText(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Type your question..."
          />
          <button
            className="button-primary composer-send"
            type="button"
            onClick={handleSend}
            disabled={isGenerating}
          >
            <span className="composer-send-icon">{isGenerating ? "…" : "→"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
