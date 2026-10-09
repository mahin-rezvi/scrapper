import "server-only";

import { getGeminiClient } from "@/lib/ai/geminiClient";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { logger } from "@/lib/utils/logger";
import { RoutineExtractionSchema, type RoutineExtraction } from "./schema";

const TIME_RANGE = /\b(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\b/g;
const WEEKDAYS = new Set(["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"]);

type PositionedText = { text: string; x: number; y: number; width: number };
type TextLine = { y: number; items: PositionedText[]; text: string };

function isTextItem(item: unknown): item is { str: string; transform: number[]; width: number } {
  return Boolean(item && typeof item === "object" && "str" in item && "transform" in item && "width" in item);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function toLines(items: PositionedText[]): TextLine[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextLine[] = [];
  for (const item of sorted) {
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 1.5);
    if (!line) {
      line = { y: item.y, items: [], text: "" };
      lines.push(line);
    }
    line.items.push(item);
    line.y = line.items.reduce((sum, entry) => sum + entry.y, 0) / line.items.length;
  }
  return lines.map((line) => {
    line.items.sort((a, b) => a.x - b.x);
    line.text = normalizeText(line.items.map((item) => item.text).join(" "));
    return line;
  }).sort((a, b) => b.y - a.y);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function groupWrappedLines(lines: TextLine[]): TextLine[] {
  if (lines.length < 2) return lines;
  const gaps = lines.slice(1).map((line, index) => Math.abs(lines[index].y - line.y)).filter((gap) => gap > 1);
  const threshold = Math.max(2.5, Math.min(8, median(gaps) * 0.58));
  const groups: TextLine[] = [];
  for (const line of lines) {
    const previous = groups.at(-1);
    if (previous && Math.abs(previous.y - line.y) <= threshold) {
      previous.items.push(...line.items);
      previous.items.sort((a, b) => a.x - b.x);
      previous.text = normalizeText(previous.items.map((item) => item.text).join(" "));
    } else {
      groups.push({ ...line, items: [...line.items] });
    }
  }
  return groups;
}

function findDayName(text: string): string | null {
  const match = text.match(/\b(Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)\b/i);
  if (!match || !WEEKDAYS.has(match[1].toLowerCase())) return null;
  return `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}`;
}

function findTimeColumns(line: TextLine): Array<{ label: string; center: number }> {
  return line.items.flatMap((item) =>
    [...item.text.matchAll(TIME_RANGE)].map((match) => ({
      label: `${match[1]}-${match[2]}`,
      center: item.x + item.width * ((match.index! + match[0].length / 2) / item.text.length),
    }))
  );
}

function clock(value: string): string | null {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return hour <= 23 && minute <= 59
    ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    : null;
}

function getColumnCenters(header: TextLine): number[] | null {
  const labels = header.items
    .map((item) => ({ label: item.text.toLowerCase().replace(/[^a-z]/g, ""), center: item.x + item.width / 2 }))
    .filter((item) => ["room", "course", "teacher"].includes(item.label));
  if (labels.length < 3 || labels.length % 3 !== 0) return null;
  const expected = labels.map((item) => item.label);
  if (expected.some((label, index) => label !== ["room", "course", "teacher"][index % 3])) return null;
  return labels.map((item) => item.center);
}

function getRoomColumnCenter(header: TextLine): number | null {
  const room = header.items.find((item) => item.text.trim().toLowerCase() === "room");
  return room ? room.x + room.width / 2 : null;
}

function getRoomScheduleColumnCenters(
  header: TextLine
): number[] | null {
  const labels = header.items
    .map((item) => ({
      label: item.text.toLowerCase().replace(/[^a-z]/g, ""),
      center: item.x + item.width / 2,
    }))
    .filter((item) => ["lts", "course", "ti"].includes(item.label));
  if (labels.length < 3 || labels.length % 3 !== 0) return null;
  if (labels.some((item, index) => item.label !== ["lts", "course", "ti"][index % 3])) {
    return null;
  }
  return labels.map((item) => item.center);
}

function alignSlotsToScheduleColumns(
  scheduleCenters: number[],
  timeCenters: number[],
  slots: RoutineExtraction["days"][number]["slots"]
): RoutineExtraction["days"][number]["slots"] | null {
  if (scheduleCenters.length % 3 !== 0 || timeCenters.length !== slots.length) return null;
  const matchedIndexes: number[] = [];
  for (let index = 0; index < scheduleCenters.length; index += 3) {
    const groupCenter = (scheduleCenters[index] + scheduleCenters[index + 1] + scheduleCenters[index + 2]) / 3;
    let closestIndex = 0;
    for (let candidate = 1; candidate < timeCenters.length; candidate += 1) {
      if (Math.abs(timeCenters[candidate] - groupCenter) < Math.abs(timeCenters[closestIndex] - groupCenter)) {
        closestIndex = candidate;
      }
    }
    const previousIndex = matchedIndexes.at(-1);
    if (previousIndex !== undefined && closestIndex <= previousIndex) return null;

    const neighboringGaps = [
      closestIndex > 0 ? timeCenters[closestIndex] - timeCenters[closestIndex - 1] : Infinity,
      closestIndex + 1 < timeCenters.length ? timeCenters[closestIndex + 1] - timeCenters[closestIndex] : Infinity,
    ];
    const maxDistance = Math.min(...neighboringGaps) / 2;
    if (Math.abs(timeCenters[closestIndex] - groupCenter) > maxDistance) return null;
    matchedIndexes.push(closestIndex);
  }
  return matchedIndexes.map((index) => slots[index]);
}

function getRowCells(line: TextLine, centers: number[]): string[] {
  const cellParts = centers.map(() => [] as string[]);
  const boundaries = centers.map((center, index) => index === 0
    ? Number.NEGATIVE_INFINITY
    : (centers[index - 1] + center) / 2);
  for (const item of line.items) {
    const itemCenter = item.x + item.width / 2;
    let index = boundaries.findLastIndex((boundary) => itemCenter >= boundary);
    if (index < 0) index = 0;
    if (index >= centers.length) index = centers.length - 1;
    cellParts[index].push(item.text);
  }
  return cellParts.map((parts) => normalizeText(parts.join(" ")));
}

function parseDate(value: string): string | null {
  const match = value.match(/\b(?:(\d{1,2})\s+([A-Za-z]+)|([A-Za-z]+)\s+(\d{1,2})),?\s+(\d{4})\b/);
  if (!match) return null;
  const month = new Map([
    ["jan", 1], ["january", 1], ["feb", 2], ["february", 2], ["mar", 3], ["march", 3],
    ["apr", 4], ["april", 4], ["may", 5], ["jun", 6], ["june", 6], ["jul", 7],
    ["july", 7], ["aug", 8], ["august", 8], ["sep", 9], ["september", 9],
    ["oct", 10], ["october", 10], ["nov", 11], ["november", 11], ["dec", 12], ["december", 12],
  ]).get((match[2] ?? match[3]).toLowerCase());
  const day = Number(match[1] ?? match[4]);
  const year = Number(match[5]);
  if (!month || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getMetadata(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const title = lines.find((line) => /class\s+routine/i.test(line)) ?? lines[0] ?? "Class Routine";
  const versionLabel = text.match(/\bVersion\s*[-:.]?\s*([^\r\n]+)/i)?.[1]
    ?.replace(/\s*(?:\|\s*)?Effective\s+from\b.*$/i, "")
    .trim() ?? null;
  const preparedBy = text.match(/\bPrepared\s+by\s*[:.]?\s*([^\r\n]+)/i)?.[1]?.trim() ?? null;
  const effectiveText = text.match(/\bEffective\s+From\s*[:.]?\s*([^\r\n]+)/i)?.[1]?.trim();
  return { title, versionLabel, preparedBy, effectiveFrom: effectiveText ? parseDate(effectiveText) : null };
}

const VISION_EXTRACTION_PROMPT = `Read every page of this official university class-routine PDF and transcribe the timetable into JSON. Preserve its table structure exactly, including blank cells and the printed order of days, times, rows, rooms, courses, and teachers. The timetable may have multiple time blocks, each split into Room, Course, and Teacher columns.

Return only JSON with this shape:
{
  "title": "string",
  "versionLabel": "string or null",
  "effectiveFrom": "YYYY-MM-DD or null",
  "preparedBy": "string or null",
  "days": [{
    "name": "day label",
    "slots": [{ "label": "printed time range", "startTime": "HH:mm or null", "endTime": "HH:mm or null" }],
    "rows": [{ "cells": [{ "room": "printed room text or empty string", "course": "printed course text or empty string", "teacher": "printed teacher text or empty string" }] }]
  }]
}

Rules:
- Inspect all pages. Do not summarize or omit timetable rows.
- Every row must contain exactly one cell for each time slot. Keep empty cells in place; never shift later values into them.
- Transcribe only what is visible. Do not infer missing labels, rooms, course codes, sections, or teachers. Use an empty string for an unreadable cell.
- Use null for missing metadata. Convert a readable effective date to YYYY-MM-DD.
- Do not include sectionCode or any other fields.`;

async function extractWithVision(pdf: Buffer): Promise<RoutineExtraction> {
  const response = await getGeminiClient().models.generateContent({
    model: process.env.GEMINI_ROUTINE_MODEL?.trim() || "gemini-3.8-flash",
    contents: [
      { text: VISION_EXTRACTION_PROMPT },
      { inlineData: { mimeType: "application/pdf", data: pdf.toString("base64") } },
    ],
    config: { responseMimeType: "application/json", temperature: 0 },
  });

  const responseText = response.text?.trim();
  if (!responseText) throw new Error("Gemini returned no routine data for the PDF.");

  let raw: unknown;
  try {
    raw = JSON.parse(responseText);
  } catch {
    throw new Error("Gemini returned invalid JSON for the routine PDF.");
  }
  const parsed = RoutineExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    logger.error(`[routine-pdf] Vision extraction failed validation: ${JSON.stringify(parsed.error.flatten())}`);
    throw new Error("Could not safely map the PDF into a complete routine table. No new routine was published.");
  }
  logger.info("[routine-pdf] Used Gemini vision fallback for routine extraction.");
  return parsed.data;
}

function extractDays(pageLines: TextLine[][]): RoutineExtraction["days"] {
  const daysByName = new Map<string, RoutineExtraction["days"][number]>();
  let activeDay: RoutineExtraction["days"][number] | undefined;
  let currentCenters: number[] | undefined;
  let roomColumnCenter: number | null = null;
  let currentTimeCenters: number[] = [];
  let roomScheduleLayout = false;
  let currentSlots: RoutineExtraction["days"][number]["slots"] = [];

  for (const rawLines of pageLines) {
    const lines = groupWrappedLines(rawLines);
    for (const line of lines) {
      const dayName = findDayName(line.text);
      if (dayName) {
        activeDay = daysByName.get(dayName);
        if (!activeDay) {
          activeDay = { name: dayName, slots: [], rows: [] };
          daysByName.set(dayName, activeDay);
        }
        continue;
      }

      const timeColumns = findTimeColumns(line);
      if (timeColumns.length) {
        currentSlots = timeColumns.map(({ label }) => {
          const [start, end] = label.split("-");
          return { label, startTime: clock(start), endTime: clock(end) };
        });
        currentTimeCenters = timeColumns.map((column) => column.center);
        roomColumnCenter = getRoomColumnCenter(line);
        currentCenters = undefined;
        roomScheduleLayout = false;
        if (activeDay) activeDay.slots = currentSlots;
        continue;
      }

      const detectedCenters = getColumnCenters(line);
      if (detectedCenters) {
        currentCenters = detectedCenters;
        roomScheduleLayout = false;
        if (currentSlots.length !== currentCenters.length / 3) {
          logger.warn(`[routine-pdf] Found ${currentSlots.length} time labels for ${currentCenters.length} timetable columns.`);
          continue;
        }
        continue;
      }

      const roomScheduleCenters = getRoomScheduleColumnCenters(line);
      const alignedSlots = roomScheduleCenters
        ? alignSlotsToScheduleColumns(roomScheduleCenters, currentTimeCenters, currentSlots)
        : null;
      const detectedRoomCenter = getRoomColumnCenter(line) ?? roomColumnCenter;
      if (roomScheduleCenters && alignedSlots && detectedRoomCenter !== null) {
        roomColumnCenter = detectedRoomCenter;
        currentCenters = [detectedRoomCenter, ...roomScheduleCenters];
        currentSlots = alignedSlots;
        if (activeDay) activeDay.slots = currentSlots;
        roomScheduleLayout = true;
        continue;
      }

      if (!activeDay || !currentCenters || !currentSlots.length) continue;
      const cells = getRowCells(line, currentCenters);
      if (roomScheduleLayout) {
        const room = cells[0] ?? "";
        const classCells = cells.slice(1);
        if (!room || classCells.filter(Boolean).length < 2 || /^room$/i.test(room)) continue;

        const rowCells = currentSlots.map((_, slot) => {
          const offset = slot * 3;
          const load = classCells[offset] ?? "";
          const course = classCells[offset + 1] ?? "";
          const teacher = classCells[offset + 2] ?? "";
          const hasClass = Boolean(course || teacher);
          return {
            room: hasClass ? room : "",
            course: course
              ? `${course}${load ? ` (L-T-S: ${load})` : ""}`
              : load,
            teacher,
          };
        });
        if (rowCells.some((cell) => cell.course || cell.teacher)) {
          activeDay.rows.push({ cells: rowCells });
        }
        continue;
      }

      const nonEmpty = cells.filter(Boolean);
      const roomValues = cells.filter((_, index) => index % 3 === 0 && cells[index]);
      const courseValues = cells.filter((_, index) => index % 3 === 1 && cells[index]);
      if (nonEmpty.length < 2 || (!roomValues.length && !courseValues.length)) continue;
      if (nonEmpty.every((cell) => /^(room|course|teacher)$/i.test(cell))) continue;

      const teacherValues = cells.filter((_, index) => index % 3 === 2 && cells[index]);
      const isWrappedRoomLabel = roomValues.length >= 2 && !courseValues.length && !teacherValues.length &&
        roomValues.every((value) => /^\(?COM(?:\s+LAB)?\)?$|^LAB\)?$/i.test(value));
      if (isWrappedRoomLabel) {
        const previous = activeDay.rows.at(-1);
        if (previous) {
          for (let slot = 0; slot < currentSlots.length; slot++) {
            const suffix = cells[slot * 3];
            if (suffix) previous.cells[slot].room = `${previous.cells[slot].room} ${suffix}`.trim();
          }
          continue;
        }
      }

      activeDay.rows.push({ cells: currentSlots.map((_, slot) => ({
        room: cells[slot * 3] ?? "",
        course: cells[slot * 3 + 1] ?? "",
        teacher: cells[slot * 3 + 2] ?? "",
      })) });
    }
  }
  return [...daysByName.values()];
}

export async function analyzeRoutinePdf(pdf: Buffer): Promise<RoutineExtraction> {
  if (!pdf.length) throw new Error("Routine PDF is empty.");
  const loadingTask = getDocument({ data: new Uint8Array(pdf) });
  try {
    const document = await loadingTask.promise;
    const pageLines: TextLine[][] = [];
    const allText: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: PositionedText[] = [];
      for (const item of content.items) {
        if (!isTextItem(item) || !item.str.trim()) continue;
        const [, , , , x, y] = item.transform;
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        items.push({ text: item.str, x, y, width: item.width });
      }
      const lines = toLines(items);
      pageLines.push(lines);
      allText.push(lines.map((line) => line.text).join("\n"));
      page.cleanup();
    }
    await loadingTask.destroy();

    const fullText = allText.join("\n");
    if (fullText.replace(/\s/g, "").length < 80) {
      return await extractWithVision(pdf);
    }
    const parsed = RoutineExtractionSchema.safeParse({
      ...getMetadata(fullText),
      days: extractDays(pageLines),
    });
    if (!parsed.success) {
      logger.error(`[routine-pdf] Local extraction failed validation: ${JSON.stringify(parsed.error.flatten())}`);
      return await extractWithVision(pdf);
    }
    return parsed.data;
  } catch (error) {
    await loadingTask.destroy().catch(() => undefined);
    throw error;
  }
}
