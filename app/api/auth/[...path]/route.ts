import { NextResponse } from "next/server";
import { isRoutineAdmin } from "@/lib/auth/config";
import { auth } from "@/lib/auth/server";

const handlers = auth.handler();
type AuthRouteContext = { params: Promise<{ path: string[] }> };

export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
export const PATCH = handlers.PATCH;

export async function POST(request: Request, context: AuthRouteContext) {
  const { path } = await context.params;
  const body = await request.clone().json().catch(() => null) as { email?: unknown } | null;
  if (body && typeof body.email === "string" && !isRoutineAdmin(body.email)) {
    return NextResponse.json({ error: "This account is not permitted to sign in." }, { status: 403 });
  }
  return handlers.POST(request, context);
}
