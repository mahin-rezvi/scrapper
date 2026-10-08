import { db } from "@/lib/db/postgres";

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

function attachmentUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function dashboardData(limit = 48) {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const [departmentResult, noticeResult, runResult] = await Promise.all([
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
      WHERE d.is_active
      ORDER BY n.published_at DESC NULLS LAST, n.id DESC
      LIMIT $1
    `, [safeLimit]),
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

  const latestRun = runResult.rows[0];
  return {
    departments: departmentResult.rows.map((row) => ({
      code: row.code,
      name: row.name,
      noticeCount: Number(row.notice_count),
    } satisfies DepartmentSummary)),
    notices: noticeResult.rows.map((row) => ({
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
  };
}
