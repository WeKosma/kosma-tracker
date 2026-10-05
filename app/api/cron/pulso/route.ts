import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computePulse, pulseEmail, pulseEmbeds } from "@/lib/pulse";
import { sendMail } from "@/lib/mail";
import { postToDiscord } from "@/lib/discord";
import { cronAuthorized } from "../auth";

export const dynamic = "force-dynamic";

/** Pulso semanal: lo dispara netlify/functions/pulso-semanal.mts cada lunes a las 7:00 (Bogotá). */
export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const sb = createAdminClient();
  const pulse = await computePulse(sb);
  const { data: members } = await sb.from("members").select("email,role");
  const to = (members ?? []).filter((m) => m.role !== "viewer").map((m) => m.email as string);
  const mail = pulseEmail(pulse);
  const [m, d] = await Promise.all([sendMail(to, mail.subject, mail.html, mail.text), postToDiscord({ embeds: pulseEmbeds(pulse) })]);
  return NextResponse.json({ ok: true, email: m.sent, discord: d.sent });
}
