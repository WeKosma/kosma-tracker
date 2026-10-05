import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Conexión con la cuenta de Google de KOSMA (hello@wearekosma.com).
 * Un admin la conecta una vez desde el tracker (OAuth). El refresh token
 * queda guardado en la tabla `integrations`, que solo el servidor puede leer.
 */

const PROVIDER = "google";
const TZ = "America/Bogota";
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/gmail.send",
];

export const googleConfigured = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SUPABASE_SECRET_KEY);

export function redirectUri(origin: string) {
  const base = (process.env.APP_URL || origin).replace(/\/$/, "") + (process.env.NEXT_PUBLIC_BASE_PATH || "");
  return `${base}/api/google/callback`;
}

export function authUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    login_hint: process.env.GOOGLE_ACCOUNT_HINT || "hello@wearekosma.com",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string };

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      ...body,
    }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google: ${json.error_description || json.error || res.status}`);
  return json;
}

export async function exchangeCode(code: string, origin: string, userId: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  if (!t.refresh_token) throw new Error("Google no devolvió refresh token. Quita el acceso de la app en tu cuenta de Google y vuelve a conectar.");
  const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${t.access_token}` },
  }).then((r) => r.json());
  const { error } = await createAdminClient().from("integrations").upsert({
    provider: PROVIDER,
    account_email: info.email ?? null,
    refresh_token: t.refresh_token,
    access_token: t.access_token,
    expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    scopes: t.scope ?? GOOGLE_SCOPES.join(" "),
    connected_by: userId,
    connected_at: new Date().toISOString(),
  });
  if (error) throw error;
  return info.email as string | undefined;
}

export async function googleStatus(): Promise<{ configured: boolean; connected: boolean; email?: string | null }> {
  if (!googleConfigured()) return { configured: false, connected: false };
  const { data } = await createAdminClient().from("integrations").select("account_email").eq("provider", PROVIDER).maybeSingle();
  return { configured: true, connected: Boolean(data), email: data?.account_email };
}

export async function disconnectGoogle() {
  const admin = createAdminClient();
  const { data } = await admin.from("integrations").select("refresh_token").eq("provider", PROVIDER).maybeSingle();
  if (data?.refresh_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token)}`, { method: "POST" }).catch(() => {});
  }
  await admin.from("integrations").delete().eq("provider", PROVIDER);
}

/** Token de acceso vigente (lo renueva solo si expiró). null si no hay cuenta conectada. */
async function accessToken(): Promise<string | null> {
  if (!googleConfigured()) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("integrations").select("*").eq("provider", PROVIDER).maybeSingle();
  if (!data?.refresh_token) return null;
  if (data.access_token && data.expires_at && new Date(data.expires_at).getTime() > Date.now()) return data.access_token;
  const t = await tokenRequest({ refresh_token: data.refresh_token, grant_type: "refresh_token" });
  await admin
    .from("integrations")
    .update({ access_token: t.access_token, expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString() })
    .eq("provider", PROVIDER);
  return t.access_token;
}

async function gapi<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  if (!token) throw new Error("Google no está conectado");
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 204 || res.status === 410) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Calendar: ${json?.error?.message || res.status}`);
  return json as T;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email: string; responseStatus?: string; self?: boolean; organizer?: boolean }[];
  extendedProperties?: { private?: Record<string, string> };
};

export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  location: string | null;
  meetUrl: string | null;
  htmlLink: string | null;
  attendees: string[];
  description: string | null;
};

function mapEvent(e: GEvent): CalendarEvent {
  const allDay = !e.start?.dateTime;
  return {
    id: e.id,
    title: e.summary || "(Sin título)",
    start: e.start?.dateTime ?? `${e.start?.date}T05:00:00Z`,
    end: e.end?.dateTime ?? null,
    allDay,
    location: e.location ?? null,
    meetUrl: e.hangoutLink ?? null,
    htmlLink: e.htmlLink ?? null,
    attendees: (e.attendees ?? []).filter((a) => !a.self).map((a) => a.email.toLowerCase()),
    description: e.description ?? null,
  };
}

/** Eventos del calendario conectado. Nunca lanza: si falla, devuelve error para mostrarlo. */
export async function listEvents(fromISO: string, toISO: string): Promise<{ events: CalendarEvent[]; error?: string }> {
  try {
    const token = await accessToken();
    if (!token) return { events: [] };
    const p = new URLSearchParams({ timeMin: fromISO, timeMax: toISO, singleEvents: "true", orderBy: "startTime", maxResults: "250" });
    const data = await gapi<{ items: GEvent[] }>(`${CAL}?${p}`);
    return { events: (data.items ?? []).filter((e) => e.status !== "cancelled").map(mapEvent) };
  } catch (e) {
    return { events: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function getEvent(id: string) {
  return mapEvent(await gapi<GEvent>(`${CAL}/${encodeURIComponent(id)}`));
}

type MeetingForCal = {
  id: string;
  lead_id: string;
  title: string;
  starts_at: string;
  duration_min: number | null;
  location: string | null;
  summary: string | null;
  invitees: string | null;
};

function eventBody(m: MeetingForCal, company: string, withMeet: boolean, appLink?: string) {
  const start = new Date(m.starts_at);
  const end = new Date(start.getTime() + (m.duration_min ?? 45) * 60000);
  const emails = (m.invitees ?? "")
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  const body: Record<string, unknown> = {
    summary: `${company} · ${m.title}`,
    description: [m.summary, appLink ? `Ficha en KOSMA Tracker: ${appLink}` : null].filter(Boolean).join("\n\n"),
    location: m.location && !/meet\.google\.com/.test(m.location) ? m.location : undefined,
    start: { dateTime: start.toISOString(), timeZone: TZ },
    end: { dateTime: end.toISOString(), timeZone: TZ },
    attendees: [...new Set(emails)].map((email) => ({ email })),
    extendedProperties: { private: { kosma_meeting_id: m.id, kosma_lead_id: m.lead_id } },
    reminders: { useDefault: true },
  };
  if (withMeet) {
    body.conferenceData = {
      createRequest: { requestId: `kosma-${m.id}-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } },
    };
  }
  return body;
}

export async function createEvent(m: MeetingForCal, company: string, opts: { meet: boolean; notify: boolean; appLink?: string }) {
  const p = new URLSearchParams({ conferenceDataVersion: "1", sendUpdates: opts.notify ? "all" : "none" });
  const e = await gapi<GEvent>(`${CAL}?${p}`, { method: "POST", body: JSON.stringify(eventBody(m, company, opts.meet, opts.appLink)) });
  return { id: e.id, meetUrl: e.hangoutLink ?? null };
}

export async function updateEvent(eventId: string, m: MeetingForCal, company: string, opts: { meet: boolean; notify: boolean; appLink?: string }) {
  const p = new URLSearchParams({ conferenceDataVersion: "1", sendUpdates: opts.notify ? "all" : "none" });
  const body = eventBody(m, company, false, opts.appLink);
  if (opts.meet) {
    // Solo pedir Meet nuevo si el evento todavía no tiene
    const current = await gapi<GEvent>(`${CAL}/${encodeURIComponent(eventId)}`);
    if (!current.hangoutLink) body.conferenceData = eventBody(m, company, true).conferenceData;
  }
  const e = await gapi<GEvent>(`${CAL}/${encodeURIComponent(eventId)}?${p}`, { method: "PATCH", body: JSON.stringify(body) });
  return { id: e.id, meetUrl: e.hangoutLink ?? null };
}

export async function deleteEvent(eventId: string, notify: boolean) {
  const p = new URLSearchParams({ sendUpdates: notify ? "all" : "none" });
  await gapi(`${CAL}/${encodeURIComponent(eventId)}?${p}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Gmail (enviar notificaciones desde hello@ sin contraseña de aplicación)
// ---------------------------------------------------------------------------

export async function gmailSend(rawMime: Buffer) {
  const raw = rawMime.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await gapi("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw }),
  });
}

export async function canSendWithGmailApi() {
  try {
    const s = await googleStatus();
    return s.connected;
  } catch {
    return false;
  }
}
