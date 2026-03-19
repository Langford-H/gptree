import { ProviderMessage } from "../providers/AIProvider";
import { Session, Tree, WorkspaceSettings, Node } from "../models/types";
import { BRANCH_INSTRUCTION } from "../constants/prompts";

export const MAX_HISTORY_NODES = 6;

export function buildHistoryMessages(nodes: Node[], limit: number): ProviderMessage[] {
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

export function buildTrunkContext(tree: Tree, nodeCount: number) {
  return [`Tree: ${tree.id}`, `Node count: ${nodeCount}`].join("\n");
}

export function buildBranchContext(origin: { quoteText: string; originSummary: string }) {
  const lines = ["Branch session: true", "Quoted span:", "<<<", origin.quoteText, ">>>"];
  lines.push("", "Origin summary:", "<<<", origin.originSummary, ">>>");
  return lines.join("\n");
}

export function buildPromptAssembly(options: {
  tree: Tree;
  session: Session;
  sessionNodes: Node[];
  settings: WorkspaceSettings;
  pendingUserText?: string;
}) {
  const messages = buildHistoryMessages(options.sessionNodes, MAX_HISTORY_NODES);
  if (options.pendingUserText) {
    messages.push({ role: "user", content: options.pendingUserText });
  }

  let systemPrompt = options.settings.rootSeed;
  let contextBlock = buildTrunkContext(
    options.tree,
    options.sessionNodes.length + (options.pendingUserText ? 1 : 0)
  );

  if (options.session.kind === "branch" && options.session.branchSeed) {
    contextBlock = buildBranchContext({
      quoteText: options.session.branchSeed.quoteText,
      originSummary: options.session.branchSeed.originSummary.trim() || "Origin summary pending.",
    });
    systemPrompt = `${systemPrompt}\n\n${BRANCH_INSTRUCTION}`;
  }

  return {
    systemPrompt,
    contextBlock,
    messages,
  };
}
