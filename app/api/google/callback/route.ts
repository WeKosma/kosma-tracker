import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { exchangeCode, verifyState } from "@/lib/google";

export async function GET(req: NextRequest) {
  const back = req.nextUrl.clone();
  back.pathname = "/agenda";
  back.search = "";

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const session = await getSession();

  let status = "ok";
  if (req.nextUrl.searchParams.get("error")) status = "cancelado";
  else if (!session || session.role !== "admin") status = "sin-permiso";
  else if (!code || !verifyState(state, session.userId)) status = "estado-invalido";
  else {
    try {
      await exchangeCode(code, req.nextUrl.origin, session.userId);
    } catch (e) {
      console.error("[google] callback", e);
      status = reason(e);
    }
  }
  back.searchParams.set("google", status);
  const res = NextResponse.redirect(back);
  res.headers.set("Cache-Control", "no-store");
  return res;
}

/** Traduce el error a un código corto para mostrar un mensaje útil (sin exponer detalles). */
function reason(e: unknown) {
  const err = e as { message?: string; code?: string };
  const m = `${err?.code ?? ""} ${err?.message ?? String(e)}`.toLowerCase();
  if (m.includes("integrations") || m.includes("schema cache") || m.includes("pgrst205") || m.includes("42p01")) return "falta-sql";
  if (m.includes("invalid_client") || m.includes("unauthorized")) return "cliente-invalido";
  if (m.includes("redirect_uri")) return "redirect";
  if (m.includes("refresh token")) return "sin-refresh";
  if (m.includes("invalid_grant")) return "codigo-usado";
  if (m.includes("secret") || m.includes("api key") || m.includes("jwt")) return "supabase-key";
  return "error";
}
