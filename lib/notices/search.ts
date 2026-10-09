export type NoticeCursor = {
  publishedAt: string | null;
  id: string;
};

export function parseNoticeCursor(value: string | undefined): NoticeCursor | null {
  if (!value || value.length > 256) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;

    const cursor = parsed as Record<string, unknown>;
    if (typeof cursor.id !== "string" || !/^\d{1,19}$/.test(cursor.id)) return null;
    if (cursor.id.length === 19 && cursor.id > "9223372036854775807") return null;
    if (cursor.publishedAt !== null && typeof cursor.publishedAt !== "string") return null;
    if (typeof cursor.publishedAt === "string" && !Number.isFinite(Date.parse(cursor.publishedAt))) return null;

    return {
      id: cursor.id,
      publishedAt: typeof cursor.publishedAt === "string"
        ? new Date(cursor.publishedAt).toISOString()
        : null,
    };
  } catch {
    return null;
  }
}

export function encodeNoticeCursor(cursor: NoticeCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
