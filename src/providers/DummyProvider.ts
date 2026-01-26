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
  generate: async ({ contextBlock, messages }) => {
    const quote = extractBetweenMarkers(contextBlock, "Quoted span");
    const excerpt = extractBetweenMarkers(contextBlock, "Origin context excerpt");
    const isBranch = /branch session:\s*true/i.test(contextBlock);
    const lastUser = findLatestUserMessage(messages);
    const prompt = lastUser ? lastUser.content : "";
    const quoteLine = quote
      ? `Quote noted: "${truncate(quote)}"`
      : "No quote was provided.";
    const excerptLine = excerpt
      ? `Origin context: "${truncate(excerpt)}"`
      : "No origin context provided.";
    const replyLine = prompt
      ? `Your latest message: "${truncate(prompt)}"`
      : "Ask a question to continue.";

    return {
      text: `DummyProvider response (${isBranch ? "branch" : "trunk"}).\n${quoteLine}\n${excerptLine}\n${replyLine}`,
    };
  },
};
