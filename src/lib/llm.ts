import { ChatMessage, LlmProvider } from "./providers/types";
import { claudeProvider } from "./providers/claude";
import { geminiProvider } from "./providers/gemini";

export type { ChatMessage } from "./providers/types";

const PROVIDERS: Record<string, LlmProvider> = {
  claude: claudeProvider,
  gemini: geminiProvider,
};

/** Resolve the active provider from LLM_PROVIDER (default: claude). */
export function getProvider(): LlmProvider {
  const id = (process.env.LLM_PROVIDER || "claude").toLowerCase();
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(
      `Unknown LLM_PROVIDER "${id}". Supported: ${Object.keys(PROVIDERS).join(", ")}`
    );
  }
  return provider;
}

/** Whether the active provider has its API key configured. */
export function hasLlmKey(): boolean {
  try {
    return getProvider().hasKey();
  } catch {
    return false;
  }
}

/**
 * Send a multi-turn conversation to the active provider and get the next
 * assistant message back. The caller owns the message history so multi-step
 * pipelines can share context, matching the "one chat, four prompts" design.
 */
export async function chatComplete(
  messages: ChatMessage[],
  system?: string
): Promise<string> {
  return getProvider().chat(messages, system);
}

/**
 * Single-shot completion that asks the model to return JSON only, and parses it.
 * Used for structured extraction tasks (resume parsing, fit scoring, etc).
 */
export async function completeJson<T>(
  prompt: string,
  system?: string
): Promise<T> {
  const text = await chatComplete([{ role: "user", content: prompt }], system);
  return parseJson<T>(text);
}

/** Parse a model text response that should contain a JSON object/array, stripping any markdown fences. */
export function parseJson<T>(text: string): T {
  return JSON.parse(extractJson(text)) as T;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf("{");
  const arrStart = text.indexOf("[");
  const firstStart =
    start === -1 ? arrStart : arrStart === -1 ? start : Math.min(start, arrStart);
  if (firstStart === -1) return text.trim();
  return text.slice(firstStart).trim();
}
