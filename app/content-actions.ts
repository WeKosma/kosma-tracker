"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { profileName } from "@/lib/format";
import { CONTENT_STATUS, FORMATS, isVideo, PLATFORMS } from "@/lib/content";
import { announceContent, announceContentBatch } from "@/lib/discord";
import { batchMessage, contentMessage, notifyWhatsApp } from "@/lib/whatsapp";
import { igStart, igStep, type IgResult } from "@/lib/instagram";
import { onInstagramPublished } from "@/lib/contentNotify";
import { copyStorageFileToDrive, createUploadSession, driveName, ensureMonthFolder, ensureRoot, getDriveFile } from "@/lib/drive";
import { googleStatus } from "@/lib/google";
import type { ActionResult } from "@/lib/types";

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

async function ctx() {
  const session = await getSession();
  if (!session) throw new Error("Tu sesión expiró. Vuelve a entrar.");
  if (session.role === "viewer") throw new Error("Tu rol es de solo lectura.");
  return { supabase: await createClient(), session };
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/contenido");
    return { ok: true, data };
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e);
    return { ok: false, error: /row-level security|permission denied/i.test(msg) ? "No tienes permiso para esto." : msg || "Algo salió mal." };
  }
}

const bogotaDate = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(iso));

const POST_FIELDS = ["brand", "title", "publish_at", "platforms", "format", "pillar", "caption", "hashtags", "status", "owner_id", "lead_id", "published_url"] as const;

function cleanPost(input: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const k of POST_FIELDS) {
    if (!(k in input)) continue;
    const v = input[k];
    row[k] = typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v;
  }
  if ("title" in row && !row.title) throw new Error("Ponle un título a la publicación.");
  if ("brand" in row && !row.brand) row.brand = "KOSMA";
  if ("status" in row && !CONTENT_STATUS.some((s) => s.id === row.status)) throw new Error("Estado inválido");
  if ("format" in row && !FORMATS.some((f) => f.id === row.format)) throw new Error("Formato inválido");
  if ("platforms" in row) {
    const list = Array.isArray(row.platforms) ? row.platforms : String(row.platforms ?? "").split(",");
    row.platforms = list.map(String).filter((p) => PLATFORMS.some((x) => x.id === p));
    if (!(row.platforms as string[]).length) row.platforms = ["instagram"];
  }
  if ("publish_at" in row && (!row.publish_at || Number.isNaN(new Date(String(row.publish_at)).getTime()))) throw new Error("Fecha inválida");
  return row;
}

async function signedFirstImage(supabase: Awaited<ReturnType<typeof createClient>>, postId: string) {
  const { data } = await supabase.from("content_media").select("path,mime,name").eq("post_id", postId).eq("is_current", true).order("position").limit(5);
  const img = (data ?? []).find((m) => m.path && !isVideo({ mime: m.mime as string, name: m.name as string, url: null }));
  if (!img?.path) return null;
  const { data: s } = await supabase.storage.from("tracker").createSignedUrl(img.path as string, 60 * 60 * 24 * 6);
  return s?.signedUrl ?? null;
}

// ---------------------------------------------------------------------------
// Publicaciones
// ---------------------------------------------------------------------------

export async function createPost(input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const { supabase, session } = await ctx();
    const row = cleanPost({ status: "idea", format: "post", platforms: ["instagram"], brand: "KOSMA", ...input });
    if (!row.owner_id) row.owner_id = session.userId;
    const { data, error } = await supabase.from("content_posts").insert(row).select("id").single();
    if (error) throw error;
    return { id: data.id as string };
  });
}

export async function updatePost(id: string, patch: Record<string, unknown>): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await ctx();
    const row = cleanPost(patch);
    const { data, error } = await supabase.from("content_posts").update(row).eq("id", id).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("No se pudo guardar.");
    return undefined;
  });
}

/** Mover a otro día conservando la hora. */
export async function movePost(id: string, day: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await ctx();
    const { data: post } = await supabase.from("content_posts").select("publish_at").eq("id", id).single();
    if (!post) throw new Error("No encontré la publicación.");
    const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Bogota" }).format(new Date(post.publish_at as string));
    const { error } = await supabase.from("content_posts").update({ publish_at: new Date(`${day}T${time}:00-05:00`).toISOString() }).eq("id", id);
    if (error) throw error;
    return undefined;
  });
}

export async function deletePost(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await ctx();
    const { data: media } = await supabase.from("content_media").select("path").eq("post_id", id);
    const paths = (media ?? []).map((m) => m.path).filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from("tracker").remove(paths);
    const { error } = await supabase.from("content_posts").delete().eq("id", id);
    if (error) throw error;
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Artes (imágenes / videos)
// ---------------------------------------------------------------------------

export type MediaInput = { name: string; mime: string; size: number; path?: string | null; url?: string | null; drive_file_id?: string | null; drive_url?: string | null };

/**
 * Registra artes ya subidos. "replace" crea una versión nueva (la anterior queda en el historial).
 * Si la pieza estaba en idea, diseño, cambios o aprobada, pasa a "Para aprobar".
 */
export async function addMedia(
  postId: string,
  items: MediaInput[],
  mode: "append" | "replace",
  opts: { silent?: boolean } = {}
): Promise<ActionResult<{ ids: string[]; version: number }>> {
  return run(async () => {
    const { supabase, session } = await ctx();
    if (!items.length) throw new Error("No hay archivos.");
    const { data: post } = await supabase.from("content_posts").select("*").eq("id", postId).single();
    if (!post) throw new Error("No encontré la publicación.");
    const { data: current } = await supabase.from("content_media").select("version,position").eq("post_id", postId).eq("is_current", true);
    const curVersion = Math.max(0, ...(current ?? []).map((m) => m.version as number));
    const version = mode === "replace" || curVersion === 0 ? curVersion + 1 : curVersion;
    const startPos = mode === "replace" ? 0 : Math.max(-1, ...(current ?? []).map((m) => m.position as number)) + 1;
    if (mode === "replace" && curVersion > 0) {
      await supabase.from("content_media").update({ is_current: false }).eq("post_id", postId).eq("is_current", true);
    }
    const rows = items.map((m, i) => ({
      post_id: postId, version, position: startPos + i, is_current: true,
      name: m.name?.slice(0, 200) ?? null, mime: m.mime || null, size_bytes: m.size || null,
      path: m.path ?? null, url: m.url ?? null, drive_file_id: m.drive_file_id ?? null, drive_url: m.drive_url ?? null,
    }));
    const { data, error } = await supabase.from("content_media").insert(rows).select("id");
    if (error) throw error;

    const by = profileName(session.profile);
    const needsReview = ["idea", "diseno", "cambios", "aprobado", "programado"].includes(post.status as string);
    // Varias láminas en un post = carrusel
    const total = (mode === "replace" ? 0 : (current ?? []).length) + items.length;
    const patch: Record<string, unknown> = {};
    if (total > 1 && post.format === "post") patch.format = "carrusel";
    if (post.ig_status === "error") Object.assign(patch, { ig_status: null, ig_error: null, ig_containers: null });
    if (Object.keys(patch).length) await supabase.from("content_posts").update(patch).eq("id", postId);
    const isNewVersion = mode === "replace" && curVersion > 0;
    await supabase.from("content_comments").insert({
      post_id: postId, kind: "system", media_version: version,
      body: isNewVersion ? `Subió la versión ${version} del arte (${items.length} ${items.length === 1 ? "archivo" : "archivos"}).` : `Agregó ${items.length} ${items.length === 1 ? "archivo" : "archivos"}.`,
    });
    if (needsReview) {
      await supabase.from("content_posts").update({ status: "revision", approved_by: null, approved_at: null }).eq("id", postId);
      if (post.auto_publish) await supabase.from("content_posts").update({ auto_publish: false }).eq("id", postId);
      if (!opts.silent) {
        const p = post as { id: string; title: string; publish_at: string };
        await Promise.all([
          announceContent("revision", p, by, { image: await signedFirstImage(supabase, postId) }),
          notifyWhatsApp("revision", contentMessage("revision", p, by), session.userId),
        ]);
      }
    }
    return { ids: (data ?? []).map((d) => d.id as string), version };
  });
}

/** Un solo aviso cuando se suben varias publicaciones de una vez (en vez de uno por pieza). */
export async function announceBatch(postIds: string[]): Promise<ActionResult> {
  return run(async () => {
    const { supabase, session } = await ctx();
    const { data } = await supabase.from("content_posts").select("id,title,publish_at,status").in("id", postIds).order("publish_at");
    const list = (data ?? []).filter((p) => p.status === "revision");
    if (!list.length) return undefined;
    const by = profileName(session.profile);
    const first = list[0] as { id: string; title: string; publish_at: string };
    if (list.length === 1) {
      await Promise.all([
        announceContent("revision", first, by, { image: await signedFirstImage(supabase, first.id) }),
        notifyWhatsApp("revision", contentMessage("revision", first, by), session.userId),
      ]);
    } else {
      await Promise.all([
        announceContentBatch(list.length, by, bogotaDate(first.publish_at).slice(0, 7)),
        notifyWhatsApp("revision", batchMessage(list.length, first, by), session.userId),
      ]);
    }
    return undefined;
  });
}

export async function addMediaLink(postId: string, url: string, mode: "append" | "replace") {
  const clean = url.trim();
  if (!/^https?:\/\//i.test(clean)) return { ok: false as const, error: "Pega un enlace que empiece por https://" };
  const name = decodeURIComponent(clean.split("?")[0].split("/").filter(Boolean).pop() ?? "enlace");
  return addMedia(postId, [{ name, mime: /\.(mp4|mov|webm|m4v)(\?|$)/i.test(clean) ? "video/mp4" : "", size: 0, url: clean }], mode);
}

export async function removeMedia(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await ctx();
    const { data: m } = await supabase.from("content_media").select("path").eq("id", id).single();
    const { error } = await supabase.from("content_media").delete().eq("id", id);
    if (error) throw error;
    if (m?.path) await supabase.storage.from("tracker").remove([m.path as string]);
    return undefined;
  });
}

export async function reorderMedia(postId: string, ids: string[]): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await ctx();
    await Promise.all(ids.map((id, i) => supabase.from("content_media").update({ position: i }).eq("id", id).eq("post_id", postId)));
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Feedback y aprobación
// ---------------------------------------------------------------------------

export async function reviewPost(postId: string, kind: "comment" | "approve" | "changes", body: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, session } = await ctx();
    const text = body.trim();
    if (kind !== "approve" && !text) throw new Error(kind === "changes" ? "Escribe qué hay que cambiar." : "Escribe el comentario.");
    const { data: post } = await supabase.from("content_posts").select("*").eq("id", postId).single();
    if (!post) throw new Error("No encontré la publicación.");
    const { data: cur } = await supabase.from("content_media").select("version").eq("post_id", postId).eq("is_current", true).limit(1);
    const version = (cur?.[0]?.version as number) ?? null;
    const { error } = await supabase.from("content_comments").insert({ post_id: postId, kind, body: text || null, media_version: version });
    if (error) throw error;
    const by = profileName(session.profile);
    const p = post as { id: string; title: string; publish_at: string };
    if (kind === "approve") {
      await supabase.from("content_posts").update({ status: "aprobado", approved_by: session.userId, approved_at: new Date().toISOString() }).eq("id", postId);
      await Promise.all([
        announceContent("aprobado", p, by, { image: await signedFirstImage(supabase, postId) }),
        notifyWhatsApp("aprobado", contentMessage("aprobado", p, by, { text }), session.userId),
      ]);
    } else if (kind === "changes") {
      await supabase.from("content_posts").update({ status: "cambios", approved_by: null, approved_at: null }).eq("id", postId);
      await Promise.all([
        announceContent("cambios", p, by, { feedback: text }),
        notifyWhatsApp("cambios", contentMessage("cambios", p, by, { text }), session.userId),
      ]);
    } else {
      await notifyWhatsApp("comentario", contentMessage("comentario", p, by, { text }), session.userId);
    }
    return undefined;
  });
}

export async function deleteComment(id: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase, session } = await ctx();
    const { data, error } = await supabase.from("content_comments").delete().eq("id", id).eq("author_id", session.userId).select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("Solo puedes borrar tus propios comentarios.");
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Listo para publicar: descargar, copiar y publicar en Instagram
// ---------------------------------------------------------------------------

/** Enlaces de descarga (con nombre ordenado) de los artes actuales. */
export async function downloadLinks(postId: string): Promise<ActionResult<{ name: string; url: string }[]>> {
  return run(async () => {
    const supabase = await createClient();
    if (!(await getSession())) throw new Error("Tu sesión expiró.");
    const { data: post } = await supabase.from("content_posts").select("title,publish_at").eq("id", postId).single();
    const { data: media } = await supabase.from("content_media").select("*").eq("post_id", postId).eq("is_current", true).order("position");
    if (!post || !media?.length) throw new Error("No hay archivos para descargar.");
    const day = bogotaDate(post.publish_at as string);
    const out: { name: string; url: string }[] = [];
    for (const m of media) {
      const name = driveName({ date: day, title: post.title as string, version: m.version as number, position: media.length > 1 ? (m.position as number) : 0, original: (m.name as string) ?? "archivo" }).replace(/ · v\d+/, "");
      if (m.path) {
        const { data } = await supabase.storage.from("tracker").createSignedUrl(m.path as string, 60 * 30, { download: name });
        if (data) out.push({ name, url: data.signedUrl });
      } else if (m.drive_file_id) {
        out.push({ name, url: `https://drive.google.com/uc?export=download&id=${m.drive_file_id}` });
      } else if (m.url) {
        out.push({ name, url: m.url as string });
      }
    }
    return out;
  });
}

/** Publicar ya en Instagram. Devuelve el estado; el navegador sigue llamando instagramStep hasta terminar. */
export async function publishInstagram(postId: string): Promise<ActionResult<IgResult>> {
  return run(async () => {
    const { supabase, session } = await ctx();
    const { data: post } = await supabase.from("content_posts").select("status").eq("id", postId).single();
    if (!post) throw new Error("No encontré la publicación.");
    if (!["aprobado", "programado", "publicado"].includes(post.status as string)) throw new Error("Primero hay que aprobarla.");
    return igStart(postId, session.userId, onInstagramPublished);
  });
}

export async function instagramStep(postId: string): Promise<ActionResult<IgResult>> {
  try {
    if (!(await getSession())) throw new Error("Tu sesión expiró.");
    const r = await igStep(postId, onInstagramPublished);
    if (r.state === "publicado" || r.state === "error") revalidatePath("/contenido");
    return { ok: true, data: r };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Programar: se publica sola a la fecha y hora de la pieza (revisión cada 5 minutos). */
export async function scheduleInstagram(postId: string, on: boolean): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await ctx();
    const { data: post } = await supabase.from("content_posts").select("status,publish_at").eq("id", postId).single();
    if (!post) throw new Error("No encontré la publicación.");
    if (on && !["aprobado", "programado"].includes(post.status as string)) throw new Error("Primero hay que aprobarla.");
    if (on && new Date(post.publish_at as string).getTime() < Date.now() - 60_000) throw new Error("La fecha ya pasó: cámbiala o usa Publicar ahora.");
    const { error } = await supabase
      .from("content_posts")
      .update({ auto_publish: on, status: on ? "programado" : "aprobado", ig_status: null, ig_error: null, ig_containers: null })
      .eq("id", postId);
    if (error) throw new Error(/auto_publish|ig_/i.test(error.message) ? "Falta correr el SQL 0005 en Supabase." : error.message);
    return undefined;
  });
}

/** Después de un error: limpia el intento para volver a publicar. */
export async function resetInstagram(postId: string): Promise<ActionResult> {
  return run(async () => {
    const { supabase } = await ctx();
    const { error } = await supabase.from("content_posts").update({ ig_status: null, ig_error: null, ig_containers: null }).eq("id", postId).eq("ig_status", "error");
    if (error) throw error;
    return undefined;
  });
}

// ---------------------------------------------------------------------------
// Google Drive
// ---------------------------------------------------------------------------

export async function driveInfo(): Promise<ActionResult<{ ready: boolean; folderUrl?: string; reason?: string }>> {
  return run(async () => {
    await ctx();
    const g = await googleStatus().catch(() => ({ connected: false, drive: false }));
    if (!g.connected) return { ready: false, reason: "Google no está conectado." };
    if (!g.drive) return { ready: false, reason: "Falta el permiso de Drive." };
    const root = await ensureRoot();
    return { ready: true, folderUrl: root.url };
  });
}

/** Copia a Drive un arte que ya está en el tracker. */
export async function syncMediaToDrive(mediaId: string): Promise<ActionResult<{ url: string }>> {
  return run(async () => {
    const { supabase } = await ctx();
    const g = await googleStatus();
    if (!g.connected || !g.drive) throw new Error("Drive no está conectado.");
    const { data: m } = await supabase.from("content_media").select("*, content_posts(title,brand,publish_at)").eq("id", mediaId).single();
    if (!m?.path) throw new Error("Ese archivo no está en el tracker.");
    if (m.drive_url) return { url: m.drive_url as string };
    const post = m.content_posts as unknown as { title: string; brand: string; publish_at: string };
    const day = bogotaDate(post.publish_at);
    const folderId = await ensureMonthFolder(post.brand, day.slice(0, 7));
    const res = await copyStorageFileToDrive({
      path: m.path as string,
      mime: (m.mime as string) || "application/octet-stream",
      folderId,
      name: driveName({ date: day, title: post.title, version: m.version as number, position: m.position as number, original: (m.name as string) ?? "archivo" }),
    });
    await supabase.from("content_media").update({ drive_file_id: res.id, drive_url: res.url }).eq("id", mediaId);
    return { url: res.url };
  });
}

/** Archivos pesados (videos de más de 48 MB): el navegador los sube directo al Drive de KOSMA. */
export async function driveUploadSession(postId: string, file: { name: string; mime: string; size: number }, version: number, position: number): Promise<ActionResult<{ uploadUrl: string }>> {
  return run(async () => {
    const { supabase } = await ctx();
    const g = await googleStatus();
    if (!g.connected || !g.drive) throw new Error("Este archivo pesa más de 48 MB. Conecta Drive (Integraciones) o pega un enlace.");
    const { data: post } = await supabase.from("content_posts").select("title,brand,publish_at").eq("id", postId).single();
    if (!post) throw new Error("No encontré la publicación.");
    const day = bogotaDate(post.publish_at as string);
    const folderId = await ensureMonthFolder(post.brand as string, day.slice(0, 7));
    const h = await headers();
    const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
    const uploadUrl = await createUploadSession({
      name: driveName({ date: day, title: post.title as string, version, position, original: file.name }),
      mime: file.mime, size: file.size, folderId, origin,
    });
    return { uploadUrl };
  });
}

export async function driveFileLink(id: string): Promise<ActionResult<{ url: string }>> {
  return run(async () => {
    await ctx();
    const f = await getDriveFile(id);
    return { url: f.webViewLink };
  });
}
