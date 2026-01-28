import React, { useMemo, useState } from "react";
import ChatPane from "./components/ChatPane";
import SettingsModal from "./components/SettingsModal";
import TreeView from "./components/TreeView";
import { ProviderMessage } from "./providers/AIProvider";
import { DummyProvider } from "./providers/DummyProvider";
import { OpenAICompatibleProvider } from "./providers/OpenAICompatibleProvider";
import { Node, Session, Tree, Workspace } from "./models/types";
import {
  createNode,
  createSession,
  createTree,
  createWorkspace,
  loadWorkspace,
  normalizeWorkspace,
  saveWorkspace,
} from "./store/workspaceStore";
import { BRANCH_INSTRUCTION, BRANCH_SUMMARIZER_PROMPT } from "./constants/prompts";

const EXPORT_VERSION = "0.2.2";
const BRANCH_SUMMARY_CONTEXT_NODES = 4;
const MAX_HISTORY_NODES = 6;

function truncateText(text: string, max = 60) {
  const trimmed = text.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 3)}...`;
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

function buildHistoryMessages(nodes: Node[], limit: number): ProviderMessage[] {
  const transcriptNodes = nodes.filter((node) => node.question.trim().length > 0);
  const start = Math.max(0, transcriptNodes.length - limit);
  const recent = transcriptNodes.slice(start);
  const messages: ProviderMessage[] = [];
  for (const node of recent) {
    messages.push({ role: "user", content: node.question });
    if (node.answer) {
      messages.push({ role: "assistant", content: node.answer });
    }
  }
  return messages;
}

function buildTrunkContext(tree: Tree, nodeCount: number) {
  return [`Tree: ${tree.id}`, `Node count: ${nodeCount}`].join("\n");
}

function buildBranchContext(origin: { quoteText: string; originSummary: string }) {
  const lines = ["Branch session: true", "Quoted span:", "<<<", origin.quoteText, ">>>"];
  lines.push("", "Origin summary:", "<<<", origin.originSummary, ">>>");
  return lines.join("\n");
}

function buildSummarizerContext(options: {
  quoteText: string;
  sourceNode: Node;
  precedingNodes: Node[];
}) {
  const lines = ["Quoted span:", "<<<", options.quoteText, ">>>"];
  lines.push("", "Source node question:", "<<<", options.sourceNode.question, ">>>");
  lines.push("", "Source node answer:", "<<<", options.sourceNode.answer || "", ">>>");
  if (options.precedingNodes.length > 0) {
    lines.push("", "Recent preceding nodes:");
    options.precedingNodes.forEach((node, index) => {
      lines.push(
        `- Q${index + 1}: ${node.question}`,
        `  A${index + 1}: ${node.answer || ""}`
      );
    });
  }
  return lines.join("\n");
}

function computeColorKey(sessionId: string, paletteLength: number) {
  if (paletteLength <= 0) {
    return 0;
  }
  let hash = 0;
  for (let i = 0; i < sessionId.length; i += 1) {
    hash = (hash * 31 + sessionId.charCodeAt(i)) % 9973;
  }
  return Math.abs(hash) % paletteLength;
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const activeTree = workspace.activeTreeId
    ? workspace.trees[workspace.activeTreeId]
    : null;
  const activeSession = workspace.activeSessionId
    ? workspace.sessions[workspace.activeSessionId]
    : null;

  const activeSessionNodes = useMemo(() => {
    if (!activeSession) {
      return [];
    }
    return getSessionNodes(activeSession, workspace.nodes);
  }, [activeSession, workspace.nodes]);

  const persistWorkspace = (next: Workspace) => {
    saveWorkspace(next);
    return next;
  };

  const updateWorkspace = (updater: (current: Workspace) => Workspace) => {
    setWorkspace((current) => persistWorkspace(updater(current)));
  };

  const resetUI = () => {
    setErrorMessage(undefined);
    setSelectedNodeId(null);
    setScrollTargetId(null);
  };

  const handleSelectTree = (treeId: string) => {
    resetUI();
    updateWorkspace((current) => {
      const tree = current.trees[treeId];
      if (!tree) {
        return current;
      }
      return {
        ...current,
        activeTreeId: treeId,
        activeSessionId: tree.trunkSessionId,
        trees: {
          ...current.trees,
          [treeId]: {
            ...tree,
            collapsed: false,
          },
        },
      };
    });
  };

  const handleToggleTree = (treeId: string) => {
    updateWorkspace((current) => {
      const tree = current.trees[treeId];
      if (!tree) {
        return current;
      }
      return {
        ...current,
        trees: {
          ...current.trees,
          [treeId]: {
            ...tree,
            collapsed: !tree.collapsed,
          },
        },
      };
    });
  };

  const handleSelectSession = (sessionId: string) => {
    const session = workspace.sessions[sessionId];
    if (!session) {
      return;
    }
    resetUI();
    updateWorkspace((current) => {
      const tree = current.trees[session.treeId];
      return {
        ...current,
        activeTreeId: session.treeId,
        activeSessionId: sessionId,
        trees: tree
          ? {
              ...current.trees,
              [tree.id]: {
                ...tree,
                collapsed: false,
              },
            }
          : current.trees,
      };
    });
  };

  const handleSelectNode = (nodeId: string) => {
    const node = workspace.nodes[nodeId];
    if (!node) {
      return;
    }
    const session = workspace.sessions[node.sessionId];
    if (!session) {
      return;
    }
    setErrorMessage(undefined);
    setSelectedNodeId(nodeId);
    setScrollTargetId(nodeId);
    updateWorkspace((current) => {
      const tree = current.trees[session.treeId];
      return {
        ...current,
        activeTreeId: session.treeId,
        activeSessionId: session.id,
        trees: tree
          ? {
              ...current.trees,
              [tree.id]: {
                ...tree,
                collapsed: false,
              },
            }
          : current.trees,
      };
    });
  };

  const handleNewQuestion = () => {
    resetUI();
    const { tree, session } = createTree();
    updateWorkspace((current) => ({
      ...current,
      trees: {
        ...Object.fromEntries(
          Object.entries(current.trees).map(([id, value]) => [
            id,
            id === current.activeTreeId ? { ...value, collapsed: true } : value,
          ])
        ),
        [tree.id]: tree,
      },
      sessions: {
        ...current.sessions,
        [session.id]: session,
      },
      activeTreeId: tree.id,
      activeSessionId: session.id,
    }));
  };

  const handleCreateBranch = (quoteText: string, sourceNodeId: string) => {
    if (!activeTree || !activeSession) {
      return;
    }
    const sourceNode = workspace.nodes[sourceNodeId];
    if (!sourceNode) {
      return;
    }
    setErrorMessage(undefined);
    const origin = {
      sourceSessionId: sourceNode.sessionId,
      sourceNodeId,
      quoteText,
      createdAt: Date.now(),
    };
    const branchSession = createSession({
      treeId: activeTree.id,
      kind: "branch",
      origin,
      branchSeed: {
        sourceTreeId: activeTree.id,
        sourceSessionId: sourceNode.sessionId,
        sourceNodeId,
        quoteText,
        originSummary: "Summarizing origin context...",
        createdAt: Date.now(),
      },
      colorKey: 0,
    });
    const paletteLength = workspace.settings.uiTheme.palette.length;
    const branchColorKey = computeColorKey(branchSession.id, paletteLength);
    const seededBranchSession: Session = {
      ...branchSession,
      colorKey: branchColorKey,
    };

    updateWorkspace((current) => {
      const tree = current.trees[activeTree.id];
      if (!tree) {
        return current;
      }
      return {
        ...current,
        sessions: {
          ...current.sessions,
          [branchSession.id]: seededBranchSession,
        },
        trees: {
          ...current.trees,
          [tree.id]: {
            ...tree,
            sessionIds: [...tree.sessionIds, branchSession.id],
            updatedAt: Date.now(),
          },
        },
        activeSessionId: branchSession.id,
      };
    });
    setSelectedNodeId(null);
    setScrollTargetId(null);

    let provider =
      workspace.settings.providerMode === "external"
        ? OpenAICompatibleProvider
        : DummyProvider;
    if (
      workspace.settings.providerMode === "external" &&
      !provider.isConfigured(workspace.settings.providerConfig)
    ) {
      provider = DummyProvider;
    }
    const sourceSession = workspace.sessions[sourceNode.sessionId];
    const sourceSessionNodes = sourceSession
      ? getSessionNodes(sourceSession, workspace.nodes)
      : [];
    const sourceIndex = sourceSessionNodes.findIndex((node) => node.id === sourceNodeId);
    const startIndex = Math.max(0, sourceIndex - BRANCH_SUMMARY_CONTEXT_NODES);
    const precedingNodes =
      sourceIndex >= 0 ? sourceSessionNodes.slice(startIndex, sourceIndex) : [];
    const summarizerContext = buildSummarizerContext({
      quoteText,
      sourceNode,
      precedingNodes,
    });

    const summarizerMessages = [{ role: "user", content: "Summarize origin context." }];

    provider
      .generate({
        systemPrompt: BRANCH_SUMMARIZER_PROMPT,
        contextBlock: summarizerContext,
        messages: summarizerMessages,
        options: workspace.settings.providerConfig,
      })
      .then((response) => {
        updateWorkspace((current) => {
          const session = current.sessions[branchSession.id];
          if (!session || !session.branchSeed) {
            return current;
          }
          return {
            ...current,
            sessions: {
              ...current.sessions,
              [session.id]: {
                ...session,
                branchSeed: {
                  ...session.branchSeed,
                  originSummary: response.text,
                },
              },
            },
          };
        });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        updateWorkspace((current) => {
          const session = current.sessions[branchSession.id];
          if (!session || !session.branchSeed) {
            return current;
          }
          return {
            ...current,
            sessions: {
              ...current.sessions,
              [session.id]: {
                ...session,
                branchSeed: {
                  ...session.branchSeed,
                  originSummary: `Summary unavailable: ${message}`,
                },
              },
            },
          };
        });
      });
  };

  const handleSend = async (text: string) => {
    if (!activeTree || !activeSession) {
      return;
    }
    const now = Date.now();
    const isFirstNode = !activeSession.headNodeId;
    const newNode = createNode({
      sessionId: activeSession.id,
      question: text,
      prevId: activeSession.tailNodeId,
    });

    setErrorMessage(undefined);
    setIsGenerating(true);
    setSelectedNodeId(newNode.id);
    setScrollTargetId(newNode.id);

    updateWorkspace((current) => {
      const session = current.sessions[activeSession.id];
      const tree = current.trees[activeTree.id];
      if (!session || !tree) {
        return current;
      }
      const updatedNodes = {
        ...current.nodes,
        [newNode.id]: newNode,
      };
      if (session.tailNodeId && current.nodes[session.tailNodeId]) {
        const tail = current.nodes[session.tailNodeId];
        updatedNodes[tail.id] = {
          ...tail,
          nextId: newNode.id,
          updatedAt: now,
        };
      }
      const updatedSession: Session = {
        ...session,
        headNodeId: session.headNodeId ?? newNode.id,
        tailNodeId: newNode.id,
        updatedAt: now,
      };
      const updatedTree: Tree =
        session.kind === "trunk" && !session.headNodeId
          ? {
              ...tree,
              title: truncateText(text),
              updatedAt: now,
            }
          : {
              ...tree,
              updatedAt: now,
            };
      return {
        ...current,
        nodes: updatedNodes,
        sessions: {
          ...current.sessions,
          [session.id]: updatedSession,
        },
        trees: {
          ...current.trees,
          [tree.id]: updatedTree,
        },
      };
    });

    const provider =
      workspace.settings.providerMode === "external"
        ? OpenAICompatibleProvider
        : DummyProvider;

    if (
      workspace.settings.providerMode === "external" &&
      !provider.isConfigured(workspace.settings.providerConfig)
    ) {
      const message = "External provider is not configured.";
      updateWorkspace((current) => {
        const node = current.nodes[newNode.id];
        if (!node) {
          return current;
        }
        return {
          ...current,
          nodes: {
            ...current.nodes,
            [node.id]: {
              ...node,
              answer: message,
              updatedAt: Date.now(),
            },
          },
        };
      });
      setErrorMessage(message);
      setIsGenerating(false);
      return;
    }

    const promptMessages = buildHistoryMessages(activeSessionNodes, MAX_HISTORY_NODES);
    promptMessages.push({ role: "user", content: text });

    let systemPrompt = workspace.settings.rootSeed;
    let contextBlock = buildTrunkContext(
      activeTree,
      Object.values(workspace.nodes).filter((node) => node.sessionId === activeSession.id).length +
        1
    );

    if (activeSession.kind === "branch" && activeSession.branchSeed) {
      const originSummary = activeSession.branchSeed.originSummary;
      contextBlock = buildBranchContext({
        quoteText: activeSession.branchSeed.quoteText,
        originSummary,
      });
      systemPrompt = `${systemPrompt}\n\n${BRANCH_INSTRUCTION}`;
      if (isFirstNode && originSummary.trim().length === 0) {
        contextBlock = buildBranchContext({
          quoteText: activeSession.branchSeed.quoteText,
          originSummary: "Origin summary pending.",
        });
      }
    }

    try {
      const response = await provider.generate({
        systemPrompt,
        contextBlock,
        messages: promptMessages,
        options: workspace.settings.providerConfig,
        onToken: (chunk) => {
          updateWorkspace((current) => {
            const node = current.nodes[newNode.id];
            if (!node) {
              return current;
            }
            return {
              ...current,
              nodes: {
                ...current.nodes,
                [node.id]: {
                  ...node,
                  answer: (node.answer || "") + chunk,
                  updatedAt: Date.now(),
                },
              },
            };
          });
        },
      });
      updateWorkspace((current) => {
        const node = current.nodes[newNode.id];
        if (!node) {
          return current;
        }
        return {
          ...current,
          nodes: {
            ...current.nodes,
            [node.id]: {
              ...node,
              answer: node.answer && node.answer.length > 0 ? node.answer : response.text,
              updatedAt: Date.now(),
            },
          },
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateWorkspace((current) => {
        const node = current.nodes[newNode.id];
        if (!node) {
          return current;
        }
        return {
          ...current,
          nodes: {
            ...current.nodes,
            [node.id]: {
              ...node,
              answer: `Error: ${message}`,
              updatedAt: Date.now(),
            },
          },
        };
      });
      setErrorMessage(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClearAll = () => {
    const confirmed = window.confirm(
      "Clear all trees and reset workspace? This cannot be undone."
    );
    if (!confirmed) {
      return;
    }
    resetUI();
    const nextWorkspace = createWorkspace();
    setWorkspace(persistWorkspace(nextWorkspace));
  };

  const handleTestConnection = async (draftSettings: Workspace["settings"]) => {
    const providerConfig = draftSettings.providerConfig;
    if (!OpenAICompatibleProvider.isConfigured(providerConfig)) {
      return "Add a base URL and API key first.";
    }

    try {
      const response = await OpenAICompatibleProvider.generate({
        systemPrompt: draftSettings.rootSeed,
        contextBlock: "Test connection.",
        messages: [{ role: "user", content: "ping" }],
        options: {
          ...providerConfig,
          maxTokens: Math.min(providerConfig.maxTokens || 32, 32),
        },
      });
      const preview = response.text.slice(0, 80).replace(/\s+/g, " ");
      return `Success: ${preview}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/cors|failed to fetch/i.test(message)) {
        return "Request failed. This may be a browser CORS issue.";
      }
      return `Error: ${message}`;
    }
  };

  const handleExport = () => {
    const safeWorkspace: Workspace = {
      ...workspace,
      settings: {
        ...workspace.settings,
        providerConfig: {
          ...workspace.settings.providerConfig,
          apiKey: "",
        },
      },
    };
    return JSON.stringify(
      {
        version: EXPORT_VERSION,
        exportedAt: Date.now(),
        workspace: safeWorkspace,
      },
      null,
      2
    );
  };

  const handleImport = (raw: string) => {
    try {
      const parsed = JSON.parse(raw) as { workspace?: Workspace };
      if (!parsed.workspace) {
        return { ok: false, error: "Missing workspace in import." };
      }

      const normalizedWorkspace = normalizeWorkspace(parsed.workspace);
      if (!normalizedWorkspace) {
        return { ok: false, error: "Invalid workspace data." };
      }

      const nextWorkspace: Workspace = {
        ...normalizedWorkspace,
        settings: {
          ...normalizedWorkspace.settings,
          providerConfig: {
            ...normalizedWorkspace.settings.providerConfig,
            apiKey: "",
          },
        },
      };

      setWorkspace(persistWorkspace(nextWorkspace));
      setSelectedNodeId(null);
      setScrollTargetId(null);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  };

  const handleSaveSettings = (settings: Workspace["settings"]) => {
    updateWorkspace((current) => ({
      ...current,
      settings: {
        ...settings,
        providerConfig: { ...settings.providerConfig },
        uiTheme: {
          baseFontSize: settings.uiTheme.baseFontSize,
          palette: [...settings.uiTheme.palette],
        },
      },
    }));
  };

  const sessionLabel =
    activeSession?.kind === "branch" && activeSession.origin
      ? `Branch from: ${truncateText(
          workspace.nodes[activeSession.origin.sourceNodeId]?.question || "Source"
        )}`
      : "Trunk session";
  const branchQuote =
    activeSession?.kind === "branch" && activeSession.branchSeed
      ? activeSession.branchSeed.quoteText
      : "";

  return (
    <div className="app" style={{ fontSize: `${workspace.settings.uiTheme.baseFontSize}px` }}>
      <aside className="sidebar">
        <h1>GPTree</h1>
        <button
          className="button-secondary"
          type="button"
          onClick={() => setIsSettingsOpen(true)}
        >
          Settings
        </button>
        <TreeView
          trees={workspace.trees}
          sessions={workspace.sessions}
          nodes={workspace.nodes}
          activeTreeId={workspace.activeTreeId}
          activeSessionId={workspace.activeSessionId}
          selectedNodeId={selectedNodeId}
          palette={workspace.settings.uiTheme.palette}
          onSelectTree={handleSelectTree}
          onToggleTree={handleToggleTree}
          onSelectSession={handleSelectSession}
          onSelectNode={handleSelectNode}
        />
      </aside>

      <main className="main">
        {activeTree && activeSession ? (
          <ChatPane
            nodes={activeSessionNodes}
            treeTitle={activeTree.title}
            sessionLabel={sessionLabel}
            sessionKind={activeSession.kind}
            branchQuote={branchQuote}
            selectedNodeId={selectedNodeId}
            scrollToNodeId={scrollTargetId}
            errorMessage={errorMessage}
            isGenerating={isGenerating}
            onNewQuestion={handleNewQuestion}
            onCreateBranch={handleCreateBranch}
            onClearAll={handleClearAll}
            onSend={handleSend}
            onScrollComplete={() => setScrollTargetId(null)}
          />
        ) : (
          <div className="empty-pane">
            <h2>No active tree</h2>
            <p>Start with a new top-level question.</p>
            <button className="button-primary" type="button" onClick={handleNewQuestion}>
              New Question
            </button>
          </div>
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={workspace.settings}
        branchSeeds={Object.values(workspace.sessions)
          .filter((session) => session.branchSeed)
          .map((session) => ({
            sessionId: session.id,
            seed: session.branchSeed!,
          }))}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
        onTest={handleTestConnection}
        onExport={handleExport}
        onImport={handleImport}
      />
    </div>
  );
}
