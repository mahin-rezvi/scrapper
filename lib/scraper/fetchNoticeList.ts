import * as cheerio from "cheerio";
import { withRetry } from "../utils/rateLimit";
import { noticeListUrl, BASE_URL } from "./departments";
import { logger } from "../utils/logger";

export interface NoticeListItem {
  sourceId: number;
  title: string;
  detailUrl: string;
  publishedDate?: string;
  category?: string;
}

const TIMEOUT_MS = 10_000;

/**
 * Fetch and parse the notice list page for a given department code.
 * Returns an array of {sourceId, title, detailUrl, publishedDate, category}.
 *
 * HTML structure confirmed by live inspection (2026-07-07):
 * - Each notice: div.blog-entry
 * - Title link: h3.heading > a  (href = .../notice-detail/{id})
 * - Category: first div.col-md-2 inside the notice row
 * - Date: div.col-md-2 containing the calendar icon + date string
 */
export async function fetchNoticeList(
  code: string
): Promise<NoticeListItem[]> {
  const url = noticeListUrl(code);

  const html = await withRetry(
    async () => {
      const userAgent =
        process.env.SCRAPER_USER_AGENT ?? "NoticeTrackerBot/1.0";
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": userAgent },
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} fetching ${url}`);
        }
        return res.text();
      } finally {
        clearTimeout(timer);
      }
    },
    2,
    1000
  );

  const $ = cheerio.load(html);
  const items: NoticeListItem[] = [];

  $("div.blog-entry").each((_i, el) => {
    const titleLink = $(el).find("h3.heading a, h3 a").first();
    const href = titleLink.attr("href")?.trim() ?? "";
    const title = titleLink.text().trim();

    if (!href || !title) return;

    // Extract numeric ID from URL: .../notice-detail/3754
    const idMatch = href.match(/notice-detail\/(\d+)/);
    if (!idMatch) return;
    const sourceId = parseInt(idMatch[1], 10);

    const cols = $(el).find("div.col-md-2");
    let category: string | undefined;
    let publishedDate: string | undefined;

    cols.each((_j, col) => {
      const $col = $(col);
      const text = $col.text().replace(/\s+/g, " ").trim();
      if ($col.find("i.fa-calendar-alt, i.fa-calendar").length > 0) {
        // This column contains the calendar icon — it's the date column
        publishedDate = text;
      } else if (
        $col.find("i.fa-edit, i.fa-building, i.fa-info, i.fa-tag").length > 0
      ) {
        // This column has a category/type icon
        category = text || undefined;
      }
    });

    // Fallback: if category still unset, try the first col-md-2 that isn't the date
    if (!category) {
      cols.each((_j, col) => {
        const $col = $(col);
        if ($col.find("i.fa-calendar-alt, i.fa-calendar").length === 0) {
          const text = $col.text().replace(/\s+/g, " ").trim();
          if (text) { category = text; return false; } // break
        }
      });
    }

    const detailUrl = href.startsWith("http")
      ? href
      : `${BASE_URL}${href}`;

    items.push({ sourceId, title, detailUrl, publishedDate, category });
  });

  logger.info(`[fetchNoticeList] ${code}: found ${items.length} notices`);
  return items;
}
