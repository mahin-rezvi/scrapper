import { getGeminiClient, getGeminiModel } from "./geminiClient";
import { prisma } from "@/lib/db/prisma";

interface UserReplyParams {
  query: string;
  department?: string;
  limit?: number;
}

export interface UserReplyResult {
  answer: string;
  model: string;
  query: string;
  department?: string;
  notices: Array<{
    id: string;
    title: string;
    departmentCode: string;
    departmentName: string;
    publishedAt: string | null;
    summary: string | null;
    category: string | null;
    priority: string | null;
    deadline: string | null;
  }>;
}

const DEFAULT_NOTICE_LIMIT = 6;

function toDateString(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().split("T")[0];
}

export async function replyToUser(params: UserReplyParams): Promise<UserReplyResult> {
  const limit = Number(params.limit) || DEFAULT_NOTICE_LIMIT;
  const noticeLimit = Math.min(Math.max(limit, 1), 12);

  const notices = await prisma.notification.findMany({
    where: {
      status: "processed",
      ...(params.department
        ? { department: { code: params.department.toLowerCase() } }
        : {}),
    },
    include: {
      analysis: true,
      department: { select: { code: true, name: true } },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: noticeLimit,
  });

  const preparedNotices = notices.map((notice) => ({
    id: notice.id,
    title: notice.title,
    departmentCode: notice.department.code,
    departmentName: notice.department.name,
    publishedAt: toDateString(notice.publishedAt),
    summary: notice.analysis?.summary ?? null,
    category: notice.analysis?.category ?? null,
    priority: notice.analysis?.priority ?? null,
    deadline: notice.analysis?.deadline ?? null,
  }));

  const contextLines = preparedNotices.map((notice, index) => {
    return [`Notice ${index + 1}:`,
      `Department: ${notice.departmentCode.toUpperCase()} (${notice.departmentName})`,
      `Title: ${notice.title}`,
      `Published: ${notice.publishedAt ?? "unknown"}`,
      `Summary: ${notice.summary ?? "No summary available"}`,
      `Category: ${notice.category ?? "unknown"}`,
      `Priority: ${notice.priority ?? "unknown"}`,
      `Deadline: ${notice.deadline ?? "none"}`,
    ].join("\n");
  });

  const prompt = `You are an assistant for the Daffodil International University Notice Tracker. The user will ask a question about recent notices. Answer based only on the information from the notice summaries below. If you do not have enough information in the provided notices, say that you cannot answer from the latest notices.

${contextLines.join("\n\n")}

User question: ${params.query}

Answer:`;

  const client = getGeminiClient();
  const model = getGeminiModel();
  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      temperature: 0,
      responseMimeType: "text/plain",
    },
  });

  let answer = "";
  try {
    answer = response.text ?? "";
  } catch {
    answer = "";
  }

  return {
    answer: answer.trim(),
    model,
    query: params.query,
    department: params.department,
    notices: preparedNotices,
  };
}
