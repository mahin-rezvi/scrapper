import { db } from "@/lib/db/postgres";
import { searchRoutineEntries, type RoutineSearchType } from "@/lib/routines/search";

export type RoutineListItem = {
  id: string;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  title: string;
  versionLabel: string | null;
  effectiveFrom: string | null;
  preparedBy: string | null;
  sourcePdfUrl: string;
  parsedAt: string;
  isCurrent: boolean;
};

export type RoutineDepartment = { id: number; code: string; name: string };

export type RoutineCell = { room: string; course: string; teacher: string };
export type RoutineSlot = {
  index: number;
  label: string;
  startTime: string | null;
  endTime: string | null;
};
export type RoutineDay = {
  index: number;
  name: string;
  slots: RoutineSlot[];
  rows: RoutineCell[][];
};

export type ClassroomSlotOption = { value: string; label: string };
export type ClassroomAvailability = {
  date: string;
  dayName: string;
  slots: ClassroomSlotOption[];
  selectedSlot: string;
  selectedSlotLabel: string | null;
  availableRooms: string[];
  occupiedRoomCount: number;
  searched: boolean;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dhakaToday() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isValidCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function routineSelectionCte() {
  return `
    WITH latest_routines AS (
      SELECT DISTINCT ON (r.department_id) r.id
      FROM public.routine_versions AS r
      JOIN public.departments AS d ON d.id = r.department_id
      WHERE d.is_active
        AND concat_ws(' ', r.title, r.parsed_data->>'title') ~* '\\m(routine|class[[:space:]]+(time[[:space:]]*table|schedule))\\M'
        AND concat_ws(' ', r.title, r.parsed_data->>'title') !~* '\\m(exam(ination)?s?|mid[[:space:]-]?term|quiz(zes)?)\\M'
      ORDER BY r.department_id, r.is_current DESC, r.parsed_at DESC, r.id DESC
    )`;
}

export async function classroomAvailabilityData(dateInput?: string, slotInput?: string): Promise<ClassroomAvailability> {
  const date = dateInput && isValidCalendarDate(dateInput) ? dateInput : dhakaToday();
  const dayName = WEEKDAYS[new Date(`${date}T12:00:00.000Z`).getUTCDay()];
  const slotResult = await db.query<{ start_time: string; end_time: string; label: string }>(`
    ${routineSelectionCte()}
    SELECT DISTINCT to_char(s.start_time, 'HH24:MI') AS start_time,
           to_char(s.end_time, 'HH24:MI') AS end_time,
           min(s.time_label) AS label
    FROM latest_routines AS lr
    JOIN public.routine_days AS d ON d.routine_id = lr.id AND lower(trim(d.day_name)) = lower($1)
    JOIN public.routine_time_slots AS s ON s.routine_id = d.routine_id AND s.day_index = d.day_index
    WHERE s.start_time IS NOT NULL AND s.end_time IS NOT NULL AND s.end_time > s.start_time
    GROUP BY s.start_time, s.end_time
    ORDER BY s.start_time, s.end_time
  `, [dayName]);

  const slots = slotResult.rows.map((slot) => ({
    value: `${slot.start_time}-${slot.end_time}`,
    label: slot.label || `${slot.start_time}–${slot.end_time}`,
  }));
  const selectedSlot = slotInput ?? "";
  const selected = slotResult.rows.find((slot) => `${slot.start_time}-${slot.end_time}` === selectedSlot);
  if (!selected) {
    return {
      date, dayName, slots, selectedSlot: "", selectedSlotLabel: null,
      availableRooms: [], occupiedRoomCount: 0, searched: false,
    };
  }

  const roomResult = await db.query<{ room: string; occupied: boolean }>(`
    ${routineSelectionCte()},
    room_inventory AS (
      SELECT DISTINCT upper(trim(e.room)) AS room
      FROM latest_routines AS lr
      JOIN public.routine_entries AS e ON e.routine_id = lr.id
      WHERE trim(e.room) <> ''
    ),
    occupied_rooms AS (
      SELECT DISTINCT upper(trim(e.room)) AS room
      FROM latest_routines AS lr
      JOIN public.routine_days AS d ON d.routine_id = lr.id AND lower(trim(d.day_name)) = lower($1)
      JOIN public.routine_entries AS e ON e.routine_id = d.routine_id AND e.day_index = d.day_index
      JOIN public.routine_time_slots AS s ON s.routine_id = e.routine_id
        AND s.day_index = e.day_index AND s.slot_index = e.slot_index
      WHERE trim(e.room) <> '' AND trim(e.course) <> ''
        AND s.start_time < $3::time AND s.end_time > $2::time
    )
    SELECT inventory.room, (occupied.room IS NOT NULL) AS occupied
    FROM room_inventory AS inventory
    LEFT JOIN occupied_rooms AS occupied USING (room)
    ORDER BY inventory.room
  `, [dayName, selected.start_time, selected.end_time]);
  const availableRooms = roomResult.rows.filter((room) => !room.occupied).map((room) => room.room);
  return {
    date, dayName, slots, selectedSlot,
    selectedSlotLabel: selected.label || `${selected.start_time}–${selected.end_time}`,
    availableRooms,
    occupiedRoomCount: roomResult.rows.length - availableRooms.length,
    searched: true,
  };
}

type RoutineQueryRow = {
  id: string;
  department_id: string;
  department_code: string;
  department_name: string;
  title: string;
  version_label: string | null;
  effective_from: string | null;
  prepared_by: string | null;
  source_pdf_url: string;
  parsed_at: string;
  is_current: boolean;
};

export async function listCurrentRoutines(): Promise<RoutineListItem[]> {
  const { rows } = await db.query<RoutineQueryRow>(`
    SELECT latest.id, latest.department_id, latest.department_code, latest.department_name,
           latest.title, latest.version_label, latest.effective_from::text AS effective_from, latest.prepared_by,
           latest.source_pdf_url, latest.parsed_at::text AS parsed_at, latest.is_current
    FROM (
      SELECT DISTINCT ON (r.department_id)
             r.id, r.department_id, d.code AS department_code, d.name AS department_name,
             r.title, r.version_label, r.effective_from, r.prepared_by,
             r.source_pdf_url, r.parsed_at, r.is_current
      FROM public.routine_versions AS r
      JOIN public.departments AS d ON d.id = r.department_id
      WHERE d.is_active
        AND concat_ws(' ', r.title, r.parsed_data->>'title') ~* '\\m(routine|class[[:space:]]+(time[[:space:]]*table|schedule))\\M'
        AND concat_ws(' ', r.title, r.parsed_data->>'title') !~* '\\m(exam(ination)?s?|mid[[:space:]-]?term|quiz(zes)?)\\M'
      ORDER BY r.department_id, r.is_current DESC, r.parsed_at DESC, r.id DESC
    ) AS latest
    ORDER BY latest.parsed_at DESC, latest.id DESC
  `);

  return rows.map((row) => ({
    id: String(row.id),
    departmentId: Number(row.department_id),
    departmentCode: row.department_code,
    departmentName: row.department_name,
    title: row.title,
    versionLabel: row.version_label,
    effectiveFrom: row.effective_from,
    preparedBy: row.prepared_by,
    sourcePdfUrl: row.source_pdf_url,
    parsedAt: row.parsed_at,
    isCurrent: row.is_current,
  }));
}

export async function routineManagementData() {
  const [routines, runResult] = await Promise.all([
    listCurrentRoutines(),
    db.query<{
      status: string;
      started_at: string;
      finished_at: string | null;
      routines_added: number;
      errors: number;
      message: string | null;
    }>(`
      SELECT status, started_at::text AS started_at, finished_at::text AS finished_at,
             routines_added, errors, message
      FROM public.sync_runs
      WHERE kind = 'routines'
      ORDER BY started_at DESC, id DESC
      LIMIT 1
    `),
  ]);
  const lastRun = runResult.rows[0];

  return {
    routines,
    lastRun: lastRun
      ? {
          status: lastRun.status,
          startedAt: lastRun.started_at,
          finishedAt: lastRun.finished_at,
          routinesAdded: Number(lastRun.routines_added),
          errors: Number(lastRun.errors),
          message: lastRun.message,
        }
      : null,
  };
}

export async function routineBoardData(
  departmentCode?: string,
  sectionQuery?: string,
  searchType: RoutineSearchType = "section",
): Promise<{
  routines: RoutineListItem[];
  departments: RoutineDepartment[];
  selectedRoutine: RoutineListItem | null;
  days: RoutineDay[];
  matches: Array<{ day: string; slot: string; room: string; course: string; teacher: string; sectionCode: string | null }>;
  section: string;
  searchType: RoutineSearchType;
}> {
  const [routines, departmentResult] = await Promise.all([
    listCurrentRoutines(),
    db.query<{ id: string; code: string; name: string }>(`
      SELECT id, code, name
      FROM public.departments
      WHERE is_active
      ORDER BY name
    `),
  ]);
  const departments = departmentResult.rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    name: row.name,
  }));
  const selectedRoutine = departmentCode
    ? routines.find((routine) => routine.departmentCode.toUpperCase() === departmentCode.trim().toUpperCase()) ?? null
    : routines[0] ?? null;

  if (!selectedRoutine) {
    return { routines, departments, selectedRoutine: null, days: [], matches: [], section: sectionQuery ?? "", searchType };
  }

  const section = (sectionQuery ?? "").trim();
  const [dayResult, slotResult, entryResult] = await Promise.all([
    db.query<{ day_index: number; day_name: string }>(`
      SELECT day_index, day_name
      FROM public.routine_days
      WHERE routine_id = $1
      ORDER BY day_index
    `, [selectedRoutine.id]),
    db.query<{
      day_index: number;
      slot_index: number;
      time_label: string;
      start_time: string | null;
      end_time: string | null;
    }>(`
      SELECT day_index, slot_index, time_label, start_time::text, end_time::text
      FROM public.routine_time_slots
      WHERE routine_id = $1
      ORDER BY day_index, slot_index
    `, [selectedRoutine.id]),
    db.query<{
      day_index: number;
      row_index: number;
      slot_index: number;
      room: string;
      course: string;
      teacher: string;
      section_code: string | null;
    }>(`
      SELECT day_index, row_index, slot_index, room, course, teacher, section_code
      FROM public.routine_entries
      WHERE routine_id = $1
      ORDER BY day_index, row_index, slot_index
    `, [selectedRoutine.id]),
  ]);

  const days = dayResult.rows.map((day) => {
    const daySlots = slotResult.rows.filter((slot) => slot.day_index === day.day_index);
    const dayEntries = entryResult.rows.filter((entry) => entry.day_index === day.day_index);
    const rowCount = dayEntries.reduce((max, entry) => Math.max(max, entry.row_index + 1), 0);
    const rows = Array.from({ length: rowCount }, () =>
      Array.from({ length: daySlots.length }, () => ({ room: "", course: "", teacher: "" }))
    );
    for (const entry of dayEntries) {
      if (rows[entry.row_index]?.[entry.slot_index]) {
        rows[entry.row_index][entry.slot_index] = {
          room: entry.room,
          course: entry.course,
          teacher: entry.teacher,
        };
      }
    }
    return {
      index: day.day_index,
      name: day.day_name,
      slots: daySlots.map((slot) => ({
        index: slot.slot_index,
        label: slot.time_label,
        startTime: slot.start_time,
        endTime: slot.end_time,
      })),
      rows,
    };
  });

  const matches = searchRoutineEntries(
    entryResult.rows.map((entry) => ({
      dayIndex: entry.day_index,
      rowIndex: entry.row_index,
      slotIndex: entry.slot_index,
      day: days.find((item) => item.index === entry.day_index)?.name ?? "",
      slot: days.find((item) => item.index === entry.day_index)?.slots[entry.slot_index]?.label ?? "",
      room: entry.room,
      course: entry.course,
      teacher: entry.teacher,
      sectionCode: entry.section_code,
    })),
    section,
    searchType,
  ).flatMap((entry) => {
    const day = days.find((item) => item.index === entry.dayIndex);
    const cell = day?.rows[entry.rowIndex]?.[entry.slotIndex];
    const slot = day?.slots[entry.slotIndex];
    if (!day || !cell || !slot) return [];
    return [{ day: day.name, slot: slot.label, ...cell, sectionCode: entry.sectionCode }];
  });

  return { routines, departments, selectedRoutine, days, matches, section, searchType };
}
