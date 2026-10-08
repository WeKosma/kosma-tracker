import "server-only";
import { createPublicKey, verify } from "node:crypto";
import { appUrl } from "@/lib/mail";
import { stageOf } from "@/lib/constants";

/**
 * Conexión con el Discord de KOSMA.
 * 1) Avisos del tracker a un canal (webhook): leads, etapas, propuestas, reuniones, cierres y el Pulso.
 * 2) Bot con comandos (/lead, /nota, /tarea, /pulso, /pipeline) y "Guardar en KOSMA Tracker" sobre mensajes.
 * 3) Escucha: cada hora lee los canales configurados y guarda en la ficha los mensajes que nombran un lead.
 */

const API = "https://discord.com/api/v10";

// Paleta de marca para los embeds
export const COLOR = { ink: 0xf3f3ef, ok: 0x8fc49f, warn: 0xd6b46a, danger: 0xe08a7b, muted: 0x5f5f5b };

export type Embed = {
  title?: string;
  url?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
  author?: { name: string };
  image?: { url: string };
};

export const discordConfig = () => ({
  webhook: Boolean(process.env.DISCORD_WEBHOOK_URL),
  appId: process.env.DISCORD_APPLICATION_ID ?? "",
  publicKey: Boolean(process.env.DISCORD_PUBLIC_KEY),
  bot: Boolean(process.env.DISCORD_BOT_TOKEN),
  guild: process.env.DISCORD_GUILD_ID ?? "",
  listen: (process.env.DISCORD_LISTEN_CHANNELS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
});

const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export const leadUrl = (id: string) => {
  const base = appUrl();
  return base.startsWith("http") ? `${base}/leads/${id}` : undefined;
};

/** Discord rechaza el mensaje entero si un link del embed no es http(s). */
export const safeEmbed = (e: Embed): Embed => ({
  ...e,
  url: e.url && /^https?:\/\//.test(e.url) ? e.url : undefined,
  image: e.image && /^https?:\/\//.test(e.image.url) ? e.image : undefined,
});

/** Publica en el canal del webhook. Nunca lanza: si Discord falla, el tracker sigue. */
export async function postToDiscord(payload: { content?: string; embeds?: Embed[] }) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return { sent: false };
  payload = { ...payload, embeds: payload.embeds?.map(safeEmbed) };
  try {
    const res = await fetch(`${url}?wait=false`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "KOSMA Tracker", allowed_mentions: { parse: [] }, ...payload }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("[discord] webhook", res.status, await res.text().catch(() => ""));
    return { sent: res.ok };
  } catch (e) {
    console.error("[discord] webhook", e);
    return { sent: false };
  }
}

/** Llamada a la API de Discord con el token del bot. */
export async function discordApi<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Falta DISCORD_BOT_TOKEN en Netlify.");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(json as { message?: string }).message ?? "error"}`);
  return json as T;
}

/** Verifica la firma Ed25519 de las interacciones que manda Discord. */
export function verifyDiscordRequest(body: string, signature: string | null, timestamp: string | null) {
  const key = process.env.DISCORD_PUBLIC_KEY;
  if (!key || !signature || !timestamp) return false;
  try {
    const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(key, "hex")]);
    const pub = createPublicKey({ key: spki, format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + body), pub, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Avisos del tracker
// ---------------------------------------------------------------------------

type L = { id: string; company: string; stage?: string | null; value?: number | null; currency?: string | null; contact_name?: string | null; summary?: string | null; lost_reason?: string | null };

const money = (v?: number | null, c?: string | null) =>
  v == null ? null : new Intl.NumberFormat("es-CO", { style: "currency", currency: c || "COP", maximumFractionDigits: 0 }).format(Number(v));

export function announceNewLead(lead: L, by: string) {
  const fields = [
    lead.contact_name ? { name: "Contacto", value: clip(lead.contact_name, 100), inline: true } : null,
    money(lead.value, lead.currency) ? { name: "Valor", value: money(lead.value, lead.currency)!, inline: true } : null,
    { name: "Registrado por", value: by, inline: true },
  ].filter(Boolean) as Embed["fields"];
  return postToDiscord({
    embeds: [{ author: { name: "NUEVO LEAD" }, title: lead.company, url: leadUrl(lead.id), description: clip(lead.summary, 300) || undefined, color: COLOR.ink, fields }],
  });
}

export function announceStage(lead: L, from: string | null | undefined, to: string, by: string) {
  if (to === "confirmado") {
    return postToDiscord({
      content: `**${lead.company} está confirmado.** A celebrar, equipo.`,
      embeds: [{
        author: { name: "CIERRE" }, title: lead.company, url: leadUrl(lead.id), color: COLOR.ok,
        fields: [
          money(lead.value, lead.currency) ? { name: "Valor", value: money(lead.value, lead.currency)!, inline: true } : null,
          { name: "Confirmado por", value: by, inline: true },
        ].filter(Boolean) as Embed["fields"],
      }],
    });
  }
  return postToDiscord({
    embeds: [{
      author: { name: to === "perdido" ? "LEAD PERDIDO" : "CAMBIO DE ETAPA" },
      title: lead.company,
      url: leadUrl(lead.id),
      description: `${from ? stageOf(from).label : "—"}  →  **${stageOf(to).label}**${to === "perdido" && lead.lost_reason ? `\n${clip(lead.lost_reason, 200)}` : ""}`,
      color: to === "perdido" ? COLOR.muted : COLOR.ink,
      footer: { text: by },
    }],
  });
}

export function announceProposal(
  lead: { id: string; company: string },
  p: { title?: string | null; kind?: string | null; status?: string | null; amount?: number | null; currency?: string | null; url?: string | null },
  by: string
) {
  const sent = p.status === "enviada";
  return postToDiscord({
    embeds: [{
      author: { name: sent ? "PROPUESTA ENVIADA" : `NUEVA ${String(p.kind ?? "propuesta").toUpperCase()}` },
      title: `${lead.company} · ${clip(p.title, 120)}`,
      url: p.url || leadUrl(lead.id),
      color: sent ? COLOR.warn : COLOR.ink,
      fields: [
        money(p.amount, p.currency) ? { name: "Monto", value: money(p.amount, p.currency)!, inline: true } : null,
        { name: "Por", value: by, inline: true },
        leadUrl(lead.id) ? { name: "Ficha", value: `[Abrir en el tracker](${leadUrl(lead.id)})`, inline: true } : null,
      ].filter(Boolean) as Embed["fields"],
    }],
  });
}

export function announceMeeting(
  lead: { id: string; company: string },
  m: { title?: string | null; starts_at?: string | null; meet_url?: string | null },
  by: string
) {
  const when = m.starts_at
    ? new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(m.starts_at))
    : "—";
  return postToDiscord({
    embeds: [{
      author: { name: "REUNIÓN AGENDADA" },
      title: `${lead.company} · ${clip(m.title, 120)}`,
      url: leadUrl(lead.id),
      color: COLOR.ink,
      fields: [
        { name: "Cuándo", value: when, inline: true },
        { name: "Por", value: by, inline: true },
        m.meet_url ? { name: "Meet", value: m.meet_url, inline: false } : null,
      ].filter(Boolean) as Embed["fields"],
    }],
  });
}

// ---------------------------------------------------------------------------
// Comandos del bot
// ---------------------------------------------------------------------------

const empresa = (required = true) => ({ type: 3, name: "empresa", description: "Nombre del lead", required, autocomplete: true });

export const COMMANDS = [
  {
    name: "lead",
    description: "Leads del tracker de KOSMA",
    options: [
      { type: 1, name: "ver", description: "Ficha resumida de un lead", options: [empresa()] },
      {
        type: 1, name: "nuevo", description: "Crear un lead nuevo",
        options: [
          { type: 3, name: "empresa", description: "Nombre de la empresa", required: true },
          { type: 3, name: "contexto", description: "Qué necesitan / de dónde viene", required: false },
          { type: 3, name: "contacto", description: "Persona de contacto", required: false },
        ],
      },
    ],
  },
  {
    name: "nota", description: "Agregar una nota a un lead",
    options: [empresa(), { type: 3, name: "texto", description: "La nota", required: true }],
  },
  {
    name: "tarea", description: "Crear una tarea en un lead",
    options: [
      empresa(),
      { type: 3, name: "que", description: "Qué hay que hacer", required: true },
      { type: 3, name: "fecha", description: "Fecha límite (AAAA-MM-DD o 'mañana', 'viernes')", required: false },
    ],
  },
  { name: "pulso", description: "Resumen de la semana del pipeline" },
  { name: "pipeline", description: "Cómo va el pipeline ahora mismo" },
  { type: 3, name: "Guardar en KOSMA Tracker" },
];

export async function registerCommands() {
  const { appId, guild } = discordConfig();
  if (!appId || !guild) throw new Error("Faltan DISCORD_APPLICATION_ID o DISCORD_GUILD_ID en Netlify.");
  return discordApi<unknown[]>(`/applications/${appId}/guilds/${guild}/commands`, { method: "PUT", body: JSON.stringify(COMMANDS) });
}

// ---------------------------------------------------------------------------
// Parrilla de contenido
// ---------------------------------------------------------------------------

export function announceContent(
  kind: "revision" | "cambios" | "aprobado",
  post: { title: string; brand: string; publish_at: string },
  by: string,
  extra: { image?: string | null; feedback?: string | null } = {}
) {
  const when = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(post.publish_at));
  const base = appUrl();
  const head = { revision: "ARTE PARA APROBAR", cambios: "CAMBIOS PEDIDOS", aprobado: "APROBADO" }[kind];
  return postToDiscord({
    embeds: [{
      author: { name: `${head} · ${post.brand.toUpperCase()}` },
      title: clip(post.title, 200),
      url: base.startsWith("http") ? `${base}/contenido` : undefined,
      description: kind === "cambios" && extra.feedback ? clip(extra.feedback, 600) : undefined,
      color: kind === "aprobado" ? COLOR.ok : kind === "cambios" ? COLOR.danger : COLOR.warn,
      fields: [{ name: "Publicación", value: when, inline: true }, { name: "Por", value: by, inline: true }],
      image: extra.image ? { url: extra.image } : undefined,
    }],
  });
}
