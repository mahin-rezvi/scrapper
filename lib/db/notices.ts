import { db } from "@/lib/db/postgres";
import { encodeNoticeCursor, parseNoticeCursor } from "@/lib/notices/search";

export type DepartmentSummary = {
  code: string;
  name: string;
  noticeCount: number;
};

export type NoticeSummary = {
  id: string;
  sourceId: string;
  title: string;
  category: string | null;
  bodyText: string;
  sourceUrl: string;
  publishedAt: string | null;
  attachments: string[];
  departmentCode: string;
  departmentName: string;
};

type DepartmentQueryRow = { code: string; name: string; notice_count: number };
type NoticeQueryRow = {
  id: string;
  source_id: string;
  title: string;
  category: string | null;
  body_text: string;
  source_url: string;
  published_at: string | null;
  attachments: unknown;
  department_code: string;
  department_name: string;
};

const NOTICE_PAGE_SIZE = 24;

function attachmentUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function dashboardData(options: {
  query?: string;
  department?: string;
  category?: string;
  cursor?: string;
} = {}) {
  const query = (options.query ?? "").trim().slice(0, 120);
  const department = (options.department ?? "").trim().slice(0, 64);
  const category = (options.category ?? "").trim().slice(0, 120);
  const cursor = parseNoticeCursor(options.cursor);
  const filters = ["d.is_active"];
  const values: unknown[] = [];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (query) {
    const queryParameter = parameter(query);
    filters.push(`to_tsvector('simple', coalesce(n.title, '') || ' ' || coalesce(n.body_text, '')) @@ plainto_tsquery('simple', ${queryParameter})`);
  }
  if (department) filters.push(`d.code = ${parameter(department)}`);
  if (category) filters.push(`n.category = ${parameter(category)}`);
  const where = filters.join(" AND ");
  const hasFilters = filters.length > 1;
  const filterValues = [...values];
  const pageValues = [...values];
  const pageFilters = [...filters];
  const pageParameter = (value: unknown) => {
    pageValues.push(value);
    return `$${pageValues.length}`;
  };
  if (cursor) {
    const cursorId = pageParameter(cursor.id);
    if (cursor.publishedAt === null) {
      pageFilters.push(`n.published_at IS NULL AND n.id < ${cursorId}`);
    } else {
      const cursorDate = pageParameter(cursor.publishedAt);
      pageFilters.push(`(n.published_at < ${cursorDate}::timestamptz OR (n.published_at = ${cursorDate}::timestamptz AND n.id < ${cursorId}) OR n.published_at IS NULL)`);
    }
  }
  const limitParameter = pageParameter(NOTICE_PAGE_SIZE + 1);
  const pageWhere = pageFilters.join(" AND ");

  const [departmentResult, noticeResult, countResult, categoryResult, runResult] = await Promise.all([
    db.query<DepartmentQueryRow>(`
      SELECT d.code, d.name, count(n.id)::int AS notice_count
      FROM public.departments AS d
      LEFT JOIN public.notices AS n ON n.department_id = d.id
      WHERE d.is_active
      GROUP BY d.id, d.code, d.name
      ORDER BY d.code
    `),
    db.query<NoticeQueryRow>(`
      SELECT n.id, n.source_id, n.title, n.category, n.body_text,
             n.source_url, n.published_at::text AS published_at, n.attachments,
             d.code AS department_code, d.name AS department_name
      FROM public.notices AS n
      JOIN public.departments AS d ON d.id = n.department_id
      WHERE ${pageWhere}
      ORDER BY n.published_at DESC NULLS LAST, n.id DESC
      LIMIT ${limitParameter}
    `, pageValues),
    hasFilters ? db.query<{ total: number }>(`
      SELECT count(*)::int AS total
      FROM public.notices AS n
      JOIN public.departments AS d ON d.id = n.department_id
      WHERE ${where}
    `, filterValues) : Promise.resolve(null),
    db.query<{ category: string }>(`
      SELECT DISTINCT n.category
      FROM public.notices AS n
      JOIN public.departments AS d ON d.id = n.department_id
      WHERE d.is_active AND n.category IS NOT NULL AND n.category <> ''
      ORDER BY n.category
    `),
    db.query<{
      status: string;
      started_at: string;
      finished_at: string | null;
      notices_added: number;
      errors: number;
    }>(`
      SELECT status, started_at::text AS started_at, finished_at::text AS finished_at,
             notices_added, errors
      FROM public.sync_runs
      WHERE kind = 'notices'
      ORDER BY started_at DESC, id DESC
      LIMIT 1
    `),
  ]);

  const hasNextPage = noticeResult.rows.length > NOTICE_PAGE_SIZE;
  const pageRows = hasNextPage ? noticeResult.rows.slice(0, NOTICE_PAGE_SIZE) : noticeResult.rows;
  const lastNotice = pageRows.at(-1);
  const latestRun = runResult.rows[0];
  const total = countResult
    ? Number(countResult.rows[0]?.total ?? 0)
    : departmentResult.rows.reduce((sum, row) => sum + Number(row.notice_count), 0);
  return {
    departments: departmentResult.rows.map((row) => ({
      code: row.code,
      name: row.name,
      noticeCount: Number(row.notice_count),
    } satisfies DepartmentSummary)),
    notices: pageRows.map((row) => ({
      id: String(row.id),
      sourceId: String(row.source_id),
      title: row.title,
      category: row.category,
      bodyText: row.body_text ?? "",
      sourceUrl: row.source_url,
      publishedAt: row.published_at,
      attachments: attachmentUrls(row.attachments),
      departmentCode: row.department_code,
      departmentName: row.department_name,
    } satisfies NoticeSummary)),
    lastRun: latestRun
      ? {
          status: latestRun.status,
          startedAt: latestRun.started_at,
          finishedAt: latestRun.finished_at,
          noticesAdded: Number(latestRun.notices_added),
          errors: Number(latestRun.errors),
        }
      : null,
    categories: categoryResult.rows.map((row) => row.category),
    total,
    hasNextPage,
    nextCursor: hasNextPage && lastNotice
      ? encodeNoticeCursor({ id: String(lastNotice.id), publishedAt: lastNotice.published_at })
      : null,
  };
}

export async function homeSnapshot() {
  const { rows } = await db.query<{
    departments: number;
    notices: number;
    routines: number;
    sync_status: string | null;
    last_synced_at: string | null;
  }>(`
    SELECT
        (SELECT count(*)::int FROM public.departments WHERE is_active) AS departments,
        (SELECT count(*)::int
         FROM public.notices AS n
         JOIN public.departments AS d ON d.id = n.department_id
         WHERE d.is_active) AS notices,
        (SELECT count(DISTINCT department_id)::int
         FROM public.routine_versions AS r
         JOIN public.departments AS d ON d.id = r.department_id
         WHERE r.is_current AND d.is_active
           AND concat_ws(' ', r.title, r.parsed_data->>'title') ~* '\\m(routine|class[[:space:]]+(time[[:space:]]*table|schedule))\\M'
           AND concat_ws(' ', r.title, r.parsed_data->>'title') !~* '\\m(exam(ination)?s?|mid[[:space:]-]?term|quiz(zes)?)\\M') AS routines,
        (SELECT status FROM public.sync_runs WHERE kind = 'notices' ORDER BY started_at DESC, id DESC LIMIT 1) AS sync_status,
        (SELECT finished_at::text FROM public.sync_runs WHERE kind = 'notices' ORDER BY started_at DESC, id DESC LIMIT 1) AS last_synced_at
  `);
  const snapshot = rows[0];
  if (!snapshot) throw new Error("Could not load the DIUBoard overview.");

  return {
    departments: Number(snapshot.departments),
    notices: Number(snapshot.notices),
    routines: Number(snapshot.routines),
    syncStatus: snapshot.sync_status,
    lastSyncedAt: snapshot.last_synced_at,
  };
}
