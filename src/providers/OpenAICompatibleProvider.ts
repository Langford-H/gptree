import { ProviderSettings } from "../models/types";
import { AIProvider, GenerateInput, PromptMessage } from "./AIProvider";

function getBaseUrl(settings: ProviderSettings) {
  const proxy = settings.proxyUrl.trim();
  const base = proxy.length > 0 ? proxy : settings.baseUrl.trim();
  return base.replace(/\/+$/, "");
}

function buildPayload(settings: ProviderSettings, messages: PromptMessage[]) {
  const payload: Record<string, unknown> = {
    model: settings.model,
    messages,
    stream: settings.stream,
  };

  if (settings.maxTokens > 0) {
    payload.max_tokens = settings.maxTokens;
  }

  if (typeof settings.temperature === "number") {
    payload.temperature = settings.temperature;
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
      const chunk = typeof deltaContent === "string"
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

async function requestCompletion(input: GenerateInput, allowFallback: boolean) {
  const { settings, messages, onToken, signal } = input;
  const baseUrl = getBaseUrl(settings);
  const apiKey = settings.apiKey.trim();
  if (!baseUrl) {
    throw new Error("Base URL is missing.");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildPayload(settings, messages)),
    signal,
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  if (settings.stream) {
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
      const fallbackSettings = { ...settings, stream: false };
      return requestCompletion(
        {
          ...input,
          settings: fallbackSettings,
          onToken: undefined,
        },
        false
      );
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
  name: "OpenAICompatible",
  isConfigured: (settings) => {
    const baseUrl = getBaseUrl(settings);
    return baseUrl.length > 0 && settings.apiKey.trim().length > 0;
  },
  generate: (input) => requestCompletion(input, true),
};
