import * as cheerio from "cheerio";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import utc from "dayjs/plugin/utc";
import { withRetry } from "../utils/rateLimit";
import { noticeDetailUrl, BASE_URL } from "./departments";
import { logger } from "../utils/logger";

dayjs.extend(customParseFormat);
dayjs.extend(utc);

export interface NoticeDetail {
  title: string;
  publishedAt: Date | null;
  category: string | null;
  bodyText: string;
  bodyHtml: string;
  resourceLinks: string[];
}

const USER_AGENT =
  process.env.SCRAPER_USER_AGENT ?? "NoticeTrackerBot/1.0";
const TIMEOUT_MS = 10_000;

/**
 * Fetch and parse the detail page for a single notice.
 *
 * HTML structure confirmed by live inspection (2026-07-07):
 * - Title:   section.ftco-section div.title h3
 * - Body:    section.ftco-section div.conten  (note: misspelled, no trailing 't')
 * - PDF/file links:  a.btn[href*="/download-file/"]
 * - Breadcrumb: div.breadcrumb (used as fallback category)
 * - No explicit published date on detail page; the list page date is used by the caller.
 */
export async function fetchNoticeDetail(
  code: string,
  sourceId: number
): Promise<NoticeDetail> {
  const url = noticeDetailUrl(code, sourceId);

  const html = await withRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT },
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
  const contentSection = $("section.ftco-section").first();

  // Title: prefer the div.title heading; fall back to og:title meta
  const title =
    contentSection.find("div.title h3, div.title h2").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    "";

  // Body HTML: the div.conten container (misspelled in the source)
  const bodyEl = contentSection.find("div.conten").first();
  const bodyHtml = bodyEl.html()?.trim() ?? "";
  const bodyText = bodyEl.text().replace(/\s+/g, " ").trim();

  // Resource links: any <a> with /download-file/ in href, or explicit .pdf links
  const resourceLinks: string[] = [];
  contentSection
    .find('a[href*="/download-file/"], a[href$=".pdf"], a[href$=".PDF"]')
    .each((_i, el) => {
      const href = $(el).attr("href")?.trim();
      if (!href) return;
      const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      if (!resourceLinks.includes(fullUrl)) {
        resourceLinks.push(fullUrl);
      }
    });

  // Category from breadcrumb: the first <a> inside div.breadcrumb
  const breadcrumbAnchor = contentSection
    .find("div.breadcrumb a")
    .first()
    .text()
    .trim();
  const category = breadcrumbAnchor || null;

  logger.info(
    `[fetchNoticeDetail] ${code}/${sourceId}: "${title}", ${resourceLinks.length} resource(s)`
  );

  return {
    title,
    publishedAt: null, // date is parsed by the caller from the list page entry
    category,
    bodyText,
    bodyHtml,
    resourceLinks,
  };
}

/**
 * Parse a date string from the list page (e.g., "Jun 28, 2026") into a Date.
 * Returns null if the string can't be parsed.
 * Uses UTC noon to avoid timezone-related off-by-one day shifts.
 */
export function parseListDate(raw: string): Date | null {
  // Strip icon text and extra whitespace
  const cleaned = raw.replace(/[\r\n]+/g, " ").trim();
  const formats = ["MMM D, YYYY", "MMM DD, YYYY", "MMMM D, YYYY"];
  for (const fmt of formats) {
    const d = dayjs.utc(cleaned, fmt, true);
    if (d.isValid()) return d.toDate();
  }
  // Fallback: try native Date (set to noon UTC to avoid timezone drift)
  const d = new Date(cleaned + " 12:00:00 UTC");
  if (!isNaN(d.getTime())) return d;
  return null;
}
