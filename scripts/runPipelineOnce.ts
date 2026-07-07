import { prisma } from "../lib/db/prisma";
import { runPipeline } from "../lib/pipeline/runPipeline";

async function main() {
  const results = await runPipeline();
  const totalNew = results.reduce((sum, result) => sum + result.newCount, 0);
  const totalErrors = results.reduce((sum, result) => sum + result.errorCount, 0);

  console.table(results);
  console.log(`Done - ${totalNew} new notice(s), ${totalErrors} error(s).`);
}

main()
  .catch((error) => {
    console.error("Pipeline failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
