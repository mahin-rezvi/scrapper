import { GoogleGenAI } from "@google/genai";

let _client: GoogleGenAI | null = null;

/**
 * Returns a lazily-initialized GoogleGenAI client.
 * Defers GEMINI_API_KEY access to runtime so build step doesn't fail.
 */
export function getGeminiClient(): GoogleGenAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    _client = new GoogleGenAI({ apiKey });
  }
  return _client;
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}
