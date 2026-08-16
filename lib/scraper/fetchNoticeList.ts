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
const MAX_NOTICE_LIST_PAGES = Number.parseInt(
  process.env.SCRAPER_MAX_NOTICE_LIST_PAGES ?? "20",
  10
);

function buildNoticeListUrl(code: string, page: number): string {
  return noticeListUrl(code, page);
}

async function fetchPageHtml(url: string): Promise<string> {
  return withRetry(
    async () => {
      const userAgent = process.env.SCRAPER_USER_AGENT ?? "NoticeTrackerBot/1.0";
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
}

function parseNoticeItems($: cheerio.Root | cheerio.CheerioAPI): NoticeListItem[] {
  const items: NoticeListItem[] = [];

  $("div.blog-entry").each((_i, el) => {
    const titleLink = $(el).find("h3.heading a, h3 a").first();
    const href = titleLink.attr("href")?.trim() ?? "";
    const title = titleLink.text().trim();

    if (!href || !title) return;

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
        publishedDate = text;
      } else if (
        $col.find("i.fa-edit, i.fa-building, i.fa-info, i.fa-tag").length > 0
      ) {
        category = text || undefined;
      }
    });

    if (!category) {
      cols.each((_j, col) => {
        const $col = $(col);
        if ($col.find("i.fa-calendar-alt, i.fa-calendar").length === 0) {
          const text = $col.text().replace(/\s+/g, " ").trim();
          if (text) {
            category = text;
            return false;
          }
        }
      });
    }

    const detailUrl = href.startsWith("http")
      ? href
      : `${BASE_URL}${href}`;

    items.push({ sourceId, title, detailUrl, publishedDate, category });
  });

  return items;
}

export async function fetchNoticeList(
  code: string
): Promise<NoticeListItem[]> {
  const seenIds = new Set<number>();
  const items: NoticeListItem[] = [];

  for (let page = 1; page <= MAX_NOTICE_LIST_PAGES; page += 1) {
    const url = buildNoticeListUrl(code, page);
    const html = await fetchPageHtml(url);
    const $ = cheerio.load(html);
    const pageItems = parseNoticeItems($);

    if (pageItems.length === 0) {
      logger.info(`[fetchNoticeList] ${code}: no notices found on page ${page}, stopping pagination`);
      break;
    }

    const newPageItems = pageItems.filter((item) => {
      if (seenIds.has(item.sourceId)) {
        logger.warn(
          `[fetchNoticeList] ${code}: duplicate sourceId ${item.sourceId} skipped on page ${page}`
        );
        return false;
      }
      seenIds.add(item.sourceId);
      return true;
    });

    if (newPageItems.length === 0) {
      logger.info(`[fetchNoticeList] ${code}: all ${pageItems.length} notices on page ${page} were duplicates, stopping pagination`);
      break;
    }

    items.push(...newPageItems);
    logger.info(`[fetchNoticeList] ${code}: page ${page} returned ${newPageItems.length} new notices`);

    if (pageItems.length < 20) {
      break;
    }
  }

  logger.info(`[fetchNoticeList] ${code}: found ${items.length} notices across department pages`);
  return items;
}
