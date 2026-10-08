import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl } from "@/lib/mail";
import type { WaContact, WaEvent } from "@/lib/content";

/**
 * Avisos por WhatsApp con CallMeBot (gratis, para uso interno).
 * Cada persona activa el bot una vez desde su WhatsApp y recibe su propia apikey.
 * Los contactos viven en integrations (provider 'whatsapp'), que solo lee el servidor.
 */

/** Contactos sugeridos la primera vez (Juan Pablo aprueba; Sebastián recibe cambios y aprobaciones). */
export const DEFAULT_CONTACTS: WaContact[] = [
  { name: "Juan Pablo", phone: "+573216444807", apikey: "", events: ["revision", "comentario"] },
  { name: "Sebastián", phone: "+573155066479", apikey: "", events: ["cambios", "aprobado", "publicado"] },
];

export const cleanPhone = (p: string) => {
  const d = p.replace(/[^\d]/g, "");
  if (!d) return "";
  return `+${d.length === 10 ? `57${d}` : d}`; // 10 dígitos = celular colombiano sin indicativo
};

export async function waContacts(): Promise<{ contacts: WaContact[]; saved: boolean }> {
  const { data } = await createAdminClient().from("integrations").select("config").eq("provider", "whatsapp").maybeSingle();
  const list = (data?.config as { contacts?: WaContact[] } | null)?.contacts;
  return list ? { contacts: list, saved: true } : { contacts: DEFAULT_CONTACTS, saved: false };
}

/** La apikey nunca vuelve completa al navegador: se muestra enmascarada. */
export const maskKey = (k: string) => (k ? `••••${k.slice(-3)}` : "");

/** Si la apikey viene enmascarada, usa la guardada para ese número. */
export async function resolveKeys<T extends Pick<WaContact, "phone" | "apikey">>(list: T[]): Promise<T[]> {
  if (!list.some((c) => c.apikey.startsWith("••••"))) return list;
  const { contacts } = await waContacts();
  return list.map((c) => (c.apikey.startsWith("••••") ? { ...c, apikey: contacts.find((x) => cleanPhone(x.phone) === cleanPhone(c.phone))?.apikey ?? "" } : c));
}

export async function saveWaContacts(contacts: WaContact[], by: string) {
  const clean = (await resolveKeys(contacts))
    .map((c) => ({
      name: c.name.trim().slice(0, 60),
      phone: cleanPhone(c.phone),
      apikey: c.apikey.trim().slice(0, 40),
      events: [...new Set(c.events)],
      user_id: c.user_id || null,
    }))
    .filter((c) => c.phone);
  const { error } = await createAdminClient().from("integrations").upsert({
    provider: "whatsapp",
    config: { contacts: clean },
    connected_by: by,
    connected_at: new Date().toISOString(),
  });
  if (error) throw new Error(/column .*config/i.test(error.message) ? "Falta correr el SQL 0005 en Supabase." : error.message);
  return clean;
}

/** Envía un WhatsApp. Devuelve el motivo si falla; nunca lanza. */
export async function sendWhatsApp(c: Pick<WaContact, "phone" | "apikey">, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!c.apikey) return { ok: false, error: "Falta la apikey de CallMeBot" };
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(cleanPhone(c.phone))}&text=${encodeURIComponent(text.slice(0, 1500))}&apikey=${encodeURIComponent(c.apikey)}`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const body = (await res.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (res.ok && !/invalid|error|not\s+(allowed|activated)/i.test(body)) return { ok: true };
    console.error("[whatsapp]", res.status, body.slice(0, 200));
    return { ok: false, error: /apikey/i.test(body) ? "La apikey no es válida para ese número" : `CallMeBot respondió ${res.status}` };
  } catch (e) {
    console.error("[whatsapp]", e);
    return { ok: false, error: "CallMeBot no respondió" };
  }
}

/** Avisa a los contactos suscritos a ese evento (menos a quien hizo la acción). */
export async function notifyWhatsApp(event: WaEvent, text: string, actorId?: string | null) {
  try {
    const { contacts, saved } = await waContacts();
    if (!saved) return;
    const to = contacts.filter((c) => c.apikey && c.events.includes(event) && (!actorId || c.user_id !== actorId));
    await Promise.all(to.map((c) => sendWhatsApp(c, text)));
  } catch (e) {
    console.error("[whatsapp] notify", e);
  }
}

// ---------------------------------------------------------------------------
// Textos de la parrilla
// ---------------------------------------------------------------------------

const whenText = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(iso));

const monthOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(iso)).slice(0, 7);

export const postLink = (post: { id: string; publish_at: string }) => {
  const base = appUrl();
  return base.startsWith("http") ? `${base}/contenido?m=${monthOf(post.publish_at)}&p=${post.id}` : "";
};

export function contentMessage(
  event: WaEvent,
  post: { id: string; title: string; publish_at: string },
  by: string,
  extra: { text?: string | null; url?: string | null; count?: number } = {}
) {
  const first = by.split(" ")[0];
  const link = extra.url ?? postLink(post);
  const quote = extra.text ? `"${extra.text.trim().slice(0, 500)}"` : "";
  switch (event) {
    case "revision":
      return [`*KOSMA · Arte para aprobar*`, post.title, `Sale: ${whenText(post.publish_at)}`, `Subió: ${first}`, "", `Revisar y aprobar: ${link}`].join("\n");
    case "cambios":
      return [`*KOSMA · Cambios pedidos*`, post.title, `${first} pidió:`, quote, "", `Ver: ${link}`].join("\n");
    case "aprobado":
      return [`*KOSMA · Aprobado*`, post.title, `Aprobó: ${first}`, `Sale: ${whenText(post.publish_at)}`, "", `Listo para publicar: ${link}`].join("\n");
    case "comentario":
      return [`*KOSMA · Comentario*`, post.title, `${first}: ${quote}`, "", `Ver: ${link}`].join("\n");
    case "publicado":
      return [`*KOSMA · Publicado en Instagram*`, post.title, `Por: ${first}`, "", link].join("\n");
  }
}

export function batchMessage(count: number, firstPost: { id: string; publish_at: string }, by: string) {
  const base = appUrl();
  const link = base.startsWith("http") ? `${base}/contenido?m=${monthOf(firstPost.publish_at)}` : "";
  return [`*KOSMA · ${count} artes para aprobar*`, `Subió: ${by.split(" ")[0]}`, "", `Revisar la parrilla: ${link}`].join("\n");
}
