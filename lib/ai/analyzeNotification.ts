import { getGeminiClient, getGeminiModel } from "./geminiClient";
import { AnalysisSchema, type Analysis } from "./analysisSchema";
import { logger } from "../utils/logger";

export interface AnalysisResult {
  parsed: Analysis | null;
  rawResponse: unknown;
  model: string;
  success: boolean;
}

const PROMPT_TEMPLATE = `You are analyzing an official university notice. Read it and respond with ONLY valid JSON matching this schema — no markdown fences, no commentary:

{
  "summary": string,
  "category": "exam" | "tuition" | "event" | "admission" | "administrative" | "result" | "other",
  "priority": "high" | "medium" | "low",
  "deadline": string (YYYY-MM-DD) | null,
  "affectedGroups": string[],
  "actionItems": string[],
  "requiresPayment": boolean
}

Department: {{department}}
Title: {{title}}
Published: {{publishedAt}}
Body:
{{bodyText}}`;

let geminiUnavailableForProcess = false;

function isQuotaError(err: unknown): boolean {
  const text = String(err);
  return (
    text.includes("RESOURCE_EXHAUSTED") ||
    text.includes("quota") ||
    text.includes("429")
  );
}

/**
 * Calls Gemini to analyze a notice and returns a validated Analysis object.
 * Retries once on Zod validation failure.
 * On final failure, returns the raw response with success=false.
 */
export async function analyzeNotification(params: {
  department: string;
  title: string;
  publishedAt: string;
  bodyText: string;
}): Promise<AnalysisResult> {
  const model = getGeminiModel();

  if (geminiUnavailableForProcess) {
    return {
      parsed: null,
      rawResponse: { error: "Gemini analysis skipped for this run after quota failure." },
      model,
      success: false,
    };
  }

  const prompt = PROMPT_TEMPLATE
    .replace("{{department}}", params.department)
    .replace("{{title}}", params.title)
    .replace("{{publishedAt}}", params.publishedAt)
    .replace("{{bodyText}}", params.bodyText.slice(0, 8000)); // cap context

  async function attempt(): Promise<AnalysisResult> {
    const client = getGeminiClient();
    const response = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    // response.text is a getter in @google/genai v2 — access safely
    let text = "";
    try {
      text = response.text ?? "";
    } catch {
      text = "";
    }
    let rawResponse: unknown;
    try {
      rawResponse = JSON.parse(text);
    } catch {
      rawResponse = { raw: text };
    }

    const parsed = AnalysisSchema.safeParse(rawResponse);
    if (!parsed.success) {
      throw new Error(
        `Zod validation failed: ${JSON.stringify(parsed.error.flatten())}`
      );
    }

    return { parsed: parsed.data, rawResponse, model, success: true };
  }

  // First attempt
  try {
    return await attempt();
  } catch (firstErr) {
    logger.warn(`[analyzeNotification] First attempt failed: ${firstErr}`);
    if (isQuotaError(firstErr)) {
      geminiUnavailableForProcess = true;
      return {
        parsed: null,
        rawResponse: { error: String(firstErr) },
        model,
        success: false,
      };
    }

    // Retry once
    try {
      return await attempt();
    } catch (secondErr) {
      logger.error(`[analyzeNotification] Both attempts failed: ${secondErr}`);
      if (isQuotaError(secondErr)) {
        geminiUnavailableForProcess = true;
      }
      return {
        parsed: null,
        rawResponse: { error: String(secondErr) },
        model,
        success: false,
      };
    }
  }
}
