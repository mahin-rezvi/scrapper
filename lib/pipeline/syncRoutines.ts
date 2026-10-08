import { createHash } from "node:crypto";
import { db } from "@/lib/db/postgres";
import { analyzeRoutinePdf } from "@/lib/routines/analyzePdf";
import { extractSectionCode, type RoutineExtraction } from "@/lib/routines/schema";
import { fetchNoticeDetail } from "@/lib/scraper/fetchNoticeDetail";
import { fetchNoticeList, type NoticeListItem } from "@/lib/scraper/fetchNoticeList";
import { BASE_URL, DEPARTMENTS, noticeListUrl } from "@/lib/scraper/departments";
import { logger } from "@/lib/utils/logger";
import { sleep } from "@/lib/utils/rateLimit";

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const ROUTINE_TITLE = /routine|class\s+(?:time\s*table|schedule)|exam\s+schedule/i;
const DEPARTMENT_DELAY_MS = Math.max(0, Number.parseInt(process.env.ROUTINE_INTER_DEPARTMENT_DELAY_MS ?? "250", 10) || 0);

type DepartmentRow = { id: string; code: string; name: string };
type SourceRoutine = { item: NoticeListItem; url: string; pdf: Buffer };
type DepartmentRoutineResult = { department: string; status: "updated" | "unchanged" | "not_found" | "failed" };

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

function isAllowedSource(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === new URL(BASE_URL).hostname;
  } catch {
    return false;
  }
}

async function fetchPdf(url: string): Promise<Buffer | null> {
  if (!isAllowedSource(url)) return null;
  const response = await fetch(url, {
    headers: { "User-Agent": process.env.SCRAPER_USER_AGENT ?? "NoticeTrackerBot/1.0" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok || !isAllowedSource(response.url)) return null;
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_PDF_BYTES) throw new Error("Routine PDF exceeds 50 MB.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) throw new Error("Routine PDF exceeds 50 MB.");
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return null;
  return bytes;
}

async function discoverLatestRoutine(code: string): Promise<SourceRoutine | null> {
  const items = await fetchNoticeList(code, { maxPages: 3 });
  const candidates = items.filter((item) => ROUTINE_TITLE.test(item.title));
  for (const item of candidates) {
    try {
      const detail = await fetchNoticeDetail(code, item.sourceId);
      for (const url of detail.resourceLinks) {
        const pdf = await fetchPdf(url);
        if (pdf) return { item, url, pdf };
      }
    } catch (error) {
      logger.warn(`[routine-sync] ${code}/${item.sourceId} could not be checked: ${String(error)}`);
    }
  }
  return null;
}

function addSectionCodes(extraction: RoutineExtraction) {
  return {
    ...extraction,
    days: extraction.days.map((day) => ({
      ...day,
      rows: day.rows.map((row) => ({
        cells: row.cells.map((cell) => ({
          ...cell,
          sectionCode: extractSectionCode(cell.course),
        })),
      })),
    })),
  };
}

async function findSourceNoticeId(departmentId: string, sourceId: number): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(`
    SELECT id
    FROM public.notices
    WHERE department_id = $1 AND source_id = $2
  `, [departmentId, sourceId]);
  return rows[0]?.id ?? null;
}

async function publishRoutine(
  departmentId: string,
  source: SourceRoutine,
  contentSha256: string,
  extraction: RoutineExtraction
) {
  const noticeId = await findSourceNoticeId(departmentId, source.item.sourceId);
  await db.query(`
    SELECT public.publish_routine_version(
      $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9
    )
  `, [
    departmentId,
    extraction.title,
    extraction.versionLabel,
    extraction.effectiveFrom,
    extraction.preparedBy,
    source.url,
    contentSha256,
    JSON.stringify(extraction),
    noticeId,
  ]);
}

async function syncDepartmentRoutine(department: DepartmentRow): Promise<DepartmentRoutineResult> {
  const source = await discoverLatestRoutine(department.code);
  if (!source) return { department: department.code, status: "not_found" };

  const contentSha256 = createHash("sha256").update(source.pdf).digest("hex");
  const { rows } = await db.query<{
    id: string;
    is_current: boolean;
    title: string;
    version_label: string | null;
    effective_from: string | null;
    prepared_by: string | null;
    parsed_data: RoutineExtraction;
  }>(`
    SELECT id, is_current, title, version_label, effective_from, prepared_by, parsed_data
    FROM public.routine_versions
    WHERE department_id = $1 AND content_sha256 = $2
    LIMIT 1
  `, [department.id, contentSha256]);
  const existing = rows[0];

  if (existing?.is_current) return { department: department.code, status: "unchanged" };
  if (existing) {
    await publishRoutine(department.id, source, contentSha256, {
      ...existing.parsed_data,
      title: existing.title,
      versionLabel: existing.version_label,
      effectiveFrom: existing.effective_from,
      preparedBy: existing.prepared_by,
    });
    return { department: department.code, status: "updated" };
  }

  const extraction = addSectionCodes(await analyzeRoutinePdf(source.pdf));
  await publishRoutine(department.id, source, contentSha256, extraction);
  logger.info(`[routine-sync] ${department.code}: published ${extraction.title}`);
  return { department: department.code, status: "updated" };
}

export async function syncRoutines() {
  const { rows: runRows } = await db.query<{ id: string }>(`
    INSERT INTO public.sync_runs (kind, status)
    VALUES ('routines', 'running')
    RETURNING id
  `);
  const runId = runRows[0].id;

  try {
    const departments = await ensureDepartments();
    const results: DepartmentRoutineResult[] = [];
    for (const department of departments) {
      try {
        results.push(await syncDepartmentRoutine(department));
      } catch (error) {
        logger.error(`[routine-sync] ${department.code} failed: ${String(error)}`);
        results.push({ department: department.code, status: "failed" });
      }
      if (DEPARTMENT_DELAY_MS > 0) await sleep(DEPARTMENT_DELAY_MS);
    }

    const updated = results.filter((result) => result.status === "updated").length;
    const errors = results.filter((result) => result.status === "failed").length;
    const status = errors > 0 ? "partial" : "completed";
    const message = `${updated} updated, ${results.filter((result) => result.status === "unchanged").length} unchanged, ${results.filter((result) => result.status === "not_found").length} without a routine PDF, ${errors} failed.`;
    await db.query(`
      UPDATE public.sync_runs
      SET status = $2,
          departments_processed = $3,
          routines_added = $4,
          errors = $5,
          message = $6,
          finished_at = now()
      WHERE id = $1
    `, [runId, status, results.length, updated, errors, message]);
    return { status, departments: results, routinesAdded: updated, errors, message };
  } catch (error) {
    await db.query(`
      UPDATE public.sync_runs
      SET status = 'failed', errors = 1,
          message = 'Routine sync failed. Review server logs.',
          finished_at = now()
      WHERE id = $1
    `, [runId]);
    throw error;
  }
}
