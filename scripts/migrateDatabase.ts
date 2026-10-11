import { config as loadEnv } from "dotenv";
import { spawnSync } from "node:child_process";
import path from "node:path";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local" });

const migrationNames = [
  "20261009000000_create_diu_tracker_schema",
  "20261010000000_incremental_notice_backfill",
];
const connectionString = process.env.DIU_DATABASE_URL_UNPOOLED;

if (!connectionString) {
  throw new Error("DIU_DATABASE_URL_UNPOOLED is required to run database migrations.");
}

const safeOutput = (value: string) => value.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[connection hidden]");
for (const migrationName of migrationNames) {
  const migrationPath = path.join(process.cwd(), "db/migrations", `${migrationName}.sql`);
  const result = spawnSync("psql", [
    connectionString,
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "--single-transaction",
    "--file",
    migrationPath,
  ], { encoding: "utf8", timeout: 120_000 });

  if (result.stdout.trim()) process.stdout.write(safeOutput(result.stdout));
  if (result.status !== 0) {
    if (result.stderr.trim()) process.stderr.write(safeOutput(result.stderr));
    console.error(`Migration ${migrationName} failed.`);
    process.exitCode = result.status ?? 1;
    break;
  }
  if (result.stderr.trim()) process.stderr.write(safeOutput(result.stderr));
  console.log(`Applied migration ${migrationName} (safe to re-run).`);
}
