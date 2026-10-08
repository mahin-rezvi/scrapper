import { z } from "zod";

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const RoutineCellSchema = z.object({
  room: z.string(),
  course: z.string(),
  teacher: z.string(),
});

export const RoutineDaySchema = z.object({
  name: z.string().min(1),
  slots: z.array(z.object({
    label: z.string().min(1),
    startTime: z.string().regex(timePattern).nullable(),
    endTime: z.string().regex(timePattern).nullable(),
  })).min(1),
  rows: z.array(z.object({
    cells: z.array(RoutineCellSchema).min(1),
  })).min(1),
}).superRefine((day, ctx) => {
  day.rows.forEach((row, rowIndex) => {
    if (row.cells.length !== day.slots.length) {
      ctx.addIssue({
        code: "custom",
        path: ["rows", rowIndex, "cells"],
        message: `Row has ${row.cells.length} cells but day has ${day.slots.length} time slots.`,
      });
    }
  });
});

export const RoutineExtractionSchema = z.object({
  title: z.string().min(1),
  versionLabel: z.string().nullable(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  preparedBy: z.string().nullable(),
  days: z.array(RoutineDaySchema).min(1),
});

export type RoutineExtraction = z.infer<typeof RoutineExtractionSchema>;

export function extractSectionCode(course: string): string | null {
  const matches = [...course.matchAll(/\(([^()]*)\)/g)];
  for (const match of matches.reverse()) {
    const candidate = match[1].trim().toUpperCase();
    if (/^[A-Z0-9]{1,8}(?:[_-][A-Z0-9]{1,8})+$/.test(candidate)) return candidate;
  }
  return null;
}
