import { ProviderSettings } from "../models/types";

export type PromptMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export interface GenerateInput {
  messages: PromptMessage[];
  settings: ProviderSettings;
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface AIProvider {
  name: string;
  isConfigured: (settings: ProviderSettings) => boolean;
  generate: (input: GenerateInput) => Promise<{ text: string }>;
}
