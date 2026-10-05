import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OPEN_STAGES, STAGE_PROB, stageOf } from "@/lib/constants";
import { googleStatus, listEvents } from "@/lib/google";
import { appUrl, brandHeader } from "@/lib/mail";
import { compactMoney } from "@/lib/format";
import { COLOR, type Embed } from "@/lib/discord";

/**
 * Pulso semanal del pipeline (para el Kosma Weekly): qué se movió, qué se cerró,
 * qué se enfrió, qué viene y cuánto pesa el pipeline. Se calcula con el cliente
 * que le pasen (sesión del usuario en la app, o llave de servidor en el envío automático).
 */

const DAY = 86400000;
const TZ = "America/Bogota";
const COOL_DAYS = 14;

type LeadRow = {
  id: string; company: string; stage: string; value: number | null; currency: string; owner_id: string | null;
  created_at: string; confirmed_at: string | null; last_activity_at: string; next_action: string | null; next_action_date: string | null;
};

export type Pulse = {
  from: string;
  to: string;
  totals: { currency: string; open: number; weighted: number; count: number }[];
  openCount: number;
  newLeads: { id: string; company: string; owner: string }[];
  moves: { id: string; company: string; from: string; to: string; by: string; at: string }[];
  won: { id: string; company: string; value: number | null; currency: string }[];
  lost: { id: string; company: string }[];
  proposals: { leadId: string; company: string; title: string; status: string; amount: number | null; currency: string }[];
  meetingsDone: number;
  upcoming: { at: string; title: string; company: string | null; leadId: string | null; meetUrl: string | null }[];
  cooling: { id: string; company: string; stage: string; days: number; owner: string; next: string | null }[];
  overdue: { title: string; company: string | null; leadId: string | null; due: string; owner: string }[];
};

const name = (team: Map<string, string>, id: string | null | undefined) => (id ? team.get(id) ?? "—" : "—");

export async function computePulse(sb: SupabaseClient, now = new Date(), opts: { calendar?: boolean } = {}): Promise<Pulse> {
  const to = now.toISOString();
  const from = new Date(now.getTime() - 7 * DAY).toISOString();
  const next7 = new Date(now.getTime() + 7 * DAY).toISOString();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);

  const [leadsQ, profilesQ, movesQ, propsQ, doneQ, upQ, tasksQ] = await Promise.all([
    sb.from("leads").select("id,company,stage,value,currency,owner_id,created_at,confirmed_at,last_activity_at,next_action,next_action_date"),
    sb.from("profiles").select("id,full_name,email"),
    sb.from("activity").select("lead_id,actor_id,meta,created_at").eq("kind", "stage").gte("created_at", from).order("created_at"),
    sb.from("proposals").select("lead_id,title,status,amount,currency,created_at,sent_at").or(`created_at.gte."${from}",sent_at.gte."${from.slice(0, 10)}"`),
    sb.from("meetings").select("id", { count: "exact", head: true }).gte("starts_at", from).lte("starts_at", to),
    sb.from("meetings").select("lead_id,title,starts_at,meet_url,gcal_event_id").gte("starts_at", to).lte("starts_at", next7).order("starts_at"),
    sb.from("tasks").select("title,lead_id,due_date,assignee_id").eq("done", false).lt("due_date", today).order("due_date"),
  ]);

  const leads = (leadsQ.data ?? []) as LeadRow[];
  const byId = new Map(leads.map((l) => [l.id, l]));
  const team = new Map((profilesQ.data ?? []).map((p) => [p.id as string, ((p.full_name as string) || (p.email as string)).split(/[ @]/)[0]]));

  // Pipeline abierto, por moneda (total y ponderado por probabilidad de etapa)
  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage as never));
  const tot = new Map<string, { open: number; weighted: number; count: number }>();
  for (const l of open) {
    const t = tot.get(l.currency) ?? { open: 0, weighted: 0, count: 0 };
    t.count += 1;
    if (l.value) {
      t.open += Number(l.value);
      t.weighted += Number(l.value) * (STAGE_PROB[l.stage] ?? 0);
    }
    tot.set(l.currency, t);
  }

  const moves = (movesQ.data ?? [])
    .filter((a) => byId.has(a.lead_id as string))
    .map((a) => {
      const m = a.meta as { from?: string; to?: string };
      return { id: a.lead_id as string, company: byId.get(a.lead_id as string)!.company, from: m.from ?? "", to: m.to ?? "", by: name(team, a.actor_id as string), at: a.created_at as string };
    });

  // Próximas reuniones: las del tracker + las del Calendar (sin repetir las vinculadas)
  const upcoming: Pulse["upcoming"] = (upQ.data ?? []).map((m) => ({
    at: m.starts_at as string, title: m.title as string, company: byId.get(m.lead_id as string)?.company ?? null, leadId: m.lead_id as string, meetUrl: (m.meet_url as string) ?? null,
  }));
  try {
    const linked = new Set((upQ.data ?? []).map((m) => m.gcal_event_id).filter(Boolean));
    const status = opts.calendar === false ? { connected: false } : await googleStatus();
    if (status.connected) {
      const cal = await Promise.race([listEvents(to, next7), new Promise<{ events: [] }>((r) => setTimeout(() => r({ events: [] }), 2500))]);
      for (const e of cal.events) if (!linked.has(e.id) && !e.allDay) upcoming.push({ at: e.start, title: e.title, company: null, leadId: null, meetUrl: e.meetUrl });
    }
  } catch {}
  upcoming.sort((a, b) => a.at.localeCompare(b.at));

  return {
    from,
    to,
    totals: [...tot.entries()].map(([currency, t]) => ({ currency, ...t })).sort((a, b) => b.open - a.open),
    openCount: open.length,
    newLeads: leads.filter((l) => l.created_at >= from).map((l) => ({ id: l.id, company: l.company, owner: name(team, l.owner_id) })),
    moves,
    won: leads.filter((l) => l.confirmed_at && l.confirmed_at >= from).map((l) => ({ id: l.id, company: l.company, value: l.value, currency: l.currency })),
    lost: moves.filter((m) => m.to === "perdido").map((m) => ({ id: m.id, company: m.company })),
    proposals: (propsQ.data ?? [])
      .filter((p) => byId.has(p.lead_id as string))
      .map((p) => ({ leadId: p.lead_id as string, company: byId.get(p.lead_id as string)!.company, title: p.title as string, status: p.status as string, amount: p.amount as number | null, currency: p.currency as string })),
    meetingsDone: doneQ.count ?? 0,
    upcoming: upcoming.slice(0, 12),
    cooling: open
      .map((l) => ({ l, days: Math.floor((now.getTime() - new Date(l.last_activity_at).getTime()) / DAY) }))
      .filter((x) => x.days >= COOL_DAYS)
      .sort((a, b) => b.days - a.days)
      .map(({ l, days }) => ({ id: l.id, company: l.company, stage: l.stage, days, owner: name(team, l.owner_id), next: l.next_action })),
    overdue: (tasksQ.data ?? []).map((t) => ({
      title: t.title as string, company: t.lead_id ? byId.get(t.lead_id as string)?.company ?? null : null, leadId: (t.lead_id as string) ?? null, due: t.due_date as string, owner: name(team, t.assignee_id as string),
    })),
  };
}

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------

export const fmtMoney = (v: number, c: string) =>
  v >= 1_000_000 ? compactMoney(v, c) : new Intl.NumberFormat("es-CO", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(v);
const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(iso));
const fmtRange = (p: Pulse) => {
  const f = (iso: string) => new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso));
  return `${f(p.from)} al ${f(p.to)}`;
};

/** Frase de arranque con lo más importante de la semana. */
export function headline(p: Pulse) {
  const parts: string[] = [];
  if (p.won.length) parts.push(`${p.won.length} ${p.won.length === 1 ? "cierre" : "cierres"}`);
  if (p.newLeads.length) parts.push(`${p.newLeads.length} ${p.newLeads.length === 1 ? "lead nuevo" : "leads nuevos"}`);
  if (p.moves.length) parts.push(`${p.moves.length} ${p.moves.length === 1 ? "movimiento" : "movimientos"} de etapa`);
  if (p.proposals.length) parts.push(`${p.proposals.length} ${p.proposals.length === 1 ? "propuesta" : "propuestas"}`);
  if (p.meetingsDone) parts.push(`${p.meetingsDone} ${p.meetingsDone === 1 ? "reunión" : "reuniones"}`);
  const base = parts.length ? parts.join(", ") : "Semana quieta en el pipeline";
  return p.cooling.length ? `${base}. ${p.cooling.length} ${p.cooling.length === 1 ? "lead se está enfriando" : "leads se están enfriando"}.` : `${base}.`;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function pulseEmail(p: Pulse) {
  const base = appUrl();
  const link = (id: string | null, text: string) => (id && base ? `<a href="${esc(`${base}/leads/${id}`)}" style="color:#050505">${esc(text)}</a>` : esc(text));
  const section = (title: string, items: string[], empty?: string) =>
    !items.length && !empty
      ? ""
      : `<tr><td style="padding:22px 28px 0">
          <div style="font:500 11px/1 Menlo,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:#7a7a75">${esc(title)}</div>
          ${items.length
            ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px">${items.map((i) => `<tr><td style="padding:9px 0;border-top:1px solid #e3e3de;font:400 14px/1.5 Helvetica,Arial,sans-serif;color:#0b0b0b">${i}</td></tr>`).join("")}</table>`
            : `<div style="margin-top:8px;font:400 13px/1.5 Helvetica,Arial,sans-serif;color:#9b9b96">${esc(empty)}</div>`}
        </td></tr>`;
  const mute = (s: string) => `<span style="color:#7a7a75">${s}</span>`;

  const kpis = [
    ...p.totals.filter((t) => t.open > 0).map((t) => [`Pipeline ${t.currency}`, fmtMoney(t.open, t.currency), `ponderado ${fmtMoney(t.weighted, t.currency)}`]),
    ["Leads abiertos", String(p.openCount), `${p.cooling.length} enfriándose`],
  ];

  const html = `<!doctype html><html><body style="margin:0;background:#eeeeea;padding:32px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #dcdcd6">
    <tr><td style="padding:22px 28px;background:#050505">${brandHeader("PULSO SEMANAL")}</td></tr>
    <tr><td style="padding:30px 28px 6px">
      <div style="font:500 11px/1 Menlo,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:#7a7a75">Semana del ${esc(fmtRange(p))}</div>
      <div style="margin-top:12px;font:300 24px/1.25 Helvetica,Arial,sans-serif;color:#050505">${esc(headline(p))}</div>
    </td></tr>
    <tr><td style="padding:18px 28px 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      ${kpis.map(([k, v, s]) => `<td style="padding:14px 12px 14px 0;border-top:2px solid #050505;vertical-align:top">
        <div style="font:500 10px/1 Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;color:#7a7a75">${esc(k)}</div>
        <div style="margin-top:8px;font:300 22px/1 Helvetica,Arial,sans-serif;color:#050505">${esc(v)}</div>
        <div style="margin-top:6px;font:400 11px/1.3 Helvetica,Arial,sans-serif;color:#9b9b96">${esc(s)}</div></td>`).join("")}
    </tr></table></td></tr>
    ${section("Cierres", p.won.map((w) => `<b>${link(w.id, w.company)}</b> ${w.value ? mute(`· ${fmtMoney(Number(w.value), w.currency)}`) : ""}`))}
    ${section("Movimientos", p.moves.map((m) => `${link(m.id, m.company)} ${mute(`· ${stageOf(m.from).label} → `)}<b>${esc(stageOf(m.to).label)}</b> ${mute(`· ${esc(m.by)}`)}`), "Nadie movió etapas esta semana.")}
    ${section("Leads nuevos", p.newLeads.map((l) => `${link(l.id, l.company)} ${mute(`· ${esc(l.owner)}`)}`))}
    ${section("Propuestas", p.proposals.map((x) => `${link(x.leadId, x.company)} ${mute(`· ${esc(x.title)} · ${esc(x.status)}${x.amount ? ` · ${fmtMoney(Number(x.amount), x.currency)}` : ""}`)}`))}
    ${section("Se están enfriando (14+ días sin movimiento)", p.cooling.map((c) => `<b>${link(c.id, c.company)}</b> ${mute(`· ${c.days} días · ${esc(stageOf(c.stage).label)} · ${esc(c.owner)}`)}${c.next ? `<br>${mute(`→ ${esc(c.next)}`)}` : ""}`))}
    ${section("Tareas vencidas", p.overdue.map((t) => `${esc(t.title)} ${mute(`· ${t.company ? esc(t.company) : "General"} · ${esc(t.owner)} · vencía ${esc(t.due)}`)}`))}
    ${section("Esta semana", p.upcoming.map((u) => `${mute(esc(fmtDay(u.at)))} &nbsp;${u.company ? `<b>${link(u.leadId, u.company)}</b> ${mute("·")} ` : ""}${esc(u.title)}`), "Sin reuniones agendadas.")}
    ${base ? `<tr><td style="padding:26px 28px 30px"><a href="${esc(`${base}/pulso`)}" style="display:inline-block;padding:13px 18px;background:#050505;color:#f3f3ef;text-decoration:none;font:600 11px/1 Menlo,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase">Abrir el pulso &nbsp;↗</a></td></tr>` : ""}
    <tr><td style="padding:16px 28px;border-top:1px solid #e3e3de;font:400 11px/1.5 Helvetica,Arial,sans-serif;color:#9b9b96">Pulso automático del tracker de KOSMA, cada lunes a las 7:00. Complejidad, en orden.</td></tr>
  </table></td></tr></table></body></html>`;

  const text = [
    `PULSO SEMANAL KOSMA · ${fmtRange(p)}`,
    headline(p),
    ...p.totals.filter((t) => t.open > 0).map((t) => `Pipeline ${t.currency}: ${fmtMoney(t.open, t.currency)} (ponderado ${fmtMoney(t.weighted, t.currency)})`),
    p.cooling.length ? `Enfriándose: ${p.cooling.map((c) => `${c.company} (${c.days}d)`).join(", ")}` : "",
    base ? `${base}/pulso` : "",
  ].filter(Boolean).join("\n");

  return { subject: `Pulso semanal · ${fmtRange(p)}`, html, text };
}

export function pulseEmbeds(p: Pulse): Embed[] {
  const base = appUrl();
  const ln = (id: string | null, t: string) => (id && base.startsWith("http") ? `[${t}](${base}/leads/${id})` : t);
  const list = (items: string[], max = 8) => {
    if (!items.length) return "—";
    const out = items.slice(0, max).join("\n");
    return (items.length > max ? `${out}\n… y ${items.length - max} más` : out).slice(0, 1020);
  };
  const fields: Embed["fields"] = [
    ...p.totals.filter((t) => t.open > 0).map((t) => ({ name: `Pipeline ${t.currency}`, value: `${fmtMoney(t.open, t.currency)}\nponderado ${fmtMoney(t.weighted, t.currency)}`, inline: true })),
    { name: "Abiertos", value: `${p.openCount} leads`, inline: true },
  ];
  if (p.won.length) fields.push({ name: "Cierres", value: list(p.won.map((w) => `**${ln(w.id, w.company)}**${w.value ? ` · ${fmtMoney(Number(w.value), w.currency)}` : ""}`)) });
  if (p.moves.length) fields.push({ name: "Movimientos", value: list(p.moves.map((m) => `${ln(m.id, m.company)} · ${stageOf(m.from).label} → **${stageOf(m.to).label}**`)) });
  if (p.newLeads.length) fields.push({ name: "Leads nuevos", value: list(p.newLeads.map((l) => `${ln(l.id, l.company)} · ${l.owner}`)) });
  if (p.cooling.length) fields.push({ name: "Se están enfriando", value: list(p.cooling.map((c) => `**${ln(c.id, c.company)}** · ${c.days} días · ${c.owner}`)) });
  if (p.overdue.length) fields.push({ name: "Tareas vencidas", value: list(p.overdue.map((t) => `${t.title} · ${t.company ?? "General"} · ${t.owner}`)) });
  if (p.upcoming.length) fields.push({ name: "Esta semana", value: list(p.upcoming.map((u) => `${fmtDay(u.at)} · ${u.company ? `**${u.company}** · ` : ""}${u.title}`)) });
  return [{
    author: { name: `PULSO SEMANAL · ${fmtRange(p).toUpperCase()}` },
    title: headline(p).slice(0, 250),
    url: base.startsWith("http") ? `${base}/pulso` : undefined,
    color: p.won.length ? COLOR.ok : p.cooling.length > 3 ? COLOR.warn : COLOR.ink,
    fields: fields.slice(0, 25),
  }];
}
