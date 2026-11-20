import { NextResponse } from "next/server";
import { isDatabaseConfigured, prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Liveness + database check for hosting platforms. */
export async function GET() {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: true, database: "preview-memory" });
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: "up" });
  } catch {
    return NextResponse.json({ ok: false, database: "down" }, { status: 503 });
  }
}
