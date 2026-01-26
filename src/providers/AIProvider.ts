import { ProviderConfig } from "../models/types";

export interface ProviderMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ProviderRequest {
  systemPrompt: string;
  contextBlock: string;
  messages: ProviderMessage[];
  options: ProviderConfig;
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface AIProvider {
  name: string;
  isConfigured: (config: ProviderConfig) => boolean;
  generate: (request: ProviderRequest) => Promise<{ text: string }>;
}
