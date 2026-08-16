import { logger } from "../utils/logger";

export interface UploadResult {
  storageKey: string;
  publicUrl: string;
  fileType: string;
  fileSizeBytes: number;
}

/**
 * Downloads a file from `sourceUrl` and returns metadata for DB storage.
 * This project no longer uploads to Cloudflare R2; the original `sourceUrl`
 * is kept as the public URL and `storageKey` is marked to indicate no upload.
 */
export async function uploadResource(
  sourceUrl: string,
  notificationId: string
): Promise<UploadResult> {
  const USER_AGENT =
    process.env.SCRAPER_USER_AGENT ?? "NoticeTrackerBot/1.0";
  // R2 uploads removed: always keep the original source URL as publicUrl

  // Download the file once so we can infer type and size.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  let buffer: Buffer;
  let contentType = "application/octet-stream";

  try {
    const res = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} downloading ${sourceUrl}`);
    }
    contentType = res.headers.get("content-type") ?? contentType;
    const arrayBuffer = await res.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timer);
  }

  const urlPath = new URL(sourceUrl).pathname;
  const urlExt = urlPath.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? "";
  const ctExt = contentType.includes("pdf") ? ".pdf"
    : contentType.includes("png") ? ".png"
    : contentType.includes("jpeg") ? ".jpg"
    : contentType.includes("gif") ? ".gif"
    : "";
  const ext = urlExt || ctExt || ".bin";
  const timestamp = Date.now();
  const storageKey = `notices/${notificationId}/${timestamp}${ext}`;
  const fileType = ext.replace(".", "") || "bin";

  logger.info(`[uploadResource] Skipping remote upload, keeping source URL`);
  return {
    storageKey: `no-r2:${storageKey}`,
    publicUrl: sourceUrl,
    fileType,
    fileSizeBytes: buffer.byteLength,
  };
}
