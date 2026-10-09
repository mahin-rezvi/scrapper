import { createHash } from "node:crypto";
import { db } from "@/lib/db/postgres";
import { analyzeRoutinePdf } from "@/lib/routines/analyzePdf";
import { isExamRoutineTitle, shouldProcessLatestRoutineNotice } from "@/lib/routines/search";
import { extractSectionCode, type RoutineExtraction } from "@/lib/routines/schema";
import { fetchNoticeDetail } from "@/lib/scraper/fetchNoticeDetail";
import { BASE_URL, DEPARTMENTS, noticeListUrl } from "@/lib/scraper/departments";
import { logger } from "@/lib/utils/logger";
import { sleep, withRetry } from "@/lib/utils/rateLimit";

const MAX_PDF_BYTES = 50 * 1024 * 1024;
const DEPARTMENT_DELAY_MS = Math.max(0, Number.parseInt(process.env.ROUTINE_INTER_DEPARTMENT_DELAY_MS ?? "250", 10) || 0);

type DepartmentRow = { id: string; code: string; name: string };
type LatestDepartmentNotice = DepartmentRow & {
  noticeId: string | null;
  sourceId: string | null;
  title: string | null;
  attachments: unknown;
};
type SourceRoutine = {
  noticeId: string;
  title: string;
  url: string;
};
type DownloadedRoutine = SourceRoutine & { pdf: Buffer };
type DepartmentRoutineResult = {
  department: string;
  status: "updated" | "unchanged" | "not_found" | "skipped" | "failed";
};

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

async function latestDepartmentNotices(): Promise<LatestDepartmentNotice[]> {
  const { rows } = await db.query<{
    id: string;
    code: string;
    name: string;
    notice_id: string | null;
    source_id: string | null;
    title: string | null;
    attachments: unknown;
  }>(`
    SELECT d.id, d.code, d.name,
           latest.id AS notice_id, latest.source_id, latest.title, latest.attachments
    FROM public.departments AS d
    LEFT JOIN LATERAL (
      SELECT n.id::text AS id, n.source_id::text AS source_id, n.title, n.attachments
      FROM public.notices AS n
      WHERE n.department_id = d.id
      ORDER BY COALESCE(n.published_at, n.first_seen_at) DESC, n.source_id DESC, n.id DESC
      LIMIT 1
    ) AS latest ON true
    WHERE d.is_active
    ORDER BY d.name
  `);

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    noticeId: row.notice_id,
    sourceId: row.source_id,
    title: row.title,
    attachments: row.attachments,
  }));
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
  const response = await withRetry(async () => {
    const fetched = await fetch(url, {
      headers: { "User-Agent": process.env.SCRAPER_USER_AGENT ?? "NoticeTrackerBot/1.0" },
      signal: AbortSignal.timeout(25_000),
    });
    if (fetched.status === 429 || fetched.status >= 500) {
      throw new Error(`HTTP ${fetched.status} fetching routine PDF.`);
    }
    return fetched;
  }, 2, 1000);
  if (!response.ok || !isAllowedSource(response.url)) return null;
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_PDF_BYTES) throw new Error("Routine PDF exceeds 50 MB.");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) throw new Error("Routine PDF exceeds 50 MB.");
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") return null;
  return bytes;
}

function getAttachmentUrls(attachments: unknown): string[] {
  if (!Array.isArray(attachments) || attachments.some((item) => typeof item !== "string")) {
    throw new Error("Latest notice attachments are not a list of URLs.");
  }
  return attachments;
}

async function findRoutinePdf(notice: LatestDepartmentNotice): Promise<DownloadedRoutine | null> {
  if (!notice.noticeId || !notice.sourceId || !notice.title) return null;

  const sourceId = Number(notice.sourceId);
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0) {
    throw new Error(`Invalid source notice ID "${notice.sourceId}".`);
  }

  let resourceUrls = getAttachmentUrls(notice.attachments);
  if (resourceUrls.length === 0) {
    resourceUrls = (await fetchNoticeDetail(notice.code, sourceId)).resourceLinks;
  }

  for (const url of resourceUrls) {
    const pdf = await fetchPdf(url);
    if (pdf) {
      return {
        noticeId: notice.noticeId,
        title: notice.title,
        url,
        pdf,
      };
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

async function publishRoutine(
  departmentId: string,
  source: SourceRoutine,
  contentSha256: string,
  extraction: RoutineExtraction,
) {
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
    source.noticeId,
  ]);
}

type ExistingRoutine = {
  is_current: boolean;
  title: string;
  version_label: string | null;
  effective_from: string | null;
  prepared_by: string | null;
  source_pdf_url: string;
  content_sha256: string;
  parsed_data: RoutineExtraction;
};

async function findExistingRoutine(
  departmentId: string,
  condition: "notice_id" | "content_sha256",
  value: string,
): Promise<ExistingRoutine | null> {
  const column = condition === "notice_id" ? "notice_id" : "content_sha256";
  const { rows } = await db.query<ExistingRoutine>(`
    SELECT is_current, title, version_label, effective_from, prepared_by,
           source_pdf_url, content_sha256, parsed_data
    FROM public.routine_versions
    WHERE department_id = $1 AND ${column} = $2
    LIMIT 1
  `, [departmentId, value]);
  return rows[0] ?? null;
}

function extractionFromExisting(existing: ExistingRoutine): RoutineExtraction {
  return {
    ...existing.parsed_data,
    title: existing.title,
    versionLabel: existing.version_label,
    effectiveFrom: existing.effective_from,
    preparedBy: existing.prepared_by,
  };
}

async function republishExisting(
  notice: LatestDepartmentNotice,
  existing: ExistingRoutine,
): Promise<DepartmentRoutineResult> {
  if (!notice.noticeId || !notice.sourceId || !notice.title) {
    return { department: notice.code, status: "not_found" };
  }

  await publishRoutine(notice.id, {
    noticeId: notice.noticeId,
    title: notice.title,
    url: existing.source_pdf_url,
  }, existing.content_sha256, extractionFromExisting(existing));
  return { department: notice.code, status: "updated" };
}

async function syncDepartmentRoutine(
  notice: LatestDepartmentNotice,
  skipDepartmentCodes: ReadonlySet<string>,
): Promise<DepartmentRoutineResult> {
  const { id, code, noticeId, sourceId, title } = notice;
  const noticeSyncSucceeded = !skipDepartmentCodes.has(code);
  if (!noticeSyncSucceeded) {
    logger.warn(`[routine-sync] ${code} skipped because its notice sync had errors.`);
  }
  if (!noticeId || !sourceId || !title) {
    return { department: code, status: "not_found" };
  }
  if (!shouldProcessLatestRoutineNotice(title, noticeSyncSucceeded)) {
    return { department: code, status: "skipped" };
  }

  const existingNoticeVersion = await findExistingRoutine(id, "notice_id", noticeId);
  if (existingNoticeVersion?.is_current) {
    return { department: code, status: "unchanged" };
  }
  if (existingNoticeVersion) {
    return republishExisting(notice, existingNoticeVersion);
  }

  const source = await findRoutinePdf(notice);
  if (!source) return { department: code, status: "not_found" };

  const contentSha256 = createHash("sha256").update(source.pdf).digest("hex");
  const existingContent = await findExistingRoutine(id, "content_sha256", contentSha256);
  if (existingContent) {
    await publishRoutine(id, source, contentSha256, extractionFromExisting(existingContent));
    return {
      department: code,
      status: existingContent.is_current ? "unchanged" : "updated",
    };
  }

  const extraction = addSectionCodes(await analyzeRoutinePdf(source.pdf));
  if (isExamRoutineTitle(extraction.title)) {
    throw new Error(`Refusing to publish an exam routine as a class timetable: "${extraction.title}".`);
  }
  await publishRoutine(id, source, contentSha256, extraction);
  logger.info(`[routine-sync] ${code}: published ${extraction.title}`);
  return { department: code, status: "updated" };
}

export async function syncRoutines(options: {
  skipDepartmentCodes?: ReadonlySet<string>;
} = {}) {
  const { rows: runRows } = await db.query<{ id: string }>(`
    INSERT INTO public.sync_runs (kind, status)
    VALUES ('routines', 'running')
    RETURNING id
  `);
  const runId = runRows[0].id;

  try {
    await ensureDepartments();
    const latestNotices = await latestDepartmentNotices();
    const skipDepartmentCodes = options.skipDepartmentCodes ?? new Set<string>();
    const results: DepartmentRoutineResult[] = [];
    for (const notice of latestNotices) {
      try {
        results.push(await syncDepartmentRoutine(notice, skipDepartmentCodes));
      } catch (error) {
        logger.error(`[routine-sync] ${notice.code} failed: ${String(error)}`);
        results.push({ department: notice.code, status: "failed" });
      }
      if (DEPARTMENT_DELAY_MS > 0) await sleep(DEPARTMENT_DELAY_MS);
    }

    const updated = results.filter((result) => result.status === "updated").length;
    const errors = results.filter((result) => result.status === "failed").length;
    const unchanged = results.filter((result) => result.status === "unchanged").length;
    const skipped = results.filter((result) => result.status === "skipped").length;
    const notFound = results.filter((result) => result.status === "not_found").length;
    const status = errors > 0 ? "partial" : "completed";
    const message = `${updated} updated, ${unchanged} unchanged, ${skipped} skipped because the latest notice is not a class routine or notice sync failed, ${notFound} without a notice or routine PDF, ${errors} failed.`;
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
