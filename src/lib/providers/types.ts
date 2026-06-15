export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export interface LlmProvider {
  /** Provider id, e.g. "claude" | "gemini". */
  id: string;
  /** Whether the required API key is present in the environment. */
  hasKey(): boolean;
  /** Send a multi-turn conversation and return the next assistant message text. */
  chat(messages: ChatMessage[], system?: string): Promise<string>;
}
