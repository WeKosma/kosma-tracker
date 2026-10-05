"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createEvent, deleteEvent, disconnectGoogle, getEvent, googleStatus, updateEvent } from "@/lib/google";
import { getSession } from "@/lib/session";
import { notifyConfirmed, notifyNewLead } from "@/lib/mail";
import { CURRENCIES, STAGE_IDS } from "@/lib/constants";
import type { ActionResult, Role } from "@/lib/types";
import { profileName } from "@/lib/format";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

async function ctx() {
  const session = await getSession();
  if (!session) throw new Error("Tu sesión expiró. Vuelve a entrar.");
  const supabase = await createClient();
  return { supabase, session };
}

function humanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
  if (/row-level security|permission denied/i.test(msg)) return "No tienes permiso para esto, o la ficha está bloqueada.";
  if (/duplicate key/i.test(msg)) return "Ya existe un registro igual.";
  if (/violates check constraint/i.test(msg)) return "Hay un valor que no es válido.";
  return msg || "Algo salió mal.";
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: humanError(e) };
  }
}

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : undefined;
}

function pick<T extends Record<string, unknown>>(obj: T, keys: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in obj) {
      const v = obj[k];
      out[k] = typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v;
    }
  }
  return out;
}

async function teamEmails(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("members").select("email,role");
  return (data ?? []).filter((m) => m.role !== "viewer").map((m) => m.email as string);
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

const LEAD_FIELDS = [
  "company", "contact_name", "contact_email", "contact_phone", "contact_role", "website", "industry",
  "city", "country", "source", "service", "stage", "priority", "value", "currency", "owner_id", "tags",
  "drive_url", "summary", "next_action", "next_action_date", "lost_reason",
] as const;

function cleanLead(input: Record<string, unknown>) {
  const row = pick(input, LEAD_FIELDS);
  if ("value" in row) {
    const n = row.value == null ? null : Number(String(row.value).replace(/[^\d.-]/g, ""));
    row.value = n == null || Number.isNaN(n) ? null : n;
  }
  if ("stage" in row && !STAGE_IDS.includes(row.stage as never)) throw new Error("Etapa inválida");
  if ("currency" in row && row.currency && !CURRENCIES.includes(row.currency as never)) throw new Error("Moneda inválida");
  if ("tags" in row) {
    const t = row.tags;
    row.tags = Array.isArray(t)
      ? t.map((x) => String(x).trim()).filter(Boolean)
      : String(t ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  }
  if ("company" in row && !row.company) throw new Error("El nombre de la empresa es obligatorio");
  return row;
}

export async function createLead(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, session } = await ctx();
    const row = cleanLead(input);
    if (!row.owner_id) row.owner_id = session.userId;
    const { data, error } = await supabase.from("leads").insert(row).select("*").single();
    if (error) throw error;
    const to = await teamEmails(supabase);
    await notifyNewLead(to, data, profileName(session.profile), await origin());
    if (data.stage === "confirmado") {
      await notifyConfirmed(to, data, profileName(session.profile), { meetings: 0, proposals: 0 }, await origin());
    }
    return { id: data.id as string };
  });
}

export async function updateLead(id: string, patch: Record<string, unknown>): Promise<ActionResult> {
  return run(async () => {
    const { supabase, session } = await ctx();
    const row = cleanLead(patch);
    const { data: before } = await supabase.from("leads").select("stage").eq("id", id).single();
    const { data, error } = await supabase.from("leads").update(row).eq("id", id).select("*");
    if (error) throw error;
    if (!data?.length) throw new Error("No se pudo guardar: la ficha está bloqueada o no tienes permiso.");
    const lead = data[0];
    if (row.stage === "confirmado" && before?.stage !== "confirmado") {
      const [{ count: meetings }, { count: proposals }] = await Promise.all([
        supabase.from("meetings").select("id", { count: "exact", head: true }).eq("lead_id", id),
        supabase.from("proposals").select("id", { count: "exact", head: true }).eq("lead_id", id),
      ]);
      await notifyConfirmed(
        await teamEmails(supabase),
        lead,
        profileName(session.profile),
        { meetings: meetings ?? 0, proposals: proposals ?? 0 },
        await origin()
      );
    }
    return undefined;
  });
}

export async function setLock(id: string, locked: boolean, reason?: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await ctx();
    const { data, error } = await supabase
      .from("leads")
      .update({ locked, lock_reason: locked ? reason?.trim() || null : null })
      .eq("id", id)
      .select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Solo quien la bloqueó (o un admin) puede desbloquearla.");
    return undefined;
  });
}

export async function deleteLead(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, session } = await ctx();
    if (session.role !== "admin") throw new Error("Solo un admin puede eliminar leads.");
    const { data: files } = await supabase.from("files").select("path").eq("lead_id", id);
    const paths = (files ?? []).map((f) => f.path).filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from("tracker").remove(paths);
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) throw error;
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Tablas hijas: contactos, reuniones, propuestas, notas, tareas, archivos
// ---------------------------------------------------------------------------

const CHILD_FIELDS = {
  contacts: ["lead_id", "name", "role", "email", "phone", "linkedin", "notes"],
  meetings: ["lead_id", "title", "kind", "mode", "starts_at", "duration_min", "location", "attendees", "summary", "next_steps", "recording_url", "invitees"],
  proposals: ["lead_id", "title", "kind", "version", "status", "amount", "currency", "sent_at", "url", "file_path", "notes"],
  notes: ["lead_id", "body", "pinned"],
  tasks: ["lead_id", "title", "due_date", "done", "assignee_id"],
  files: ["lead_id", "name", "path", "url", "size_bytes", "mime"],
} as const;

export type ChildTable = keyof typeof CHILD_FIELDS;

export async function saveRow(table: ChildTable, input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    if (!(table in CHILD_FIELDS)) throw new Error("Tabla inválida");
    const { supabase } = await ctx();
    const row = pick(input, CHILD_FIELDS[table]);
    for (const k of ["amount", "duration_min", "version", "size_bytes"]) {
      if (k in row) row[k] = row[k] == null || row[k] === "" ? null : Number(row[k]);
    }
    const id = typeof input.id === "string" ? input.id : null;
    if (id) {
      delete row.lead_id;
      const { data, error } = await supabase.from(table).update(row).eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("No se pudo guardar: la ficha está bloqueada o no tienes permiso.");
      return { id };
    }
    const { data, error } = await supabase.from(table).insert(row).select("id").single();
    if (error) throw error;
    return { id: data.id as string };
  });
}

export async function deleteRow(table: ChildTable, id: string): Promise<ActionResult> {
  return run(async () => {
    if (!(table in CHILD_FIELDS)) throw new Error("Tabla inválida");
    const { supabase } = await ctx();
    if (table === "files") {
      const { data: f } = await supabase.from("files").select("path").eq("id", id).single();
      if (f?.path) await supabase.storage.from("tracker").remove([f.path]);
    }
    const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("No se pudo eliminar: la ficha está bloqueada o no tienes permiso.");
    return undefined;
  });
}

export async function getFileUrl(path: string): Promise<ActionResult<{ url: string }>> {
  try {
    const { supabase } = await ctx();
    const { data, error } = await supabase.storage.from("tracker").createSignedUrl(path, 60 * 10);
    if (error) throw error;
    return { ok: true, data: { url: data.signedUrl } };
  } catch (e) {
    return { ok: false, error: humanError(e) };
  }
}

// ---------------------------------------------------------------------------
// Equipo y cuenta
// ---------------------------------------------------------------------------

function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return "K-" + Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function findAuthUser(email: string) {
  const admin = createAdminClient();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Agrega a alguien al equipo y, si hay llave secreta, le crea el acceso con clave temporal. */
export async function addMember(email: string, role: Role, fullName?: string): Promise<ActionResult<{ tempPassword?: string }>> {
  return run(async () => {
    const { supabase, session } = await ctx();
    if (session.role !== "admin") throw new Error("Solo un admin puede gestionar el equipo.");
    const clean = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("Ese correo no parece válido.");
    const { error } = await supabase.from("members").insert({ email: clean, role, full_name: fullName?.trim() || null });
    if (error) throw error;
    if (!process.env.SUPABASE_SECRET_KEY) return {};
    const existing = await findAuthUser(clean);
    if (existing) return {};
    const password = tempPassword();
    const { error: createError } = await createAdminClient().auth.admin.createUser({
      email: clean,
      password,
      email_confirm: true,
    });
    if (createError) throw createError;
    return { tempPassword: password };
  });
}

/** Genera una clave temporal nueva para un miembro (o le crea el acceso si no lo tenía). */
export async function resetMemberPassword(email: string): Promise<ActionResult<{ tempPassword: string }>> {
  return run(async () => {
    const { session } = await ctx();
    if (session.role !== "admin") throw new Error("Solo un admin puede hacer esto.");
    if (!process.env.SUPABASE_SECRET_KEY) throw new Error("Falta configurar SUPABASE_SECRET_KEY en Netlify.");
    const admin = createAdminClient();
    const password = tempPassword();
    const user = await findAuthUser(email.toLowerCase());
    if (user) {
      const { error } = await admin.auth.admin.updateUserById(user.id, { password });
      if (error) throw error;
    } else {
      const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
    }
    return { tempPassword: password };
  });
}

export async function updateMember(email: string, patch: { role?: Role; full_name?: string | null }): Promise<ActionResult> {
  return run(async () => {
    const { supabase, session } = await ctx();
    if (session.role !== "admin") throw new Error("Solo un admin puede gestionar el equipo.");
    if (email === session.email && patch.role && patch.role !== "admin") {
      throw new Error("No te puedes quitar a ti mismo el rol de admin.");
    }
    const { error } = await supabase.from("members").update(patch).eq("email", email);
    if (error) throw error;
    return undefined;
  });
}

export async function removeMember(email: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, session } = await ctx();
    if (session.role !== "admin") throw new Error("Solo un admin puede gestionar el equipo.");
    if (email === session.email) throw new Error("No te puedes quitar a ti mismo.");
    const { error } = await supabase.from("members").delete().eq("email", email);
    if (error) throw error;
    return undefined;
  });
}

export async function updateProfile(fullName: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, session } = await ctx();
    const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() || null }).eq("id", session.userId);
    if (error) throw error;
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Reuniones + Google Calendar (cuenta conectada: hello@wearekosma.com)
// ---------------------------------------------------------------------------

export type CalendarOpts = { sync: boolean; meet: boolean; notify: boolean };

/** Guarda la reunión y, si se pide, la crea/actualiza en Google Calendar con invitación y Meet. */
export async function saveMeeting(
  input: Record<string, unknown>,
  cal: CalendarOpts
): Promise<ActionResult<{ id: string; gcalError?: string; meetUrl?: string | null }>> {
  return run(async () => {
    const { supabase } = await ctx();
    const row = pick(input, CHILD_FIELDS.meetings);
    if ("duration_min" in row) row.duration_min = row.duration_min == null ? null : Number(row.duration_min);
    const id = typeof input.id === "string" ? input.id : null;

    let meeting: Record<string, unknown>;
    if (id) {
      delete row.lead_id;
      const { data, error } = await supabase.from("meetings").update(row).eq("id", id).select("*");
      if (error) throw error;
      if (!data?.length) throw new Error("No se pudo guardar: la ficha está bloqueada o no tienes permiso.");
      meeting = data[0];
    } else {
      const { data, error } = await supabase.from("meetings").insert(row).select("*").single();
      if (error) throw error;
      meeting = data;
    }

    if (!cal.sync) return { id: meeting.id as string };

    try {
      const status = await googleStatus();
      if (!status.connected) return { id: meeting.id as string, gcalError: "Google Calendar no está conectado (Agenda → Conectar)." };
      const { data: lead } = await supabase.from("leads").select("company").eq("id", meeting.lead_id).single();
      const company = (lead?.company as string) ?? "Cliente";
      const o = await origin();
      const appLink = o ? `${o}${process.env.NEXT_PUBLIC_BASE_PATH || ""}/leads/${meeting.lead_id}` : undefined;
      const m = meeting as Parameters<typeof createEvent>[0];
      const res = meeting.gcal_event_id
        ? await updateEvent(meeting.gcal_event_id as string, m, company, { ...cal, appLink })
        : await createEvent(m, company, { ...cal, appLink });
      await supabase.from("meetings").update({ gcal_event_id: res.id, meet_url: res.meetUrl }).eq("id", meeting.id);
      return { id: meeting.id as string, meetUrl: res.meetUrl };
    } catch (e) {
      return { id: meeting.id as string, gcalError: e instanceof Error ? e.message : String(e) };
    }
  });
}

/** Borra la reunión del tracker y (opcional) el evento en Google Calendar avisando a los invitados. */
export async function deleteMeeting(id: string, alsoCalendar: boolean): Promise<ActionResult<{ gcalError?: string }>> {
  return run(async () => {
    const { supabase } = await ctx();
    const { data: m } = await supabase.from("meetings").select("gcal_event_id").eq("id", id).single();
    const { data, error } = await supabase.from("meetings").delete().eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("No se pudo eliminar: la ficha está bloqueada o no tienes permiso.");
    if (alsoCalendar && m?.gcal_event_id) {
      try {
        await deleteEvent(m.gcal_event_id, true);
      } catch (e) {
        return { gcalError: e instanceof Error ? e.message : String(e) };
      }
    }
    return {};
  });
}

/** Trae un evento del Calendar de hello@ y lo registra como reunión de un lead. */
export async function importCalendarEvent(eventId: string, leadId: string, kind = "seguimiento"): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase } = await ctx();
    const ev = await getEvent(eventId);
    const duration = ev.end && !ev.allDay ? Math.max(5, Math.round((new Date(ev.end).getTime() - new Date(ev.start).getTime()) / 60000)) : 45;
    const { data, error } = await supabase
      .from("meetings")
      .insert({
        lead_id: leadId,
        title: ev.title,
        kind,
        mode: ev.meetUrl ? "virtual" : ev.location ? "presencial" : "virtual",
        starts_at: ev.start,
        duration_min: duration,
        location: ev.location ?? ev.meetUrl,
        invitees: ev.attendees.join(", ") || null,
        summary: ev.description,
        gcal_event_id: ev.id,
        meet_url: ev.meetUrl,
      })
      .select("id")
      .single();
    if (error) {
      if (/duplicate key/i.test(error.message)) throw new Error("Ese evento ya está vinculado a un lead.");
      throw error;
    }
    return { id: data.id as string };
  });
}

export async function disconnectGoogleAction(): Promise<ActionResult> {
  return run(async () => {
    const { session } = await ctx();
    if (session.role !== "admin") throw new Error("Solo un admin puede desconectar Google.");
    await disconnectGoogle();
    return undefined;
  });
}
