import React, { useEffect, useMemo, useRef, useState } from "react";
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
const DEFAULT_EXTERNAL_MODEL = DEFAULT_SETTINGS.providerConfig.model ?? "";
const MINIMAX_BASE_URL = "https://api.minimaxi.com/v1";
const MINIMAX_GLOBAL_BASE_URL = "https://api.minimax.io/v1";
const MODELSCOPE_BASE_URL = DEFAULT_SETTINGS.providerConfig.baseUrl ?? "";
const MINIMAX_DEFAULT_MODEL = "MiniMax-M2.7";
const START_BASE_URL_PRESETS = {
  minimax_cn: MINIMAX_BASE_URL,
  minimax_global: MINIMAX_GLOBAL_BASE_URL,
  modelscope: MODELSCOPE_BASE_URL,
} as const;
const START_BASE_URL_OPTIONS = [
  { id: "minimax_cn", label: "MiniMax CN", value: MINIMAX_BASE_URL },
  { id: "minimax_global", label: "MiniMax Global", value: MINIMAX_GLOBAL_BASE_URL },
  { id: "modelscope", label: "ModelScope", value: MODELSCOPE_BASE_URL },
] as const;

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

function getDescendantBranchSessionIds(options: {
  rootSessionId: string;
  sessions: Record<string, Session>;
  nodes: Record<string, Node>;
}) {
  const { rootSessionId, sessions, nodes } = options;
  const collected = new Set<string>();
  const queue = [rootSessionId];

  while (queue.length > 0) {
    const sessionId = queue.shift();
    if (!sessionId || collected.has(sessionId)) {
      continue;
    }
    collected.add(sessionId);
    const session = sessions[sessionId];
    if (!session) {
      continue;
    }
    const sessionNodeIds = new Set(getSessionNodes(session, nodes).map((node) => node.id));
    Object.values(sessions).forEach((candidate) => {
      if (
        candidate.kind === "branch" &&
        candidate.origin &&
        sessionNodeIds.has(candidate.origin.sourceNodeId) &&
        !collected.has(candidate.id)
      ) {
        queue.push(candidate.id);
      }
    });
  }

  return collected;
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

function inferExternalModel(baseUrl: string) {
  const normalizedBaseUrl = baseUrl.trim().toLowerCase();
  if (normalizedBaseUrl.includes("minimaxi.com")) {
    return MINIMAX_DEFAULT_MODEL;
  }
  return DEFAULT_EXTERNAL_MODEL;
}

function getExternalModel(baseUrl: string, model: string) {
  const trimmedModel = model.trim();
  const inferredModel = inferExternalModel(baseUrl);
  const shouldUseInferredModel =
    inferredModel !== DEFAULT_EXTERNAL_MODEL &&
    (trimmedModel.length === 0 || trimmedModel === DEFAULT_EXTERNAL_MODEL);

  if (shouldUseInferredModel) {
    return inferredModel;
  }

  if (trimmedModel.length > 0) {
    return trimmedModel;
  }
  return inferredModel;
}

function resolveStartBaseUrl(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return "";
  }
  const presetValue =
    START_BASE_URL_PRESETS[trimmedValue as keyof typeof START_BASE_URL_PRESETS];
  return presetValue ?? trimmedValue;
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
  const [isBaseUrlMenuOpen, setIsBaseUrlMenuOpen] = useState(false);
  const startBaseUrlFieldRef = useRef<HTMLLabelElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!startBaseUrlFieldRef.current?.contains(event.target as Node)) {
        setIsBaseUrlMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

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

  const handleDeleteBranch = (sessionId: string) => {
    const session = workspace.sessions[sessionId];
    if (!session || session.kind !== "branch") {
      return;
    }

    const confirmed = window.confirm(
      "Delete this branch and all of its nested child branches? This cannot be undone."
    );
    if (!confirmed) {
      return;
    }

    resetUI();
    updateWorkspace((current) => {
      const targetSession = current.sessions[sessionId];
      if (!targetSession || targetSession.kind !== "branch") {
        return current;
      }

      const sessionIdsToDelete = getDescendantBranchSessionIds({
        rootSessionId: sessionId,
        sessions: current.sessions,
        nodes: current.nodes,
      });

      const nextSessions = { ...current.sessions };
      const nextNodes = { ...current.nodes };

      sessionIdsToDelete.forEach((id) => {
        const deletingSession = current.sessions[id];
        if (!deletingSession) {
          return;
        }
        getSessionNodes(deletingSession, current.nodes).forEach((node) => {
          delete nextNodes[node.id];
        });
        delete nextSessions[id];
      });

      const tree = current.trees[targetSession.treeId];
      const nextTrees = tree
        ? {
            ...current.trees,
            [tree.id]: {
              ...tree,
              sessionIds: tree.sessionIds.filter((id) => !sessionIdsToDelete.has(id)),
              updatedAt: Date.now(),
            },
          }
        : current.trees;

      const nextActiveSessionId =
        current.activeSessionId && sessionIdsToDelete.has(current.activeSessionId)
          ? tree?.trunkSessionId ?? current.activeSessionId
          : current.activeSessionId;

      return {
        ...current,
        trees: nextTrees,
        sessions: nextSessions,
        nodes: nextNodes,
        activeSessionId: nextActiveSessionId,
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
    setIsSettingsOpen(false);
    setIsStarting(false);
    setStartStatus(null);
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

    const baseUrl = (providerConfig.baseUrl || "").trim();
    const model = getExternalModel(baseUrl, providerConfig.model ?? "");

    try {
      const response = await OpenAICompatibleProvider.generate({
        systemPrompt: "You are a helpful assistant.\nConfirm connectivity in one short sentence.",
        contextBlock: "",
        messages: [{ role: "user", content: "ping" }],
        options: {
          ...providerConfig,
          model,
          stream: false,
          maxTokens: 32,
        },
      });
      const preview = response.text.slice(0, 80).replace(/\s+/g, " ");
      return `Success: ${baseUrl}/chat/completions | model=${model} | ${preview}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/cors|failed to fetch/i.test(message)) {
        return `Error: ${baseUrl}/chat/completions | model=${model} | Request failed. This may be a browser CORS issue.`;
      }
      return `Error: ${baseUrl}/chat/completions | model=${model} | ${message}`;
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
    const externalBaseUrl =
      resolveStartBaseUrl(startBaseUrl) ||
      DEFAULT_SETTINGS.providerConfig.baseUrl;
    const externalModel = getExternalModel(
      externalBaseUrl,
      workspace.settings.providerConfig.model ?? DEFAULT_EXTERNAL_MODEL
    );
    const nextSettings: Workspace["settings"] = {
      ...workspace.settings,
      providerMode,
      providerConfig: {
        ...workspace.settings.providerConfig,
        baseUrl:
          providerMode === "external"
            ? externalBaseUrl
            : workspace.settings.providerConfig.baseUrl,
        apiKey: providerMode === "external" ? startApiKey.trim() : "",
        model:
          providerMode === "external"
            ? externalModel
            : workspace.settings.providerConfig.model,
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

  const handleStart = async (skipConnectionTest = false) => {
    setStartStatus(null);

    if (startProviderMode === "external") {
      if (!startBaseUrl.trim() || !startApiKey.trim()) {
        setStartStatus("Base URL and API Key are required for external mode.");
        return;
      }

      setIsStarting(true);
      const selectedBaseUrl = resolveStartBaseUrl(startBaseUrl) || startBaseUrl.trim();
      const externalSettings: Workspace["settings"] = {
        ...workspace.settings,
        providerMode: "external",
        providerConfig: {
          ...workspace.settings.providerConfig,
          baseUrl: selectedBaseUrl,
          apiKey: startApiKey.trim(),
          model: getExternalModel(
            selectedBaseUrl,
            workspace.settings.providerConfig.model ?? DEFAULT_EXTERNAL_MODEL
          ),
          maxTokens: 10000,
        },
      };

      if (skipConnectionTest) {
        handleApplyStartSettings("external");
        setIsStarting(false);
        handleNewQuestion();
        return;
      }

      try {
        const result = await handleTestConnection(externalSettings);
        if (!result.startsWith("Success:")) {
          throw new Error(result);
        }
        handleApplyStartSettings("external");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        handleApplyStartSettings("external");
        setStartStatus(message.replace(/^Error:\s*/i, ""));
        setIsStarting(false);
        return;
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
  const canStartExternal = Boolean(resolveStartBaseUrl(startBaseUrl) && startApiKey.trim());
  const canStartAnyway = startProviderMode === "external" && Boolean(startStatus && canStartExternal);

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
            onDeleteBranch={handleDeleteBranch}
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
                  className={`button-primary start-primary-button ${
                    canStartAnyway ? "start-primary-button-anyway" : ""
                  }`}
                  type="button"
                  onClick={() => void handleStart(canStartAnyway)}
                  disabled={
                    isStarting ||
                    (startProviderMode === "external" && !canStartExternal)
                  }
                >
                  {isStarting ? "Checking..." : canStartAnyway ? "Start Anyway" : "Start"}
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
                  <label className="start-field start-field-combobox" ref={startBaseUrlFieldRef}>
                    <span>Base URL</span>
                    <div className="start-combobox-shell">
                      <input
                        value={startBaseUrl}
                        onChange={(event) => {
                          setStartBaseUrl(event.target.value);
                          setIsBaseUrlMenuOpen(true);
                        }}
                        onFocus={() => setIsBaseUrlMenuOpen(true)}
                        placeholder={DEFAULT_SETTINGS.providerConfig.baseUrl}
                      />
                      <button
                        className="start-combobox-toggle"
                        type="button"
                        onClick={() => setIsBaseUrlMenuOpen((current) => !current)}
                        aria-label="Toggle base URL options"
                      >
                        ▾
                      </button>
                    </div>
                    {isBaseUrlMenuOpen ? (
                      <div className="start-combobox-menu">
                        {START_BASE_URL_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            className="start-combobox-option"
                            type="button"
                            onClick={() => {
                              setStartBaseUrl(option.value);
                              setIsBaseUrlMenuOpen(false);
                            }}
                          >
                            <span>{option.label}</span>
                            <span>{option.value}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
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
