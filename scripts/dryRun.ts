#!/usr/bin/env tsx
/**
 * Dry-run script for Phase 2 checkpoint.
 * Usage: npm run scrape:dry -- --department=eee
 *
 * Fetches and prints the notice list (and optionally detail pages)
 * for a given department — NO DB writes, NO R2 uploads, NO Gemini calls.
 */

import "dotenv/config";
import { fetchNoticeList } from "../lib/scraper/fetchNoticeList";
import { fetchNoticeDetail, parseListDate } from "../lib/scraper/fetchNoticeDetail";
import { sleep } from "../lib/utils/rateLimit";

const args = process.argv.slice(2);
const deptArg = args.find((a) => a.startsWith("--department="));
const detailArg = args.find((a) => a.startsWith("--detail="));
const fullArg = args.includes("--full");

if (!deptArg) {
  console.error("Usage: npm run scrape:dry -- --department=<code> [--full] [--detail=<id>]");
  console.error("Example: npm run scrape:dry -- --department=hall --full");
  process.exit(1);
}

const code = deptArg.replace("--department=", "");

async function main() {
  console.log(`\n🔍 Dry-run for department: ${code.toUpperCase()}\n`);
  console.log("━".repeat(60));

  // Fetch notice list
  const items = await fetchNoticeList(code);

  if (items.length === 0) {
    console.log("⚠️  No notices found on list page.");
    return;
  }

  console.log(`📋 Found ${items.length} notice(s):\n`);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const parsedDate = item.publishedDate ? parseListDate(item.publishedDate) : null;
    console.log(
      `  [${i + 1}] #${item.sourceId} — ${item.title}\n` +
      `       Category: ${item.category ?? "(none)"}\n` +
      `       Date: ${item.publishedDate ?? "(none)"} → ${parsedDate?.toISOString().slice(0, 10) ?? "unparsed"}\n` +
      `       URL: ${item.detailUrl}`
    );
  }

  // If --full or --detail=<id>, fetch detail pages
  if (fullArg || detailArg) {
    const targetItems = detailArg
      ? items.filter((i) => i.sourceId === parseInt(detailArg.replace("--detail=", ""), 10))
      : items.slice(0, 3); // first 3 in --full mode

    console.log(`\n${"━".repeat(60)}\n📄 Fetching ${targetItems.length} detail page(s)...\n`);

    for (const item of targetItems) {
      await sleep(1500);
      const detail = await fetchNoticeDetail(code, item.sourceId);
      console.log(`\n  ══ Notice #${item.sourceId} ══`);
      console.log(`  Title:     ${detail.title || "(empty)"}`);
      console.log(`  Category:  ${detail.category ?? "(none)"}`);
      console.log(`  Resources: ${detail.resourceLinks.length} file(s)`);
      detail.resourceLinks.forEach((r) => console.log(`    → ${r}`));
      console.log(`  Body (first 300 chars):\n  ${detail.bodyText.slice(0, 300)}...`);
    }
  }

  console.log(`\n${"━".repeat(60)}`);
  console.log("✅ Dry-run complete — no DB writes, no uploads, no AI calls.\n");
}

main().catch((err) => {
  console.error("❌ Dry-run failed:", err);
  process.exit(1);
});
