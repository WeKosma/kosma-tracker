import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewLead } from "@/lib/mail";
import { announceNewLead } from "@/lib/discord";

/**
 * Entrada de leads desde la web de KOSMA (formulario o agente).
 *
 * POST /api/intake
 * Headers: Authorization: Bearer <INTAKE_SECRET>   (o campo "key" en el body)
 * Body JSON: { company, name, email, phone, role, message, service, website, source }
 */

function cors(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const allowed = (process.env.INTAKE_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
  if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(req) });
}

const str = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(req: NextRequest) {
  const headers = cors(req);
  const secret = process.env.INTAKE_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "Intake deshabilitado" }, { status: 503, headers });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400, headers });
  }

  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? str(body.key);
  if (auth !== secret) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401, headers });

  // Honeypot anti-bots: si el campo oculto "website_url" viene lleno, se ignora en silencio
  if (str(body.website_url)) return NextResponse.json({ ok: true }, { headers });

  const email = str(body.email, 200);
  const company = str(body.company, 200) ?? str(body.name, 200) ?? email;
  if (!company) return NextResponse.json({ ok: false, error: "Falta empresa, nombre o correo" }, { status: 400, headers });

  const lead = {
    company,
    contact_name: str(body.name, 200),
    contact_email: email,
    contact_phone: str(body.phone, 60),
    contact_role: str(body.role, 120),
    website: str(body.website, 300),
    service: str(body.service, 120),
    summary: str(body.message, 4000),
    source: ["web", "referido", "linkedin", "prospeccion", "evento", "red", "otro"].includes(String(body.source)) ? String(body.source) : "web",
    stage: "nuevo",
    tags: ["entrada-web"],
  };

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("leads").insert(lead).select("*").single();
  if (error) {
    console.error("[intake]", error);
    return NextResponse.json({ ok: false, error: "No se pudo guardar" }, { status: 500, headers });
  }

  const { data: members } = await supabase.from("members").select("email,role");
  const to = (members ?? []).filter((m) => m.role !== "viewer").map((m) => m.email as string);
  await Promise.all([notifyNewLead(to, data, "Web de KOSMA", req.nextUrl.origin), announceNewLead(data, "Web de KOSMA")]);

  return NextResponse.json({ ok: true, id: data.id }, { headers });
}
