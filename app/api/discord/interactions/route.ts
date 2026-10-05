import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { announceNewLead, COLOR, leadUrl, safeEmbed, verifyDiscordRequest, type Embed } from "@/lib/discord";
import { notifyNewLead } from "@/lib/mail";
import { computePulse, fmtMoney, pulseEmbeds } from "@/lib/pulse";
import { OPEN_STAGES, STAGES, STAGE_PROB, stageOf } from "@/lib/constants";

/**
 * Endpoint de interacciones del bot de Discord (Discord → tracker).
 * En el portal de Discord: Interactions Endpoint URL = https://<tracker>/api/discord/interactions
 */

export const dynamic = "force-dynamic";

type Opt = { name: string; type: number; value?: string; focused?: boolean; options?: Opt[] };
type DUser = { id: string; username: string; global_name?: string | null };
type Interaction = {
  type: number;
  guild_id?: string;
  channel_id?: string;
  member?: { user: DUser };
  user?: DUser;
  data?: {
    name?: string;
    type?: number;
    options?: Opt[];
    target_id?: string;
    custom_id?: string;
    values?: string[];
    resolved?: { messages?: Record<string, { id: string; content: string; channel_id: string; author: DUser; attachments?: { url: string; filename: string }[] }> };
  };
};

const EPHEMERAL = 64;
const reply = (content: string, opts: { ephemeral?: boolean; embeds?: Embed[]; components?: unknown[] } = {}) =>
  NextResponse.json({
    type: 4,
    data: { content, embeds: opts.embeds?.map(safeEmbed), components: opts.components, flags: opts.ephemeral ? EPHEMERAL : 0, allowed_mentions: { parse: [] } },
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const like = (q: string) => `%${q.replace(/[%_,()]/g, " ").trim()}%`;

/** Nombre "núcleo" de la empresa para reconocerla en un mensaje ("MERO Estudio (proyecto interno)" → "mero estudio"). */
const coreName = (company: string) => norm(company.split(/\s[([·/]|\s\[|\s-\s/)[0].trim());

function flat(opts: Opt[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of opts ?? []) {
    if (o.options) Object.assign(out, flat(o.options));
    else if (o.value != null) out[o.name] = String(o.value);
  }
  return out;
}

async function findLeads(sb: SupabaseClient, q: string) {
  let query = sb.from("leads").select("id,company,stage").order("last_activity_at", { ascending: false }).limit(25);
  if (q.trim()) query = query.ilike("company", like(q));
  const { data } = await query;
  return (data ?? []) as { id: string; company: string; stage: string }[];
}

async function resolveLead(sb: SupabaseClient, value: string) {
  if (UUID.test(value)) {
    const { data } = await sb.from("leads").select("*").eq("id", value).maybeSingle();
    if (data) return data;
  }
  const list = await findLeads(sb, value);
  if (!list.length) return null;
  const exact = list.find((l) => norm(l.company) === norm(value)) ?? list[0];
  const { data } = await sb.from("leads").select("*").eq("id", exact.id).maybeSingle();
  return data;
}

/** "2026-10-09", "hoy", "mañana", "viernes" → AAAA-MM-DD (hora Bogotá). */
function parseDate(input?: string) {
  if (!input) return null;
  const s = norm(input.trim());
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s === "hoy") return iso(today);
  if (s === "manana") return iso(new Date(today.getTime() + 86400000));
  const days = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const idx = days.indexOf(s);
  if (idx >= 0) {
    const diff = (idx - today.getDay() + 7) % 7 || 7;
    return iso(new Date(today.getTime() + diff * 86400000));
  }
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : today.getFullYear();
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

async function leadCard(sb: SupabaseClient, lead: Record<string, unknown>): Promise<Embed> {
  const id = lead.id as string;
  const [{ count: meetings }, { count: proposals }, { data: owner }] = await Promise.all([
    sb.from("meetings").select("id", { count: "exact", head: true }).eq("lead_id", id),
    sb.from("proposals").select("id", { count: "exact", head: true }).eq("lead_id", id),
    lead.owner_id ? sb.from("profiles").select("full_name,email").eq("id", lead.owner_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const days = Math.floor((Date.now() - new Date(lead.last_activity_at as string).getTime()) / 86400000);
  const next = lead.next_action ? `${lead.next_action}${lead.next_action_date ? ` · ${lead.next_action_date}` : ""}` : "—";
  return {
    author: { name: stageOf(lead.stage as string).label.toUpperCase() },
    title: lead.company as string,
    url: leadUrl(id),
    description: ((lead.summary as string) ?? "").slice(0, 300) || undefined,
    color: lead.stage === "confirmado" ? COLOR.ok : lead.stage === "perdido" ? COLOR.muted : days >= 14 ? COLOR.warn : COLOR.ink,
    fields: [
      { name: "Valor", value: lead.value ? fmtMoney(Number(lead.value), lead.currency as string) : "—", inline: true },
      { name: "Responsable", value: owner ? ((owner.full_name as string) || (owner.email as string)) : "—", inline: true },
      { name: "Actividad", value: `hace ${days} ${days === 1 ? "día" : "días"}`, inline: true },
      { name: "Reuniones", value: String(meetings ?? 0), inline: true },
      { name: "Propuestas", value: String(proposals ?? 0), inline: true },
      { name: "Próxima acción", value: next.slice(0, 200), inline: false },
    ],
  };
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!verifyDiscordRequest(body, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"))) {
    return new NextResponse("Firma inválida", { status: 401 });
  }
  const i = JSON.parse(body) as Interaction;
  if (i.type === 1) return NextResponse.json({ type: 1 }); // PING de verificación

  const guild = process.env.DISCORD_GUILD_ID;
  if (guild && i.guild_id !== guild) return reply("Este bot solo funciona en el Discord de KOSMA.", { ephemeral: true });

  const sb = createAdminClient();
  const user = i.member?.user ?? i.user;
  const who = user?.global_name || user?.username || "Discord";
  const opts = flat(i.data?.options);

  try {
    // Autocompletar el nombre del lead
    if (i.type === 4) {
      const focused = (function find(o: Opt[] | undefined): string {
        for (const x of o ?? []) {
          if (x.focused) return String(x.value ?? "");
          const inner = find(x.options);
          if (inner) return inner;
        }
        return "";
      })(i.data?.options);
      const list = await findLeads(sb, focused);
      return NextResponse.json({
        type: 8,
        data: { choices: list.map((l) => ({ name: `${l.company} · ${stageOf(l.stage).label}`.slice(0, 100), value: l.id })) },
      });
    }

    // Selección del lead para "Guardar en KOSMA Tracker"
    if (i.type === 3 && i.data?.custom_id?.startsWith("save:")) {
      const msgId = i.data.custom_id.slice(5);
      const leadId = i.data.values?.[0];
      const { data: pending } = await sb.from("settings").select("value").eq("key", `discord_pending:${msgId}`).maybeSingle();
      if (!pending || !leadId) return NextResponse.json({ type: 7, data: { content: "Ese mensaje ya no está disponible. Vuelve a intentarlo.", components: [] } });
      const p = pending.value as { body: string };
      const { data: lead } = await sb.from("leads").select("id,company").eq("id", leadId).single();
      await sb.from("notes").insert({ lead_id: leadId, body: p.body });
      await sb.from("settings").delete().eq("key", `discord_pending:${msgId}`);
      return NextResponse.json({ type: 7, data: { content: `Guardado como nota en **${lead?.company ?? "el lead"}**.`, components: [] } });
    }

    if (i.type !== 2) return reply("Acción no reconocida.", { ephemeral: true });
    const name = i.data?.name;

    // Clic derecho en un mensaje → Apps → Guardar en KOSMA Tracker
    if (i.data?.type === 3) {
      const msg = i.data.resolved?.messages?.[i.data.target_id ?? ""];
      if (!msg) return reply("No pude leer ese mensaje.", { ephemeral: true });
      const link = `https://discord.com/channels/${i.guild_id}/${msg.channel_id}/${msg.id}`;
      const files = (msg.attachments ?? []).map((a) => `${a.filename}: ${a.url}`).join("\n");
      const author = msg.author.global_name || msg.author.username;
      const noteBody = `${msg.content || "(mensaje sin texto)"}${files ? `\n\n${files}` : ""}\n\nDiscord · ${author} · guardado por ${who}\n${link}`;

      const { data: all } = await sb.from("leads").select("id,company,stage").order("last_activity_at", { ascending: false });
      const leads = (all ?? []) as { id: string; company: string; stage: string }[];
      const text = norm(msg.content ?? "");
      const hits = leads.filter((l) => {
        const c = coreName(l.company);
        return c.length >= 3 && new RegExp(`(^|[^a-z0-9])${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(text);
      });
      if (hits.length === 1) {
        await sb.from("notes").insert({ lead_id: hits[0].id, body: noteBody });
        return reply(`Guardado como nota en **${hits[0].company}**.`, { ephemeral: true });
      }
      await sb.from("settings").upsert({ key: `discord_pending:${msg.id}`, value: { body: noteBody } });
      const options = [...hits, ...leads.filter((l) => !hits.includes(l))].slice(0, 25).map((l) => ({
        label: l.company.slice(0, 100), description: stageOf(l.stage).label, value: l.id,
      }));
      return reply("¿En qué lead lo guardo?", {
        ephemeral: true,
        components: [{ type: 1, components: [{ type: 3, custom_id: `save:${msg.id}`, placeholder: "Escoge el lead", options }] }],
      });
    }

    if (name === "lead") {
      const sub = i.data?.options?.[0]?.name;
      if (sub === "ver") {
        const lead = await resolveLead(sb, opts.empresa ?? "");
        if (!lead) return reply(`No encontré un lead con "${opts.empresa}".`, { ephemeral: true });
        return reply("", { embeds: [await leadCard(sb, lead)] });
      }
      if (sub === "nuevo") {
        const company = (opts.empresa ?? "").trim().slice(0, 200);
        if (!company) return reply("Falta el nombre de la empresa.", { ephemeral: true });
        const { data: lead, error } = await sb
          .from("leads")
          .insert({ company, summary: opts.contexto?.slice(0, 4000) ?? null, contact_name: opts.contacto?.slice(0, 200) ?? null, source: "otro", stage: "nuevo", tags: ["discord"] })
          .select("*")
          .single();
        if (error || !lead) throw error ?? new Error("No se pudo crear");
        await sb.from("notes").insert({ lead_id: lead.id, body: `Creado desde Discord por ${who}.` });
        const { data: members } = await sb.from("members").select("email,role");
        const to = (members ?? []).filter((m) => m.role !== "viewer").map((m) => m.email as string);
        await Promise.all([notifyNewLead(to, lead, `${who} (Discord)`), announceNewLead(lead, `${who} (Discord)`)]);
        return reply(`Lead creado: **${company}**${leadUrl(lead.id) ? ` · [abrir ficha](${leadUrl(lead.id)})` : ""}. Asígnale responsable y valor en el tracker.`, { ephemeral: true });
      }
    }

    if (name === "nota") {
      const lead = await resolveLead(sb, opts.empresa ?? "");
      if (!lead) return reply(`No encontré un lead con "${opts.empresa}".`, { ephemeral: true });
      await sb.from("notes").insert({ lead_id: lead.id, body: `${opts.texto}\n\nDiscord · ${who}` });
      return reply(`Nota guardada en **${lead.company}**: ${String(opts.texto).slice(0, 180)}`);
    }

    if (name === "tarea") {
      const lead = await resolveLead(sb, opts.empresa ?? "");
      if (!lead) return reply(`No encontré un lead con "${opts.empresa}".`, { ephemeral: true });
      const due = parseDate(opts.fecha);
      if (opts.fecha && !due) return reply(`No entendí la fecha "${opts.fecha}". Usa AAAA-MM-DD, "mañana" o un día como "viernes".`, { ephemeral: true });
      await sb.from("tasks").insert({ lead_id: lead.id, title: String(opts.que).slice(0, 300), due_date: due });
      return reply(`Tarea en **${lead.company}**: ${String(opts.que).slice(0, 180)}${due ? ` · para el ${due}` : ""}`);
    }

    if (name === "pulso") {
      const pulse = await computePulse(sb, new Date(), { calendar: false });
      return reply("", { embeds: pulseEmbeds(pulse) });
    }

    if (name === "pipeline") {
      const { data } = await sb.from("leads").select("stage,value,currency");
      const rows = (data ?? []) as { stage: string; value: number | null; currency: string }[];
      const fields = STAGES.filter((s) => s.id !== "perdido").map((s) => {
        const ls = rows.filter((r) => r.stage === s.id);
        const sums = new Map<string, number>();
        ls.forEach((r) => r.value && sums.set(r.currency, (sums.get(r.currency) ?? 0) + Number(r.value)));
        const money = [...sums.entries()].map(([c, v]) => fmtMoney(v, c)).join(" · ");
        return { name: s.label, value: `${ls.length} ${ls.length === 1 ? "lead" : "leads"}${money ? `\n${money}` : ""}`, inline: true };
      });
      const weighted = new Map<string, number>();
      rows.filter((r) => OPEN_STAGES.includes(r.stage as never) && r.value).forEach((r) => weighted.set(r.currency, (weighted.get(r.currency) ?? 0) + Number(r.value) * (STAGE_PROB[r.stage] ?? 0)));
      return reply("", {
        embeds: [{
          author: { name: "PIPELINE KOSMA" },
          title: [...weighted.entries()].map(([c, v]) => `Ponderado ${fmtMoney(v, c)}`).join(" · ") || "Pipeline",
          color: COLOR.ink,
          fields,
        }],
      });
    }

    return reply("Comando no reconocido.", { ephemeral: true });
  } catch (e) {
    console.error("[discord] interacción", e);
    return reply("Algo falló guardando en el tracker. Intenta de nuevo o hazlo desde la app.", { ephemeral: true });
  }
}
