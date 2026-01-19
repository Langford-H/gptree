import React, { useMemo, useState } from "react";
import ChatPane from "./components/ChatPane";
import SettingsModal from "./components/SettingsModal";
import TreeView from "./components/TreeView";
import { Message, Node, Workspace } from "./models/types";
import { DummyProvider } from "./providers/DummyProvider";
import { OpenAICompatibleProvider } from "./providers/OpenAICompatibleProvider";
import {
  createNode,
  loadWorkspace,
  normalizeWorkspace,
  saveWorkspace,
} from "./store/workspaceStore";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  sanitizeSettings,
  saveSettings,
} from "./store/settingsStore";
import { PromptMessage } from "./providers/AIProvider";
import { createId } from "./utils/id";

const EXPORT_VERSION = "0.2.0";

function buildBreadcrumb(node: Node, workspace: Workspace) {
  const path: string[] = [];
  let current: Node | undefined = node;
  while (current) {
    path.unshift(current.title);
    if (!current.parentId) {
      break;
    }
    current = workspace.nodes[current.parentId];
  }
  return path;
}

function buildPromptMessages(
  node: Node,
  workspace: Workspace,
  userMessage?: Message
): PromptMessage[] {
  const sourceTitle = node.anchor
    ? workspace.nodes[node.anchor.sourceNodeId]?.title ?? "Source"
    : "";
  const baseMessages = userMessage ? [...node.messages, userMessage] : node.messages;
  const recent = baseMessages.slice(-10).map((message) => ({
    role: message.role,
    content: message.text,
  }));

  if (node.anchor) {
    return [
      {
        role: "system",
        content: `Anchor quote from ${sourceTitle}:\n"${node.anchor.quoteText}"`,
      },
      ...recent,
    ];
  }

  return recent;
}

function ensureExpanded(workspace: Workspace, nodeId: string) {
  const expanded = new Set(workspace.ui.expandedNodeIds);
  let current: Node | undefined = workspace.nodes[nodeId];
  while (current) {
    expanded.add(current.id);
    if (!current.parentId) {
      break;
    }
    current = workspace.nodes[current.parentId];
  }
  return Array.from(expanded);
}

export default function App() {
  const [workspace, setWorkspace] = useState<Workspace>(() => loadWorkspace());
  const [settings, setSettings] = useState(() => loadSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const activeNode =
    workspace.nodes[workspace.ui.activeNodeId] ??
    workspace.nodes[workspace.rootNodeId];

  const breadcrumb = useMemo(
    () => buildBreadcrumb(activeNode, workspace),
    [activeNode, workspace]
  );

  const quoteSourceTitle = activeNode.anchor
    ? workspace.nodes[activeNode.anchor.sourceNodeId]?.title ?? "Source"
    : undefined;

  const persistWorkspace = (next: Workspace) => {
    saveWorkspace(next);
    return next;
  };

  const persistSettings = (nextSettings: typeof settings) => {
    saveSettings(nextSettings);
    return nextSettings;
  };

  const updateWorkspace = (updater: (current: Workspace) => Workspace) => {
    setWorkspace((current) => persistWorkspace(updater(current)));
  };

  const updateSettings = (nextSettings: typeof settings) => {
    setSettings(persistSettings(nextSettings));
  };

  const selectNode = (nodeId: string) => {
    updateWorkspace((current) => {
      if (!current.nodes[nodeId]) {
        return current;
      }
      return {
        ...current,
        ui: {
          ...current.ui,
          activeNodeId: nodeId,
          expandedNodeIds: ensureExpanded(current, nodeId),
        },
      };
    });
  };

  const toggleExpand = (nodeId: string) => {
    updateWorkspace((current) => {
      const expanded = new Set(current.ui.expandedNodeIds);
      if (expanded.has(nodeId)) {
        expanded.delete(nodeId);
      } else {
        expanded.add(nodeId);
      }
      return {
        ...current,
        ui: {
          ...current.ui,
          expandedNodeIds: Array.from(expanded),
        },
      };
    });
  };

  const appendMessages = (nodeId: string, newMessages: Message[]) => {
    updateWorkspace((current) => {
      const node = current.nodes[nodeId];
      if (!node) {
        return current;
      }
      const now = Date.now();
      const status = node.status === "draft" ? "open" : node.status;
      const updatedNode = {
        ...node,
        status,
        messages: [...node.messages, ...newMessages],
        updatedAt: now,
      };
      return {
        ...current,
        nodes: {
          ...current.nodes,
          [nodeId]: updatedNode,
        },
        updatedAt: now,
      };
    });
  };

  const updateMessageText = (nodeId: string, messageId: string, text: string) => {
    updateWorkspace((current) => {
      const node = current.nodes[nodeId];
      if (!node) {
        return current;
      }
      const now = Date.now();
      const messages = node.messages.map((message) =>
        message.id === messageId ? { ...message, text } : message
      );
      return {
        ...current,
        nodes: {
          ...current.nodes,
          [nodeId]: {
            ...node,
            messages,
            updatedAt: now,
          },
        },
        updatedAt: now,
      };
    });
  };

  const handleSend = async (text: string) => {
    const nodeId = activeNode.id;
    const now = Date.now();
    const userMessage: Message = {
      id: createId("msg"),
      role: "user",
      text,
      ts: now,
    };

    const provider =
      settings.providerMode === "external"
        ? OpenAICompatibleProvider
        : DummyProvider;

    if (!provider.isConfigured(settings)) {
      appendMessages(nodeId, [
        userMessage,
        {
          id: createId("msg"),
          role: "system",
          text: "External provider is not configured. Open Settings to add an API key.",
          ts: now,
        },
      ]);
      return;
    }

    const assistantMessage: Message = {
      id: createId("msg"),
      role: "assistant",
      text: "",
      ts: now,
    };

    appendMessages(nodeId, [userMessage, assistantMessage]);
    setIsGenerating(true);

    let streamedText = "";
    try {
      const promptMessages = buildPromptMessages(activeNode, workspace, userMessage);
      const response = await provider.generate({
        messages: promptMessages,
        settings,
        onToken: (chunk) => {
          streamedText += chunk;
          updateMessageText(nodeId, assistantMessage.id, streamedText);
        },
      });

      const finalText = streamedText || response.text;
      updateMessageText(nodeId, assistantMessage.id, finalText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateMessageText(nodeId, assistantMessage.id, `Error: ${message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreateBranch = (quoteText: string) => {
    updateWorkspace((current) => {
      const parent = current.nodes[current.ui.activeNodeId];
      if (!parent) {
        return current;
      }

      const childTitle = `Branch ${parent.childrenIds.length + 1}`;
      const childNode = createNode({
        parentId: parent.id,
        title: childTitle,
        anchor: {
          sourceNodeId: parent.id,
          quoteText,
        },
      });

      const now = Date.now();
      const updatedParent = {
        ...parent,
        childrenIds: [...parent.childrenIds, childNode.id],
        updatedAt: now,
      };

      const expandedNodeIds = Array.from(
        new Set([...current.ui.expandedNodeIds, parent.id, childNode.id])
      );

      return {
        ...current,
        nodes: {
          ...current.nodes,
          [parent.id]: updatedParent,
          [childNode.id]: childNode,
        },
        ui: {
          ...current.ui,
          activeNodeId: childNode.id,
          expandedNodeIds,
        },
        updatedAt: now,
      };
    });
  };

  const handleMerge = (mode: "inline" | "link") => {
    updateWorkspace((current) => {
      const node = current.nodes[current.ui.activeNodeId];
      if (!node || !node.parentId) {
        return current;
      }

      const parent = current.nodes[node.parentId];
      if (!parent) {
        return current;
      }

      const now = Date.now();
      const nextStatus: Node["status"] = mode === "inline" ? "merged" : "linked";
      const note =
        mode === "inline"
          ? `Merged inline from ${node.title}.`
          : `Linked branch ${node.title}.`;

      const parentMessage: Message = {
        id: createId("msg"),
        role: "system",
        text: note,
        ts: now,
        meta: mode === "link" ? { linkNodeId: node.id } : undefined,
      };

      const updatedParent: Node = {
        ...parent,
        messages: [...parent.messages, parentMessage],
        updatedAt: now,
      };

      const updatedNode: Node = {
        ...node,
        status: nextStatus,
        merge: {
          mode,
          note,
          targetNodeId: parent.id,
        },
        updatedAt: now,
      };

      return {
        ...current,
        nodes: {
          ...current.nodes,
          [parent.id]: updatedParent,
          [node.id]: updatedNode,
        },
        updatedAt: now,
      };
    });
  };

  const handleTestConnection = async (draftSettings: typeof settings) => {
    if (!OpenAICompatibleProvider.isConfigured(draftSettings)) {
      return "Add a base URL and API key first.";
    }

    try {
      const response = await OpenAICompatibleProvider.generate({
        messages: [{ role: "user", content: "ping" }],
        settings: {
          ...draftSettings,
          maxTokens: Math.min(draftSettings.maxTokens || 32, 32),
        },
      });
      const preview = response.text.slice(0, 80).replace(/\s+/g, " ");
      return `Success: ${preview}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/cors|failed to fetch/i.test(message)) {
        return "Request failed. This may be a browser CORS issue. Try a proxy URL.";
      }
      return `Error: ${message}`;
    }
  };

  const handleExport = () => {
    const safeSettings = { ...settings, apiKey: "" };
    return JSON.stringify(
      {
        version: EXPORT_VERSION,
        exportedAt: Date.now(),
        workspace,
        settings: safeSettings,
      },
      null,
      2
    );
  };

  const handleImport = (raw: string) => {
    try {
      const parsed = JSON.parse(raw) as {
        workspace?: Workspace;
        settings?: typeof settings;
      };

      if (!parsed.workspace) {
        return { ok: false, error: "Missing workspace in import." };
      }

      const normalizedWorkspace = normalizeWorkspace(parsed.workspace);
      if (!normalizedWorkspace) {
        return { ok: false, error: "Invalid workspace data." };
      }

      const nextWorkspace = {
        ...normalizedWorkspace,
        updatedAt: Date.now(),
      };
      const nextSettings = sanitizeSettings({
        ...(parsed.settings ?? DEFAULT_SETTINGS),
        apiKey: "",
      });

      setWorkspace(persistWorkspace(nextWorkspace));
      setSettings(persistSettings(nextSettings));

      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  };

  return (
    <div className="app">
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
          workspace={workspace}
          activeNodeId={activeNode.id}
          expandedNodeIds={workspace.ui.expandedNodeIds}
          onSelectNode={selectNode}
          onToggleExpand={toggleExpand}
        />
      </aside>

      <main className="main">
        <ChatPane
          node={activeNode}
          breadcrumb={breadcrumb}
          isGenerating={isGenerating}
          quoteSourceTitle={quoteSourceTitle}
          onOpenSource={() =>
            activeNode.anchor ? selectNode(activeNode.anchor.sourceNodeId) : undefined
          }
          onSend={handleSend}
          onCreateBranch={handleCreateBranch}
          onMergeInline={() => handleMerge("inline")}
          onMergeLink={() => handleMerge("link")}
          onOpenNode={selectNode}
        />
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onClose={() => setIsSettingsOpen(false)}
        onSave={updateSettings}
        onTest={handleTestConnection}
        onExport={handleExport}
        onImport={handleImport}
      />
    </div>
  );
}
