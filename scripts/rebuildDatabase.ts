#!/usr/bin/env tsx
import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { runPipeline } from "../lib/pipeline/runPipeline";

async function main() {
  console.log("Starting full database rebuild...");

  console.log("Clearing existing notices, analysis, resources, and run logs...");
  await prisma.analysis.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.runLog.deleteMany();

  console.log("Resetting department lastSeenId to 0...");
  await prisma.department.updateMany({ data: { lastSeenId: 0 } });

  console.log("Running full pipeline to repopulate the database...");
  const results = await runPipeline();

  const totalNew = results.reduce((sum, result) => sum + result.newCount, 0);
  const totalErrors = results.reduce((sum, result) => sum + result.errorCount, 0);

  console.log("\nRebuild complete.");
  console.table(results);
  console.log(`Done - ${totalNew} new notice(s), ${totalErrors} error(s).`);
}

main()
  .catch((error) => {
    console.error("Full rebuild failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
