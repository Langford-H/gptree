import { ProviderSettings } from "../models/types";

const SETTINGS_STORAGE_KEY = "gptree_settings_v020";

export const DEFAULT_SETTINGS: ProviderSettings = {
  providerMode: "dummy",
  baseUrl: "https://api-inference.modelscope.cn/v1",
  apiKey: "",
  model: "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
  stream: true,
  maxTokens: 512,
  temperature: undefined,
  proxyUrl: "",
};

export function sanitizeSettings(data: unknown): ProviderSettings {
  if (!data || typeof data !== "object") {
    return { ...DEFAULT_SETTINGS };
  }

  const raw = data as Partial<ProviderSettings>;
  return {
    providerMode:
      raw.providerMode === "external" ? "external" : "dummy",
    baseUrl:
      typeof raw.baseUrl === "string" && raw.baseUrl.trim().length > 0
        ? raw.baseUrl
        : DEFAULT_SETTINGS.baseUrl,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    model:
      typeof raw.model === "string" && raw.model.trim().length > 0
        ? raw.model
        : DEFAULT_SETTINGS.model,
    stream: typeof raw.stream === "boolean" ? raw.stream : DEFAULT_SETTINGS.stream,
    maxTokens:
      typeof raw.maxTokens === "number" && !Number.isNaN(raw.maxTokens)
        ? raw.maxTokens
        : DEFAULT_SETTINGS.maxTokens,
    temperature:
      typeof raw.temperature === "number" && !Number.isNaN(raw.temperature)
        ? raw.temperature
        : undefined,
    proxyUrl: typeof raw.proxyUrl === "string" ? raw.proxyUrl : "",
  };
}

export function loadSettings(): ProviderSettings {
  const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    const parsed = JSON.parse(raw) as ProviderSettings;
    return sanitizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: ProviderSettings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}
