import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { authUrl, createState, googleConfigured } from "@/lib/google";

/** Inicia la conexión con Google (solo admins). */
export async function GET(req: NextRequest) {
  const back = req.nextUrl.clone();
  back.pathname = "/agenda";
  back.search = "";
  const session = await getSession();
  if (!session || session.role !== "admin") {
    back.searchParams.set("google", "sin-permiso");
    return NextResponse.redirect(back);
  }
  if (!googleConfigured()) {
    back.searchParams.set("google", "sin-configurar");
    return NextResponse.redirect(back);
  }
  const res = NextResponse.redirect(authUrl(req.nextUrl.origin, createState(session.userId)));
  res.headers.set("Cache-Control", "no-store");
  return res;
}
