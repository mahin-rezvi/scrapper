import { config } from "dotenv";

config({ path: ".env", quiet: true });
config({ path: ".env.local", quiet: true });

async function main() {
  const [{ syncNotices }, { syncRoutines }] = await Promise.all([
    import("../lib/pipeline/syncNotices"),
    import("../lib/pipeline/syncRoutines"),
  ]);

  const notices = await syncNotices();
  console.log("Notice sync:", JSON.stringify(notices, null, 2));
  const failedNoticeDepartments = new Set(
    notices.departments.filter((department) => department.errors > 0).map((department) => department.department)
  );
  const routines = await syncRoutines({ skipDepartmentCodes: failedNoticeDepartments });
  console.log("Routine sync:", JSON.stringify(routines, null, 2));
  if (notices.status !== "completed" || routines.status !== "completed") {
    console.error("DIU sync completed with errors; review the per-department results above.");
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("DIU sync failed:", error);
    process.exitCode = 1;
  });
