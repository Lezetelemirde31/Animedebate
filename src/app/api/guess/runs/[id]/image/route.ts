import type { NextRequest } from "next/server";
import { runImageTarget } from "@/server/guess/solo";
import { imageResponse } from "../../../image-response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return imageResponse(req, (userId, r, s) => runImageTarget(id, userId, r, s));
}
