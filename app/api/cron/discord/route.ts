import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { discordApi, discordConfig } from "@/lib/discord";
import { cronAuthorized } from "../auth";

export const dynamic = "force-dynamic";

type Msg = { id: string; content: string; author: { id: string; username: string; global_name?: string | null; bot?: boolean }; webhook_id?: string; attachments?: { url: string; filename: string }[] };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const coreName = (company: string) => norm(company.split(/\s[([·/]|\s\[|\s-\s/)[0].trim());
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const byId = (a: { id: string }, b: { id: string }) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1);

/**
 * Escucha de Discord (cada hora, desde netlify/functions/discord-escucha.mts):
 * lee los mensajes nuevos de los canales configurados y, si un mensaje nombra un lead,
 * lo guarda como nota en su ficha y marca el mensaje con ✅.
 */
export async function POST(req: NextRequest) {
  if (!cronAuthorized(req)) return NextResponse.json({ ok: false }, { status: 401 });
  const { listen, bot, guild } = discordConfig();
  if (!bot || !listen.length) return NextResponse.json({ ok: true, skipped: "Sin DISCORD_BOT_TOKEN o DISCORD_LISTEN_CHANNELS" });

  const sb = createAdminClient();
  const { data: state } = await sb.from("settings").select("value").eq("key", "discord_listen").maybeSingle();
  const checkpoints = { ...((state?.value as Record<string, string>) ?? {}) };

  const { data: leadRows } = await sb.from("leads").select("id,company");
  const matchers = (leadRows ?? [])
    .map((l) => ({ id: l.id as string, company: l.company as string, core: coreName(l.company as string) }))
    .filter((l) => l.core.length >= 3)
    .map((l) => ({ ...l, re: new RegExp(`(^|[^a-z0-9])${escRe(l.core)}([^a-z0-9]|$)`) }));

  let saved = 0;
  let read = 0;
  for (const channel of listen) {
    try {
      const last = checkpoints[channel];
      if (!last) {
        // Primera vez: arranca desde ahora (no reprocesa el historial)
        const latest = await discordApi<Msg[]>(`/channels/${channel}/messages?limit=1`);
        if (latest[0]) checkpoints[channel] = latest[0].id;
        continue;
      }
      const msgs = (await discordApi<Msg[]>(`/channels/${channel}/messages?after=${last}&limit=100`)).sort(byId);
      for (const m of msgs) {
        read += 1;
        checkpoints[channel] = m.id;
        if (m.author.bot || m.webhook_id || !m.content) continue;
        const text = norm(m.content);
        const hits = matchers.filter((x) => x.re.test(text)).slice(0, 3);
        if (!hits.length) continue;
        const author = m.author.global_name || m.author.username;
        const files = (m.attachments ?? []).map((a) => `${a.filename}: ${a.url}`).join("\n");
        const link = `https://discord.com/channels/${guild}/${channel}/${m.id}`;
        const { error } = await sb.from("notes").insert(
          hits.map((h) => ({ lead_id: h.id, body: `${m.content}${files ? `\n\n${files}` : ""}\n\nDiscord · ${author}\n${link}` }))
        );
        if (!error) {
          saved += hits.length;
          await discordApi(`/channels/${channel}/messages/${m.id}/reactions/${encodeURIComponent("✅")}/@me`, { method: "PUT" }).catch(() => {});
        }
      }
    } catch (e) {
      console.error("[discord] escucha", channel, e);
    }
  }

  await sb.from("settings").upsert({ key: "discord_listen", value: checkpoints, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true, read, saved });
}
