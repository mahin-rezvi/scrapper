import { config } from "dotenv";

config({ path: ".env", quiet: true });
config({ path: ".env.local", quiet: true });

async function main() {
  const [{ syncNotices }, { db }] = await Promise.all([
    import("../lib/pipeline/syncNotices"),
    import("../lib/db/postgres"),
  ]);

  const result = await syncNotices({ fullBackfill: true });
  const { rows: departments } = await db.query<{
    code: string;
    notice_backfill_page: number;
    notice_backfill_complete: boolean;
    notice_count: number;
  }>(`
    SELECT d.code, d.notice_backfill_page, d.notice_backfill_complete,
           count(n.id)::int AS notice_count
    FROM public.departments AS d
    LEFT JOIN public.notices AS n ON n.department_id = d.id
    WHERE d.is_active
    GROUP BY d.id, d.code, d.notice_backfill_page, d.notice_backfill_complete
    ORDER BY d.code
  `);
  const incompleteDepartments = departments.filter((department) => !department.notice_backfill_complete);

  console.log(JSON.stringify({
    sync: result,
    totalNoticesStored: departments.reduce((total, department) => total + department.notice_count, 0),
    departments: departments.length,
    incompleteDepartments,
  }, null, 2));

  if (result.status !== "completed" || incompleteDepartments.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Notice archive backfill failed:", error);
  process.exitCode = 1;
});
