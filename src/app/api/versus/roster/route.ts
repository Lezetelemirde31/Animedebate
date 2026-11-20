import type { NextRequest } from "next/server";
import { handleLive, ok } from "@/server/live/http";
import { getRoster } from "@/server/versus/service";

export const dynamic = "force-dynamic";

/** Every fighter with its 1v1 kit (stats and techniques). */
export async function GET(req: NextRequest) {
  return handleLive(req, async () => ok((await getRoster()).list));
}
