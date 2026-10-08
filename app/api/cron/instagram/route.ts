import { NextResponse, type NextRequest } from "next/server";
import { igCron } from "@/lib/instagram";
import { onInstagramPublished } from "@/lib/contentNotify";
import { cronAuthorized } from "../auth";

export const dynamic = "force-dynamic";

/** Cada 5 minutos (netlify/functions/instagram-publicar.mts): avanza lo que se está publicando y publica lo programado. */
export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const done = await igCron(onInstagramPublished);
  return NextResponse.json({ ok: true, done });
}
