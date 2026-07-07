import { prisma } from "../db/prisma";
import { fetchNoticeList } from "../scraper/fetchNoticeList";
import { fetchNoticeDetail, parseListDate } from "../scraper/fetchNoticeDetail";
import { uploadResource } from "../storage/uploadResource";
import { analyzeNotification } from "../ai/analyzeNotification";
import { sleep } from "../utils/rateLimit";
import { logger } from "../utils/logger";
import { DEPARTMENTS } from "../scraper/departments";
import { ensureDepartments } from "../db/ensureDepartments";

function positiveIntFromEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const INTER_REQUEST_DELAY_MS = positiveIntFromEnv(
  "PIPELINE_INTER_REQUEST_DELAY_MS",
  750
);
const MAX_NEW_PER_DEPARTMENT = positiveIntFromEnv(
  "PIPELINE_MAX_NEW_PER_DEPARTMENT",
  2
);

interface PipelineResult {
  department: string;
  newCount: number;
  errorCount: number;
  status: "success" | "partial" | "failed";
  message: string;
}

/**
 * Process a single department:
 * 1. Fetch the notice list
 * 2. For each notice not yet in DB (checked via @@unique constraint), fetch detail
 * 3. Download and upload attachments to R2
 * 4. Run Gemini analysis
 * 5. Write Notification, Resource(s), and Analysis rows
 * 6. Update Department.lastSeenId (bookkeeping only - not used as gate)
 */
async function processDepartment(
  code: string,
  deptDbId: string,
  deptName: string
): Promise<PipelineResult> {
  const startedAt = new Date();
  let newCount = 0;
  let errorCount = 0;
  let maxSeenId = 0;

  try {
    const listItems = await fetchNoticeList(code);
    await sleep(INTER_REQUEST_DELAY_MS);

    for (const item of listItems) {
      // Track max sourceId seen (bookkeeping metric)
      if (item.sourceId > maxSeenId) maxSeenId = item.sourceId;

      try {
        // Idempotency: skip if this (departmentId, sourceId) already exists
        const existing = await prisma.notification.findUnique({
          where: {
            departmentId_sourceId: {
              departmentId: deptDbId,
              sourceId: item.sourceId,
            },
          },
          select: { id: true },
        });
        if (existing) continue;

        // Fetch full detail
        await sleep(INTER_REQUEST_DELAY_MS);
        const detail = await fetchNoticeDetail(code, item.sourceId);

        const publishedAt = item.publishedDate
          ? parseListDate(item.publishedDate)
          : null;

        // Create the Notification row as status="new"
        const notification = await prisma.notification.create({
          data: {
            sourceId: item.sourceId,
            title: detail.title || item.title,
            publishedAt,
            category: item.category ?? detail.category ?? null,
            bodyText: detail.bodyText,
            bodyHtml: detail.bodyHtml,
            sourceUrl: item.detailUrl,
            departmentId: deptDbId,
            status: "new",
          },
        });

        // Download and upload each resource
        for (const resourceUrl of detail.resourceLinks) {
          try {
            const uploaded = await uploadResource(resourceUrl, notification.id);
            await prisma.resource.create({
              data: {
                notificationId: notification.id,
                originalUrl: resourceUrl,
                storageKey: uploaded.storageKey,
                publicUrl: uploaded.publicUrl,
                fileType: uploaded.fileType,
                fileSizeBytes: uploaded.fileSizeBytes,
              },
            });
            await sleep(500);
          } catch (resErr) {
            logger.error(
              `[pipeline] Resource upload failed for ${resourceUrl}: ${resErr}`
            );
            errorCount++;
            // Continue: one failed file must not fail the notice
          }
        }

        // Run Gemini analysis
        try {
          const result = await analyzeNotification({
            department: deptName,
            title: notification.title,
            publishedAt: publishedAt?.toISOString() ?? "unknown",
            bodyText: detail.bodyText,
          });

          await prisma.analysis.create({
            data: {
              notificationId: notification.id,
              summary: result.parsed?.summary ?? "Analysis failed",
              category: result.parsed?.category ?? null,
              priority: result.parsed?.priority ?? null,
              deadline: result.parsed?.deadline ?? null,
              affectedGroups: result.parsed?.affectedGroups
                ? result.parsed.affectedGroups
                : undefined,
              actionItems: result.parsed?.actionItems
                ? result.parsed.actionItems
                : undefined,
              requiresPayment: result.parsed?.requiresPayment ?? null,
              rawResponse: result.rawResponse as object,
              model: result.model,
            },
          });

          // Update notification status
          await prisma.notification.update({
            where: { id: notification.id },
            data: { status: result.success ? "processed" : "failed" },
          });
        } catch (aiErr) {
          logger.error(`[pipeline] Gemini analysis failed: ${aiErr}`);
          errorCount++;
          await prisma.notification.update({
            where: { id: notification.id },
            data: { status: "failed" },
          });
        }

        newCount++;

        if (newCount >= MAX_NEW_PER_DEPARTMENT) {
          logger.info(
            `[pipeline] ${code}: reached max new notices for this run (${MAX_NEW_PER_DEPARTMENT})`
          );
          break;
        }
      } catch (itemErr) {
        logger.error(
          `[pipeline] Failed to process notice ${item.sourceId}: ${itemErr}`
        );
        errorCount++;
      }
    }

    // Update lastSeenId bookkeeping metric once after processing all items
    if (maxSeenId > 0) {
      await prisma.department.update({
        where: { id: deptDbId },
        data: { lastSeenId: maxSeenId },
      });
    }

    const status: PipelineResult["status"] =
      errorCount > 0 && newCount === 0 ? "failed"
      : errorCount > 0 ? "partial"
      : "success";

    await prisma.runLog.create({
      data: {
        departmentId: deptDbId,
        status,
        message: `Processed ${newCount} new notice(s), ${errorCount} error(s)`,
        newCount,
        errorCount,
        startedAt,
        finishedAt: new Date(),
      },
    });

    return { department: code, newCount, errorCount, status, message: `OK` };
  } catch (err) {
    const message = `Fatal error for ${code}: ${err}`;
    logger.error(`[pipeline] ${message}`);

    await prisma.runLog.create({
      data: {
        departmentId: deptDbId,
        status: "failed",
        message,
        newCount,
        errorCount,
        startedAt,
        finishedAt: new Date(),
      },
    });

    return { department: code, newCount, errorCount, status: "failed", message };
  }
}

/**
 * Main pipeline entry point: loops all tracked departments.
 * Each department failure is isolated; the loop always continues.
 */
export async function runPipeline(): Promise<PipelineResult[]> {
  logger.info("[pipeline] Starting pipeline run...");
  const results: PipelineResult[] = [];

  // A fresh production DB should not silently skip every department just
  // because the seed command has not been run yet.
  await ensureDepartments();

  // Resolve all department DB records upfront
  const dbDepts = await prisma.department.findMany({
    where: { code: { in: DEPARTMENTS.map((d) => d.code) } },
  });

  const deptMap = new Map(dbDepts.map((d) => [d.code, d]));

  for (const dept of DEPARTMENTS) {
    const dbDept = deptMap.get(dept.code);
    if (!dbDept) {
      logger.warn(`[pipeline] Department ${dept.code} not found in DB — skipping`);
      continue;
    }

    try {
      const result = await processDepartment(dept.code, dbDept.id, dbDept.name);
      results.push(result);
    } catch (err) {
      logger.error(`[pipeline] Unhandled error for ${dept.code}: ${err}`);
      results.push({
        department: dept.code,
        newCount: 0,
        errorCount: 1,
        status: "failed",
        message: String(err),
      });
    }

    // Pause between departments
    await sleep(INTER_REQUEST_DELAY_MS * 2);
  }

  logger.info(
    `[pipeline] Done. Total new: ${results.reduce((s, r) => s + r.newCount, 0)}`
  );
  return results;
}
