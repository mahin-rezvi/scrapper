import { z } from "zod";
import { getGeminiClient, getGeminiModel } from "@/lib/ai/geminiClient";
import { logger } from "@/lib/utils/logger";
import { RoutineExtractionSchema, type RoutineExtraction } from "./schema";

const PROMPT = `Read every page of this official university class-routine PDF and transcribe its timetable into JSON. The PDF may contain a dense table with multiple time blocks, each split into Room, Course, and Teacher columns.

Return only JSON with this exact shape:
{
  "title": "string",
  "versionLabel": "string or null",
  "effectiveFrom": "YYYY-MM-DD or null",
  "preparedBy": "string or null",
  "days": [
    {
      "name": "day label",
      "slots": [{ "label": "printed time range", "startTime": "HH:mm or null", "endTime": "HH:mm or null" }],
      "rows": [
        { "cells": [{ "room": "printed room text or empty string", "course": "printed course text or empty string", "teacher": "printed teacher text or empty string" }] }
      ]
    }
  ]
}

Rules:
- Inspect the full PDF, including every page. Do not summarize the schedule.
- Preserve the printed day, time-slot, row, room, course, and teacher order.
- Each row must have exactly one cell for every time slot in that day. Keep blank cells as {"room":"","course":"","teacher":""}; never shift a later value into a blank cell.
- Transcribe labels as printed. Do not infer missing course codes, section codes, rooms, or teachers.
- Keep table rows aligned as the PDF shows them, including repeated room labels.
- Convert the effective date to YYYY-MM-DD. Use null when metadata is absent or unreadable.
- If any cell cannot be read confidently, leave that field empty rather than guessing.
- Output no Markdown, explanation, or extra keys.`;

const ResponseTextSchema = z.string().min(2);

export async function analyzeRoutinePdf(pdf: Buffer): Promise<RoutineExtraction> {
  const client = getGeminiClient();
  const model = process.env.GEMINI_ROUTINE_MODEL?.trim() || getGeminiModel();
  const response = await client.models.generateContent({
    model,
    contents: [
      { text: PROMPT },
      { inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } },
    ],
    config: {
      responseMimeType: "application/json",
      temperature: 0,
    },
  });

  const responseText = ResponseTextSchema.parse(response.text ?? "");
  let raw: unknown;
  try {
    raw = JSON.parse(responseText);
  } catch (error) {
    logger.error(`[routine-ai] Gemini returned invalid JSON: ${String(error)}`);
    throw new Error("Gemini returned invalid JSON for the routine PDF.");
  }
  const parsed = RoutineExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    logger.error(`[routine-ai] Routine extraction failed validation: ${JSON.stringify(parsed.error.flatten())}`);
    throw new Error("The routine PDF extraction did not match the required timetable structure.");
  }
  return parsed.data;
}
