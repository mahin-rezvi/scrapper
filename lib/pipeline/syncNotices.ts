import { db } from "@/lib/db/postgres";
import { parseListDate, fetchNoticeDetail } from "@/lib/scraper/fetchNoticeDetail";
import { fetchNoticeList, type NoticeListItem } from "@/lib/scraper/fetchNoticeList";
import { DEPARTMENTS, noticeListUrl } from "@/lib/scraper/departments";
import { sleep } from "@/lib/utils/rateLimit";
import { logger } from "@/lib/utils/logger";

type DepartmentRow = { id: string; code: string; name: string };
type DepartmentSyncResult = { department: string; added: number; refreshed: number; errors: number };

export type NoticeSyncResult = {
  status: "completed" | "partial";
  departments: DepartmentSyncResult[];
  noticesAdded: number;
  noticesRefreshed: number;
  errors: number;
};

const requestDelayMs = Math.max(
  0,
  Number.parseInt(process.env.SYNC_INTER_REQUEST_DELAY_MS ?? "200", 10) || 0
);
const maxNoticePages = Math.max(
  1,
  Number.parseInt(process.env.NOTICE_SYNC_MAX_PAGES ?? "5", 10) || 5
);

async function ensureDepartments(): Promise<DepartmentRow[]> {
  const departments = DEPARTMENTS.map((department) => ({
    ...department,
    source_url: noticeListUrl(department.code),
  }));
  const { rows } = await db.query<DepartmentRow>(`
    INSERT INTO public.departments (code, name, source_url, is_active)
    SELECT code, name, source_url, true
    FROM jsonb_to_recordset($1::jsonb) AS d(code text, name text, source_url text)
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name,
      source_url = EXCLUDED.source_url,
      is_active = true,
      updated_at = now()
    RETURNING id, code, name
  `, [JSON.stringify(departments)]);
  return rows;
}

async function knownSourceIds(departmentId: string): Promise<Set<number>> {
  const { rows } = await db.query<{ source_id: string }>(`
    SELECT source_id
    FROM public.notices
    WHERE department_id = $1
  `, [departmentId]);
  return new Set(rows.map((row) => Number(row.source_id)));
}

async function refreshKnownNotice(
  departmentId: string,
  item: NoticeListItem
) {
  await db.query(`
    UPDATE public.notices
    SET title = $3,
        category = $4,
        source_url = $5,
        published_at = $6,
        last_seen_at = now(),
        updated_at = now()
    WHERE department_id = $1 AND source_id = $2
  `, [
    departmentId,
    item.sourceId,
    item.title,
    item.category ?? null,
    item.detailUrl,
    item.publishedDate ? parseListDate(item.publishedDate)?.toISOString() ?? null : null,
  ]);
}

async function storeNewNotice(
  department: DepartmentRow,
  item: NoticeListItem
) {
  const detail = await fetchNoticeDetail(department.code, item.sourceId);
  const publishedAt = item.publishedDate ? parseListDate(item.publishedDate) : null;
  await db.query(`
    INSERT INTO public.notices (
      department_id, source_id, title, category, body_text, body_html,
      attachments, source_url, published_at, last_seen_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, now(), now())
    ON CONFLICT (department_id, source_id) DO UPDATE SET
      title = EXCLUDED.title,
      category = EXCLUDED.category,
      body_text = EXCLUDED.body_text,
      body_html = EXCLUDED.body_html,
      attachments = EXCLUDED.attachments,
      source_url = EXCLUDED.source_url,
      published_at = EXCLUDED.published_at,
      last_seen_at = now(),
      updated_at = now()
  `, [
    department.id,
    item.sourceId,
    detail.title || item.title,
    item.category ?? detail.category ?? null,
    detail.bodyText,
    detail.bodyHtml || null,
    JSON.stringify(detail.resourceLinks),
    item.detailUrl,
    publishedAt?.toISOString() ?? null,
  ]);
}

async function syncDepartment(department: DepartmentRow): Promise<DepartmentSyncResult> {
  const result: DepartmentSyncResult = {
    department: department.code,
    added: 0,
    refreshed: 0,
    errors: 0,
  };

  const knownIds = await knownSourceIds(department.id);
  const listItems = await fetchNoticeList(department.code, {
    knownSourceIds: knownIds,
    stopAtKnownPage: true,
    maxPages: knownIds.size === 0 ? 1 : maxNoticePages,
  });

  for (const item of listItems) {
    try {
      if (knownIds.has(item.sourceId)) {
        await refreshKnownNotice(department.id, item);
        result.refreshed += 1;
      } else {
        await storeNewNotice(department, item);
        result.added += 1;
      }
    } catch (error) {
      result.errors += 1;
      logger.error(`[sync] ${department.code}/${item.sourceId} failed: ${String(error)}`);
    }
    if (requestDelayMs > 0) await sleep(requestDelayMs);
  }
  return result;
}

export async function syncNotices(): Promise<NoticeSyncResult> {
  const { rows: runRows } = await db.query<{ id: string }>(`
    INSERT INTO public.sync_runs (kind, status)
    VALUES ('notices', 'running')
    RETURNING id
  `);
  const runId = runRows[0].id;

  try {
    const departments = await ensureDepartments();
    const results: DepartmentSyncResult[] = [];
    for (const department of departments) {
      try {
        results.push(await syncDepartment(department));
      } catch (error) {
        logger.error(`[sync] ${department.code} failed: ${String(error)}`);
        results.push({ department: department.code, added: 0, refreshed: 0, errors: 1 });
      }
    }

    const noticesAdded = results.reduce((total, item) => total + item.added, 0);
    const noticesRefreshed = results.reduce((total, item) => total + item.refreshed, 0);
    const errors = results.reduce((total, item) => total + item.errors, 0);
    const status = errors > 0 ? "partial" : "completed";
    await db.query(`
      UPDATE public.sync_runs
      SET status = $2,
          departments_processed = $3,
          notices_added = $4,
          notices_refreshed = $5,
          errors = $6,
          finished_at = now()
      WHERE id = $1
    `, [runId, status, results.length, noticesAdded, noticesRefreshed, errors]);
    return { status, departments: results, noticesAdded, noticesRefreshed, errors };
  } catch (error) {
    await db.query(`
      UPDATE public.sync_runs
      SET status = 'failed', errors = 1,
          message = 'Notice sync failed. Review server logs.',
          finished_at = now()
      WHERE id = $1
    `, [runId]);
    throw error;
  }
}
