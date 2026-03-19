import React, { useMemo, useState } from "react";
import ChatPane from "./components/ChatPane";
import SettingsModal from "./components/SettingsModal";
import TreeView from "./components/TreeView";
import { DummyProvider } from "./providers/DummyProvider";
import { OpenAICompatibleProvider } from "./providers/OpenAICompatibleProvider";
import { Node, Session, Tree, Workspace } from "./models/types";
import {
  DEFAULT_SETTINGS,
  createNode,
  createSession,
  createTree,
  createWorkspace,
  loadWorkspace,
  saveWorkspace,
} from "./store/workspaceStore";
import { BRANCH_SUMMARIZER_PROMPT } from "./constants/prompts";
import { buildPromptAssembly } from "./utils/promptAssembly";

const BRANCH_SUMMARY_CONTEXT_NODES = 4;

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

function computeSiblingBranchColorKey(options: {
  sessions: Record<string, Session>;
  sourceNodeId: string;
  paletteLength: number;
}) {
  const { sessions, sourceNodeId, paletteLength } = options;
  if (paletteLength <= 1) {
    return 0;
  }

  const siblingColorKeys = Object.values(sessions)
    .filter((session) => session.kind === "branch" && session.origin?.sourceNodeId === sourceNodeId)
    .map((session) => Math.abs(session.colorKey) % paletteLength);

  for (let colorKey = 1; colorKey < paletteLength; colorKey += 1) {
    if (!siblingColorKeys.includes(colorKey)) {
      return colorKey;
    }
  }

  return (siblingColorKeys.length % (paletteLength - 1)) + 1;
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [startStatus, setStartStatus] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const [startProviderMode, setStartProviderMode] = useState<"dummy" | "external">(
    workspace.settings.providerMode
  );
  const [startBaseUrl, setStartBaseUrl] = useState(
    workspace.settings.providerConfig.baseUrl ?? DEFAULT_SETTINGS.providerConfig.baseUrl ?? ""
  );
  const [startApiKey, setStartApiKey] = useState(workspace.settings.providerConfig.apiKey ?? "");

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

  const contextPreview = useMemo(() => {
    if (!activeTree || !activeSession || !workspace.settings.showContextPreview) {
      return null;
    }
    const prompt = buildPromptAssembly({
      tree: activeTree,
      session: activeSession,
      sessionNodes: activeSessionNodes,
      settings: workspace.settings,
    });
    return prompt;
  }, [activeSession, activeSessionNodes, activeTree, workspace.settings]);

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

  const handleRenameTree = (treeId: string, title: string) => {
    updateWorkspace((current) => {
      const tree = current.trees[treeId];
      if (!tree) {
        return current;
      }
      const nextTitle = title.trim() || "Untitled tree";
      if (nextTitle === tree.title) {
        return current;
      }
      return {
        ...current,
        trees: {
          ...current.trees,
          [treeId]: {
            ...tree,
            title: nextTitle,
            updatedAt: Date.now(),
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

  const handleRenameNode = (nodeId: string, title: string) => {
    updateWorkspace((current) => {
      const node = current.nodes[nodeId];
      if (!node) {
        return current;
      }
      const nextTitle = title.trim() || node.question;
      if (nextTitle === (node.title || node.question)) {
        return current;
      }
      return {
        ...current,
        nodes: {
          ...current.nodes,
          [node.id]: {
            ...node,
            title: nextTitle,
            updatedAt: Date.now(),
          },
        },
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
    const branchColorKey =
      paletteLength > 1
        ? computeSiblingBranchColorKey({
            sessions: workspace.sessions,
            sourceNodeId,
            paletteLength,
          })
        : computeColorKey(branchSession.id, paletteLength);
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

    const prompt = buildPromptAssembly({
      tree: activeTree,
      session: activeSession,
      sessionNodes: activeSessionNodes,
      settings: workspace.settings,
      pendingUserText: text,
    });

    try {
      const response = await provider.generate({
        systemPrompt: prompt.systemPrompt,
        contextBlock: prompt.contextBlock,
        messages: prompt.messages,
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
      "Clear all conversations? This cannot be undone."
    );
    if (!confirmed) {
      return;
    }
    resetUI();
    setWorkspace(
      persistWorkspace({
        ...workspace,
        trees: {},
        sessions: {},
        nodes: {},
        activeTreeId: null,
        activeSessionId: null,
      })
    );
  };

  const handleResetSettings = () => {
    updateWorkspace((current) => ({
      ...current,
      settings: {
        ...DEFAULT_SETTINGS,
        providerConfig: { ...DEFAULT_SETTINGS.providerConfig },
        uiTheme: {
          baseFontSize: DEFAULT_SETTINGS.uiTheme.baseFontSize,
          palette: [...DEFAULT_SETTINGS.uiTheme.palette],
        },
      },
    }));
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
    setStartProviderMode(settings.providerMode);
    setStartBaseUrl(settings.providerConfig.baseUrl ?? "");
    setStartApiKey(settings.providerConfig.apiKey ?? "");
  };

  const handleApplyStartSettings = (modeOverride?: "dummy" | "external") => {
    const providerMode = modeOverride ?? startProviderMode;
    const nextSettings: Workspace["settings"] = {
      ...workspace.settings,
      providerMode,
      providerConfig: {
        ...workspace.settings.providerConfig,
        baseUrl:
          providerMode === "external"
            ? startBaseUrl.trim() || DEFAULT_SETTINGS.providerConfig.baseUrl
            : workspace.settings.providerConfig.baseUrl,
        apiKey: providerMode === "external" ? startApiKey.trim() : "",
        maxTokens: 10000,
      },
    };

    updateWorkspace((current) => ({
      ...current,
      settings: {
        ...nextSettings,
        providerConfig: { ...nextSettings.providerConfig },
        uiTheme: {
          baseFontSize: nextSettings.uiTheme.baseFontSize,
          palette: [...nextSettings.uiTheme.palette],
        },
      },
    }));
    setStartProviderMode(providerMode);
  };

  const handleStart = async () => {
    setStartStatus(null);

    if (startProviderMode === "external") {
      if (!startBaseUrl.trim() || !startApiKey.trim()) {
        setStartStatus("Base URL and API Key are required for external mode.");
        return;
      }

      setIsStarting(true);
      const externalSettings: Workspace["settings"] = {
        ...workspace.settings,
        providerMode: "external",
        providerConfig: {
          ...workspace.settings.providerConfig,
          baseUrl: startBaseUrl.trim(),
          apiKey: startApiKey.trim(),
          maxTokens: 10000,
        },
      };

      try {
        const result = await handleTestConnection(externalSettings);
        if (!result.startsWith("Success:")) {
          throw new Error(result);
        }
        handleApplyStartSettings("external");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        handleApplyStartSettings("dummy");
        setAppNotice(
          `External connection failed. Falling back to Dummy mode. ${message.replace(/^Error:\s*/i, "")}`
        );
      } finally {
        setIsStarting(false);
      }
    } else {
      handleApplyStartSettings("dummy");
    }

    handleNewQuestion();
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
  const hasActiveWorkspace = Boolean(activeTree && activeSession);

  return (
    <div
      className={`app ${hasActiveWorkspace ? "with-sidebar" : "without-sidebar"}`}
      style={{ fontSize: `${workspace.settings.uiTheme.baseFontSize}px` }}
    >
      {hasActiveWorkspace ? (
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
            onRenameTree={handleRenameTree}
            onRenameNode={handleRenameNode}
            onSelectSession={handleSelectSession}
            onSelectNode={handleSelectNode}
          />
          <button className="sidebar-new-question" type="button" onClick={handleNewQuestion}>
            New Question
          </button>
        </aside>
      ) : null}

      <main className="main">
        {appNotice ? (
          <div className="app-notice">
            <span>{appNotice}</span>
            <button type="button" className="app-notice-close" onClick={() => setAppNotice(null)}>
              Dismiss
            </button>
          </div>
        ) : null}
        {activeTree && activeSession ? (
          <ChatPane
            nodes={activeSessionNodes}
            treeTitle={activeTree.title}
            sessionLabel={sessionLabel}
            sessionKind={activeSession.kind}
            branchQuote={branchQuote}
            contextPreview={contextPreview}
            selectedNodeId={selectedNodeId}
            scrollToNodeId={scrollTargetId}
            errorMessage={errorMessage}
            isGenerating={isGenerating}
            onCreateBranch={handleCreateBranch}
            onSend={handleSend}
            onScrollComplete={() => setScrollTargetId(null)}
          />
        ) : (
          <div className="start-page">
            <div className="start-hero">
              <div className="start-eyebrow">GPTree</div>
              <h2>Manage conversations in a git-like tree instead of one linear thread.</h2>
              <p>
                Start a top-level question, branch from any quote, and keep related lines of
                reasoning in one workspace.
              </p>
              <div className="start-actions">
                <button
                  className="button-primary"
                  type="button"
                  onClick={handleStart}
                  disabled={
                    isStarting ||
                    (startProviderMode === "external" &&
                      (!startBaseUrl.trim() || !startApiKey.trim()))
                  }
                >
                  {isStarting ? "Checking..." : "Start"}
                </button>
              </div>
            </div>

            <div className="start-setup">
              <div className="start-setup-title">Choose model source</div>
              <div className="start-mode-grid">
                <button
                  className={`start-mode-card ${
                    startProviderMode === "dummy" ? "selected" : ""
                  }`}
                  type="button"
                  onClick={() => setStartProviderMode("dummy")}
                >
                  <span className="start-mode-name">Dummy Test</span>
                  <span className="start-mode-copy">
                    Local demo mode for testing the tree workflow without external API setup.
                  </span>
                </button>
                <button
                  className={`start-mode-card ${
                    startProviderMode === "external" ? "selected" : ""
                  }`}
                  type="button"
                  onClick={() => setStartProviderMode("external")}
                >
                  <span className="start-mode-name">External API</span>
                  <span className="start-mode-copy">
                    Connect your own compatible endpoint and use a real model provider.
                  </span>
                </button>
              </div>

              {startProviderMode === "external" ? (
                <div className="start-form">
                  <label className="start-field">
                    <span>Base URL</span>
                    <input
                      value={startBaseUrl}
                      onChange={(event) => setStartBaseUrl(event.target.value)}
                      placeholder={DEFAULT_SETTINGS.providerConfig.baseUrl}
                    />
                  </label>
                  <label className="start-field">
                    <span>API Key</span>
                    <input
                      type="password"
                      value={startApiKey}
                      onChange={(event) => setStartApiKey(event.target.value)}
                      placeholder="sk-..."
                    />
                  </label>
                </div>
              ) : null}

              {startStatus ? <div className="start-status">{startStatus}</div> : null}
            </div>
          </div>
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={workspace.settings}
        onClose={() => setIsSettingsOpen(false)}
        onSave={handleSaveSettings}
        onReset={handleResetSettings}
        onClearAll={handleClearAll}
        onTest={handleTestConnection}
      />
    </div>
  );
}
