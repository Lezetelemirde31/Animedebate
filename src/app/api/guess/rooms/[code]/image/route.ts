import type { NextRequest } from "next/server";
import { raceImageTarget } from "@/server/guess/race";
import { imageResponse } from "../../../image-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return imageResponse(req, (userId, r, s) => raceImageTarget(code, userId, r, s));
}
