export type RoutineSearchType = "section" | "teacher" | "course" | "room";
const searchTypes = ["section", "teacher", "course", "room"] as const;

export type RoutineSearchEntry = {
  dayIndex: number;
  rowIndex: number;
  slotIndex: number;
  day: string;
  slot: string;
  room: string;
  course: string;
  teacher: string;
  sectionCode: string | null;
};

export function isExamRoutineTitle(title: string): boolean {
  return /\b(?:exam(?:ination)?s?|mid[\s-]?term|quiz(?:zes)?)\b/i.test(title);
}

export function isClassRoutineNoticeTitle(title: string): boolean {
  return /\b(?:routine|class\s+(?:time\s*table|schedule))\b/i.test(title) && !isExamRoutineTitle(title);
}

export function shouldProcessLatestRoutineNotice(
  title: string | null,
  noticeSyncSucceeded: boolean,
): boolean {
  return noticeSyncSucceeded && title !== null && isClassRoutineNoticeTitle(title);
}

export function parseRoutineSearchType(value: string | undefined): RoutineSearchType {
  return searchTypes.find((searchType) => searchType === value) ?? "section";
}

export function searchRoutineEntries(
  entries: RoutineSearchEntry[],
  query: string,
  searchType: RoutineSearchType,
): RoutineSearchEntry[] {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return [];

  const matches = searchType === "section"
    ? entries.filter((entry) => entry.sectionCode?.toUpperCase() === normalizedQuery.toUpperCase())
    : entries.filter((entry) => entry[searchType].toLowerCase().includes(normalizedQuery.toLowerCase()));

  return matches.sort((left, right) =>
    left.dayIndex - right.dayIndex ||
    left.slotIndex - right.slotIndex ||
    left.rowIndex - right.rowIndex
  );
}
