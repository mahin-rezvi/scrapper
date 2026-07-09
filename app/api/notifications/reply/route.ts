import { NextRequest, NextResponse } from "next/server";
import { replyToUser } from "@/lib/ai/replyToUser";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const department = typeof body.department === "string" ? body.department.trim() : undefined;
    const limit = typeof body.limit === "number" ? body.limit : undefined;

    if (!query) {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 }
      );
    }

    const result = await replyToUser({ query, department, limit });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to generate reply", detail: String(err) },
      { status: 500 }
    );
  }
}
