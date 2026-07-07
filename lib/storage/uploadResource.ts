import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client } from "./r2Client";
import { logger } from "../utils/logger";

export interface UploadResult {
  storageKey: string;
  publicUrl: string;
  fileType: string;
  fileSizeBytes: number;
}

/**
 * Downloads a file from `sourceUrl` and uploads it to Cloudflare R2.
 * Returns metadata needed for the Resource row.
 */
export async function uploadResource(
  sourceUrl: string,
  notificationId: string
): Promise<UploadResult> {
  const USER_AGENT =
    process.env.SCRAPER_USER_AGENT ?? "NoticeTrackerBot/1.0";
  const BUCKET = process.env.R2_BUCKET_NAME;
  const PUBLIC_URL_BASE = process.env.R2_PUBLIC_URL_BASE;

  if (!BUCKET) throw new Error("R2_BUCKET_NAME is not set");
  if (!PUBLIC_URL_BASE) throw new Error("R2_PUBLIC_URL_BASE is not set");

  // Download the file
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

  // Derive file extension from URL or content-type
  const urlPath = new URL(sourceUrl).pathname;
  const urlExt = urlPath.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? "";
  const ctExt = contentType.includes("pdf") ? ".pdf"
    : contentType.includes("png") ? ".png"
    : contentType.includes("jpeg") ? ".jpg"
    : contentType.includes("gif") ? ".gif"
    : "";
  const ext = urlExt || ctExt || ".bin";

  // Build a deterministic storage key
  const timestamp = Date.now();
  const storageKey = `notices/${notificationId}/${timestamp}${ext}`;

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.byteLength,
    })
  );

  const publicUrl = `${PUBLIC_URL_BASE.replace(/\/$/, "")}/${storageKey}`;

  logger.info(
    `[uploadResource] Uploaded ${storageKey} (${buffer.byteLength} bytes)`
  );

  return {
    storageKey,
    publicUrl,
    fileType: ext.replace(".", "") || "bin",
    fileSizeBytes: buffer.byteLength,
  };
}
