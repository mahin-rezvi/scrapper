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
  const routines = await syncRoutines();
  console.log("Routine sync:", JSON.stringify(routines, null, 2));
}

main()
  .catch((error) => {
    console.error("DIU sync failed:", error);
    process.exitCode = 1;
  });
