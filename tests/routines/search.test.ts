import assert from "node:assert/strict";
import test from "node:test";
import {
  isClassRoutineNoticeTitle,
  isExamRoutineTitle,
  parseRoutineSearchType,
  searchRoutineEntries,
  shouldProcessLatestRoutineNotice,
  type RoutineSearchEntry,
} from "../../lib/routines/search";
import { encodeNoticeCursor, parseNoticeCursor } from "../../lib/notices/search";

const entries: RoutineSearchEntry[] = [
  {
    dayIndex: 1, rowIndex: 0, slotIndex: 2, day: "Sunday", slot: "10:00-11:00",
    room: "Room 203", course: "CSE 101", teacher: "A. Rahman", sectionCode: "64_I",
  },
  {
    dayIndex: 1, rowIndex: 1, slotIndex: 0, day: "Sunday", slot: "08:30-09:30",
    room: "Room 105", course: "CSE 202", teacher: "N. Islam", sectionCode: "64_I",
  },
  {
    dayIndex: 2, rowIndex: 0, slotIndex: 0, day: "Monday", slot: "08:30-09:30",
    room: "Room 203", course: "CSE 101", teacher: "A. Rahman", sectionCode: "65_A",
  },
];

test("routine searches match exact sections and return classes chronologically", () => {
  const matches = searchRoutineEntries(entries, " 64_i ", "section");
  assert.deepEqual(matches.map(({ day, slot }) => `${day} ${slot}`), [
    "Sunday 08:30-09:30",
    "Sunday 10:00-11:00",
  ]);
});

test("teacher, course, and room searches are case-insensitive substring matches", () => {
  assert.equal(searchRoutineEntries(entries, "rahman", "teacher").length, 2);
  assert.equal(searchRoutineEntries(entries, "cse 101", "course").length, 2);
  assert.equal(searchRoutineEntries(entries, "203", "room").length, 2);
  assert.deepEqual(searchRoutineEntries(entries, " ", "teacher"), []);
});

test("routine discovery excludes examination timetables", () => {
  assert.equal(isClassRoutineNoticeTitle("Class Routine for Spring 2026"), true);
  assert.equal(isClassRoutineNoticeTitle("Routine of Spring 2026"), true);
  assert.equal(isClassRoutineNoticeTitle("Final Examination Routine"), false);
  assert.equal(isClassRoutineNoticeTitle("Class Schedule for Mid-term Exam"), false);
  assert.equal(isClassRoutineNoticeTitle("Quiz Routine"), false);
  assert.equal(isExamRoutineTitle("Mid Term Examination Routine"), true);
});

test("routine ingestion only accepts a successfully synced latest class-routine notice", () => {
  assert.equal(shouldProcessLatestRoutineNotice("Class Routine for Spring 2026", true), true);
  assert.equal(shouldProcessLatestRoutineNotice("Exam timetable notice", true), false);
  assert.equal(shouldProcessLatestRoutineNotice("Class Routine for Spring 2026", false), false);
  assert.equal(shouldProcessLatestRoutineNotice(null, true), false);
});

test("invalid search modes safely fall back to section search", () => {
  assert.equal(parseRoutineSearchType("room"), "room");
  assert.equal(parseRoutineSearchType("other"), "section");
});

test("notice cursors round-trip and reject malformed or unbounded input", () => {
  const cursor = { id: "2048", publishedAt: "2026-10-09T00:03:00.000Z" };
  assert.deepEqual(parseNoticeCursor(encodeNoticeCursor(cursor)), cursor);
  assert.equal(parseNoticeCursor("not-a-cursor"), null);
  assert.equal(parseNoticeCursor("x".repeat(257)), null);
  assert.equal(
    parseNoticeCursor(encodeNoticeCursor({ id: "9223372036854775808", publishedAt: null })),
    null,
  );
});
