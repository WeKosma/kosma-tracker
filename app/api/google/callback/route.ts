import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { exchangeCode } from "@/lib/google";

export async function GET(req: NextRequest) {
  const back = req.nextUrl.clone();
  back.pathname = "/agenda";
  back.search = "";

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const saved = req.cookies.get("kosma_google_state")?.value;
  const session = await getSession();

  let status = "ok";
  if (req.nextUrl.searchParams.get("error")) status = "cancelado";
  else if (!session || session.role !== "admin") status = "sin-permiso";
  else if (!code || !state || state !== saved) status = "estado-invalido";
  else {
    try {
      await exchangeCode(code, req.nextUrl.origin, session.userId);
    } catch (e) {
      console.error("[google] callback", e);
      status = "error";
    }
  }
  back.searchParams.set("google", status);
  const res = NextResponse.redirect(back);
  res.cookies.delete("kosma_google_state");
  return res;
}
