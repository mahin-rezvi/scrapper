import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/notifications
 * Returns paginated notifications with their analysis and resources.
 * Optional query params: ?department=eee&status=processed&page=1&limit=20
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const departmentCode = searchParams.get("department");
  const status = searchParams.get("status");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "20", 10));
  const skip = (page - 1) * limit;

  try {
    const where = {
      ...(departmentCode
        ? { department: { code: departmentCode } }
        : {}),
      ...(status ? { status } : {}),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
          analysis: true,
          resources: true,
          department: { select: { code: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    return NextResponse.json({
      data: notifications,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch notifications", detail: String(err) },
      { status: 500 }
    );
  }
}
