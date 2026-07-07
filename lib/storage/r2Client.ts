import { S3Client } from "@aws-sdk/client-s3";

function getRequiredEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

/**
 * Cloudflare R2 client (S3-compatible).
 * Constructed lazily via getR2Client() so missing env vars only throw at runtime,
 * not at import time (important for Next.js build step).
 */
let _r2Client: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!_r2Client) {
    const accountId = getRequiredEnv("R2_ACCOUNT_ID");
    _r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }
  return _r2Client;
}
