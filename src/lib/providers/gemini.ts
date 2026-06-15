import { GoogleGenAI } from "@google/genai";
import { ChatMessage, LlmProvider } from "./types";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not set. Add it to .env.local to use Gemini."
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export const geminiProvider: LlmProvider = {
  id: "gemini",
  hasKey: () => Boolean(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY),
  async chat(messages: ChatMessage[], system?: string): Promise<string> {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: messages.map((m) => ({
        // Gemini uses "model" for the assistant role.
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: system ? { systemInstruction: system } : undefined,
    });
    return response.text ?? "";
  },
};
