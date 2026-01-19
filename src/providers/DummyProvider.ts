import { AIProvider } from "./AIProvider";

const RESPONSES = [
  "This is a demo response from DummyProvider.",
  "DummyProvider is active. Open Settings to connect an external model.",
  "GPTree is running locally. Configure an external provider for real answers.",
];

export const DummyProvider: AIProvider = {
  name: "DummyProvider",
  isConfigured: () => true,
  generate: async ({ messages }) => {
    const lastUser = [...messages].reverse().find((msg) => msg.role === "user");
    const base = lastUser ? `You said: ${lastUser.content}` : "Ask me anything.";
    const extra = RESPONSES[Math.floor(Math.random() * RESPONSES.length)];
    return {
      text: `${extra}\n\n${base}`,
    };
  },
};
