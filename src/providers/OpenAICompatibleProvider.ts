import { AIProvider, ProviderMessage } from "./AIProvider";
import { ProviderConfig } from "../models/types";

type PromptMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

const DEFAULT_BASE_URL = "https://api-inference.modelscope.cn/v1";
const DEFAULT_MODEL = "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B";

function getBaseUrl(config: ProviderConfig) {
  const base = (config.baseUrl || DEFAULT_BASE_URL).trim();
  return base.replace(/\/+$/, "");
}

function buildPromptMessages(
  systemPrompt: string,
  contextBlock: string,
  messages: ProviderMessage[]
): PromptMessage[] {
  const promptMessages: PromptMessage[] = [];
  if (systemPrompt.trim().length > 0) {
    promptMessages.push({ role: "system", content: systemPrompt });
  }
  if (contextBlock.trim().length > 0) {
    promptMessages.push({ role: "system", content: contextBlock });
  }
  for (const message of messages) {
    promptMessages.push({ role: message.role, content: message.content });
  }
  return promptMessages;
}

function buildPayload(
  config: ProviderConfig,
  promptMessages: PromptMessage[],
  stream: boolean
) {
  const payload: Record<string, unknown> = {
    model: config.model || DEFAULT_MODEL,
    messages: promptMessages,
    stream,
  };

  if (typeof config.maxTokens === "number" && config.maxTokens > 0) {
    payload.max_tokens = config.maxTokens;
  }

  if (typeof config.temperature === "number") {
    payload.temperature = config.temperature;
  }

  return payload;
}

async function readErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) {
    return `Request failed with status ${response.status}.`;
  }

  try {
    const data = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return data.error?.message || data.message || text;
  } catch {
    return text;
  }
}

async function readStream(response: Response, onToken?: (chunk: string) => void) {
  if (!response.body) {
    throw new Error("Streaming response body is not available.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) {
        continue;
      }

      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        return output;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(data);
      } catch {
        throw new Error("Failed to parse streaming response.");
      }

      const choice = (payload as any).choices?.[0];
      const deltaContent = choice?.delta?.content;
      const messageContent = choice?.message?.content;
      const chunk =
        typeof deltaContent === "string"
          ? deltaContent
          : output.length === 0 && typeof messageContent === "string"
            ? messageContent
            : "";

      if (chunk) {
        output += chunk;
        onToken?.(chunk);
      }
    }
  }

  return output;
}

async function requestCompletion(options: {
  config: ProviderConfig;
  promptMessages: PromptMessage[];
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
  allowFallback: boolean;
}) {
  const { config, promptMessages, onToken, signal, allowFallback } = options;
  const baseUrl = getBaseUrl(config);
  const apiKey = (config.apiKey || "").trim();
  const stream = config.stream === true;

  if (!baseUrl) {
    throw new Error("Base URL is missing.");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildPayload(config, promptMessages, stream)),
    signal,
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  if (stream) {
    try {
      const text = await readStream(response, onToken);
      if (text) {
        return { text };
      }
    } catch (error) {
      if (!allowFallback) {
        throw error;
      }
    }

    if (allowFallback) {
      const fallbackConfig = { ...config, stream: false };
      return requestCompletion({
        config: fallbackConfig,
        promptMessages,
        allowFallback: false,
      });
    }
  }

  const data = (await response.json()) as any;
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("No content returned from provider.");
  }

  return { text: content };
}

export const OpenAICompatibleProvider: AIProvider = {
  name: "ExternalProvider",
  isConfigured: (config) => {
    const baseUrl = getBaseUrl(config);
    return baseUrl.length > 0 && (config.apiKey || "").trim().length > 0;
  },
  generate: async ({ systemPrompt, contextBlock, messages, options, onToken, signal }) => {
    const promptMessages = buildPromptMessages(systemPrompt, contextBlock, messages);
    return requestCompletion({
      config: options,
      promptMessages,
      onToken,
      signal,
      allowFallback: true,
    });
  },
};
