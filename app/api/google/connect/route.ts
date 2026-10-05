import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { authUrl, googleConfigured } from "@/lib/google";

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
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authUrl(req.nextUrl.origin, state));
  res.cookies.set("kosma_google_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
