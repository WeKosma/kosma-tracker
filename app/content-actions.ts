"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/session";
import { profileName } from "@/lib/format";
import { CONTENT_STATUS, FORMATS, isVideo, PLATFORMS } from "@/lib/content";
import { announceContent } from "@/lib/discord";
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
export async function addMedia(postId: string, items: MediaInput[], mode: "append" | "replace"): Promise<ActionResult<{ ids: string[]; version: number }>> {
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
    const needsReview = ["idea", "diseno", "cambios", "aprobado"].includes(post.status as string);
    const isNewVersion = mode === "replace" && curVersion > 0;
    await supabase.from("content_comments").insert({
      post_id: postId, kind: "system", media_version: version,
      body: isNewVersion ? `Subió la versión ${version} del arte (${items.length} ${items.length === 1 ? "archivo" : "archivos"}).` : `Agregó ${items.length} ${items.length === 1 ? "archivo" : "archivos"}.`,
    });
    if (needsReview) {
      await supabase.from("content_posts").update({ status: "revision", approved_by: null, approved_at: null }).eq("id", postId);
      await announceContent("revision", post as { title: string; brand: string; publish_at: string }, by, { image: await signedFirstImage(supabase, postId) });
    }
    return { ids: (data ?? []).map((d) => d.id as string), version };
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
    if (kind === "approve") {
      await supabase.from("content_posts").update({ status: "aprobado", approved_by: session.userId, approved_at: new Date().toISOString() }).eq("id", postId);
      await announceContent("aprobado", post as { title: string; brand: string; publish_at: string }, by, { image: await signedFirstImage(supabase, postId) });
    } else if (kind === "changes") {
      await supabase.from("content_posts").update({ status: "cambios", approved_by: null, approved_at: null }).eq("id", postId);
      await announceContent("cambios", post as { title: string; brand: string; publish_at: string }, by, { feedback: text });
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
