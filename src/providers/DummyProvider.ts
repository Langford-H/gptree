import { AIProvider, ProviderMessage } from "./AIProvider";

function truncate(text: string, max = 120) {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 3)}...`;
}

function extractBetweenMarkers(source: string, label: string) {
  const pattern = new RegExp(`${label}:[\\s\\S]*?<<<([\\s\\S]*?)>>>`, "i");
  const match = source.match(pattern);
  if (!match) {
    return "";
  }
  return match[1].trim();
}

function findLatestUserMessage(messages: ProviderMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      return messages[i];
    }
  }
  return null;
}

export const DummyProvider: AIProvider = {
  name: "DummyProvider",
  isConfigured: () => true,
  generate: async ({ contextBlock, messages, systemPrompt }) => {
    const quote = extractBetweenMarkers(contextBlock, "Quoted span");
    const excerpt = extractBetweenMarkers(contextBlock, "Origin summary");
    const sourceAnswer = extractBetweenMarkers(contextBlock, "Source node answer");
    const isBranch = /branch session:\s*true/i.test(contextBlock);
    const lastUser = findLatestUserMessage(messages);
    const prompt = lastUser ? lastUser.content : "";
    const isSummarizer = /compact context summary/i.test(systemPrompt);
    if (isSummarizer) {
      const summaryQuote = quote ? truncate(quote, 80) : "No quote";
      const summaryAnswer = sourceAnswer ? truncate(sourceAnswer, 80) : "No answer context";
      return {
        text: `- Quote focus: ${summaryQuote}\n- Source context: ${summaryAnswer}\n- Prior messages: summarized for branch context\n- Constraints: do not answer branch question\n- Scope: branch-specific discussion only`,
      };
    }
    const quoteLine = quote
      ? `Quote noted: "${truncate(quote)}"`
      : "No quote was provided.";
    const excerptLine = excerpt
      ? `Origin summary: "${truncate(excerpt)}"`
      : "No origin summary provided.";
    const replyLine = prompt
      ? `Your latest message: "${truncate(prompt)}"`
      : "Ask a question to continue.";

    return {
      text: `DummyProvider response (${isBranch ? "branch" : "trunk"}).\n${quoteLine}\n${excerptLine}\n${replyLine}`,
    };
  },
};
