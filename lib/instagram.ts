import "server-only";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { driveDownload } from "@/lib/drive";
import { isVideo, publishText, type ContentMedia, type IgStatus } from "@/lib/content";

/**
 * Publicar en Instagram con la API de Instagram (inicio de sesión con Instagram).
 * Instagram descarga los archivos desde un enlace público: usamos enlaces firmados del tracker.
 * Publicar es un proceso en pasos (crear contenedores → esperar que Instagram procese → publicar),
 * así que el estado se guarda en content_posts.ig_* y avanza con cada llamada a igStep()
 * (desde el navegador mientras el modal está abierto, y cada 5 minutos desde la tarea programada).
 */

const GRAPH = "https://graph.instagram.com/v25.0";
const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Conexión (token pegado en Integraciones)
// ---------------------------------------------------------------------------

type Conn = { token: string; igId: string; username: string | null; expiresAt: string | null; refreshedAt: string | null };

export async function igConnection(): Promise<Conn | null> {
  const { data } = await createAdminClient()
    .from("integrations")
    .select("access_token,account_id,account_email,expires_at,connected_at,config")
    .eq("provider", "instagram")
    .maybeSingle();
  if (!data?.access_token || !data.account_id) return null;
  const cfg = (data.config ?? {}) as { refreshed_at?: string };
  return {
    token: data.access_token as string,
    igId: data.account_id as string,
    username: (data.account_email as string) ?? null,
    expiresAt: (data.expires_at as string) ?? null,
    refreshedAt: cfg.refreshed_at ?? (data.connected_at as string) ?? null,
  };
}

export async function igStatus() {
  const c = await igConnection().catch(() => null);
  return { connected: Boolean(c), username: c?.username ?? null, expiresAt: c?.expiresAt ?? null };
}

type IgErr = { message?: string; error_user_msg?: string; error_user_title?: string; code?: number; error_subcode?: number };

function igMessage(e: IgErr | undefined, status: number) {
  if (!e) return `Instagram respondió ${status}`;
  if (e.code === 190) return "El token de Instagram venció o no es válido. Pega uno nuevo en Integraciones.";
  if (e.code === 10 || e.code === 200) return "La app de Instagram no tiene permiso para publicar (instagram_business_content_publish).";
  if (e.code === 9 || e.error_subcode === 2207042) return "Instagram llegó al límite de publicaciones por hoy (100 en 24 h).";
  if (e.code === 36003 || e.error_subcode === 2207009) return "Instagram no acepta la proporción de esa imagen.";
  if (e.error_subcode === 2207052 || e.error_subcode === 2207003) return "Instagram no pudo descargar el archivo. Intenta de nuevo en un minuto.";
  if (e.error_subcode === 2207026) return "Instagram no acepta ese formato de video (usa MP4 H.264, máximo 15 min).";
  return `Instagram: ${e.error_user_msg ?? e.message ?? status}`;
}

async function ig<T>(path: string, token: string, opts: { method?: "GET" | "POST"; params?: Record<string, string> } = {}): Promise<T> {
  const params = new URLSearchParams({ ...(opts.params ?? {}), access_token: token });
  const url = path.startsWith("http") ? path : `${GRAPH}${path}`;
  const res =
    opts.method === "POST"
      ? await fetch(url, { method: "POST", body: params, cache: "no-store", signal: AbortSignal.timeout(20000) })
      : await fetch(`${url}${url.includes("?") ? "&" : "?"}${params}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: IgErr };
  if (!res.ok || json.error) throw new Error(igMessage(json.error, res.status));
  return json;
}

/** Guarda el token (validándolo contra Instagram) y la cuenta a la que pertenece. */
export async function connectInstagram(rawToken: string, by: string) {
  const token = rawToken.trim();
  if (token.length < 40) throw new Error("Ese token se ve incompleto. Cópialo completo desde Meta.");
  const me = await ig<{ id: string; user_id?: string; username?: string; account_type?: string }>("/me", token, {
    params: { fields: "user_id,username,account_type" },
  });
  if (me.account_type && !/business|creator|media_creator/i.test(me.account_type)) {
    throw new Error("La cuenta de Instagram debe ser profesional (Empresa o Creador).");
  }
  const { error } = await createAdminClient().from("integrations").upsert({
    provider: "instagram",
    access_token: token,
    account_id: me.user_id ?? me.id,
    account_email: me.username ?? null,
    expires_at: new Date(Date.now() + 60 * DAY).toISOString(),
    scopes: "instagram_business_basic,instagram_business_content_publish",
    connected_by: by,
    connected_at: new Date().toISOString(),
    config: { account_type: me.account_type ?? null, refreshed_at: new Date().toISOString() },
  });
  if (error) throw new Error(/column/i.test(error.message) ? "Falta correr el SQL 0005 en Supabase." : error.message);
  return { username: me.username ?? null };
}

export async function disconnectInstagram() {
  await createAdminClient().from("integrations").delete().eq("provider", "instagram");
}

/** Los tokens duran 60 días: se renuevan solos cuando les quedan menos de 30 (y tienen más de 24 h). */
export async function refreshInstagramIfNeeded() {
  const c = await igConnection();
  if (!c) return { refreshed: false };
  const left = c.expiresAt ? new Date(c.expiresAt).getTime() - Date.now() : 0;
  const age = c.refreshedAt ? Date.now() - new Date(c.refreshedAt).getTime() : DAY * 2;
  if (left > 30 * DAY || age < DAY) return { refreshed: false };
  const r = await ig<{ access_token: string; expires_in: number }>("https://graph.instagram.com/refresh_access_token", c.token, {
    params: { grant_type: "ig_refresh_token" },
  });
  await createAdminClient()
    .from("integrations")
    .update({
      access_token: r.access_token,
      expires_at: new Date(Date.now() + (r.expires_in || 60 * 24 * 3600) * 1000).toISOString(),
      config: { refreshed_at: new Date().toISOString() },
    })
    .eq("provider", "instagram");
  return { refreshed: true };
}

// ---------------------------------------------------------------------------
// Plan de publicación
// ---------------------------------------------------------------------------

export type IgItem = { media: string; kind: "image" | "video"; container?: string; status?: string; tries?: number; published?: string };
export type IgPlan = {
  mode: "feed" | "carousel" | "stories";
  items: IgItem[];
  parent?: string;
  parent_status?: string;
  by?: string | null;
  adjusted?: boolean;
};

export function planFor(format: string, media: ContentMedia[], by: string | null): IgPlan {
  const list = media.filter((m) => m.is_current).sort((a, b) => a.position - b.position);
  if (!list.length) throw new Error("La publicación no tiene arte.");
  const bad = list.find((m) => !m.path && !m.drive_file_id);
  if (bad) throw new Error(`"${bad.name ?? "Un archivo"}" es un enlace externo: súbelo al tracker para publicarlo.`);
  const items = list.map((m) => ({ media: m.id, kind: (isVideo(m) ? "video" : "image") as IgItem["kind"] }));
  if (format === "historia") {
    if (items.length > 10) throw new Error("Máximo 10 historias a la vez.");
    return { mode: "stories", items, by };
  }
  if (items.length > 1) {
    if (items.length > 10) throw new Error("Instagram permite máximo 10 láminas por carrusel.");
    return { mode: "carousel", items, by };
  }
  return { mode: "feed", items, by };
}

// ---------------------------------------------------------------------------
// Archivos → enlaces que Instagram pueda descargar
// ---------------------------------------------------------------------------

async function readMedia(m: ContentMedia): Promise<Buffer> {
  if (m.path) {
    const { data, error } = await createAdminClient().storage.from("tracker").download(m.path);
    if (error || !data) throw new Error(`No se pudo leer ${m.name ?? "el archivo"} del tracker.`);
    return Buffer.from(await data.arrayBuffer());
  }
  if (m.drive_file_id) return Buffer.from(await (await driveDownload(m.drive_file_id)).arrayBuffer());
  throw new Error("Archivo sin origen.");
}

/** Instagram solo acepta JPEG y, en el feed, proporciones entre 4:5 y 1.91:1. Se completa con fondo negro si hace falta. */
async function igImageUrl(postId: string, m: ContentMedia, feed: boolean): Promise<{ url: string; adjusted: boolean }> {
  let img = sharp(await readMedia(m), { failOn: "none" }).rotate();
  const meta = await img.metadata();
  let w = meta.autoOrient?.width ?? meta.width ?? 1080;
  let h = meta.autoOrient?.height ?? meta.height ?? 1350;
  if (w > 1440) {
    h = Math.round((h * 1440) / w);
    w = 1440;
    img = img.resize({ width: 1440 });
  }
  let adjusted = false;
  if (feed) {
    const r = w / h;
    if (r < 0.8) {
      const pad = Math.ceil(h * 0.8) - w;
      img = sharp(await img.toBuffer()).extend({ left: Math.floor(pad / 2), right: Math.ceil(pad / 2), background: "#050505" });
      adjusted = true;
    } else if (r > 1.91) {
      const pad = Math.ceil(w / 1.91) - h;
      img = sharp(await img.toBuffer()).extend({ top: Math.floor(pad / 2), bottom: Math.ceil(pad / 2), background: "#050505" });
      adjusted = true;
    }
  }
  const jpg = await img.flatten({ background: "#ffffff" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const path = `contenido/${postId}/instagram/${m.id}.jpg`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from("tracker").upload(path, jpg, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`No se pudo preparar la imagen: ${error.message}`);
  const { data } = await admin.storage.from("tracker").createSignedUrl(path, 60 * 60 * 24);
  if (!data) throw new Error("No se pudo crear el enlace de la imagen.");
  return { url: data.signedUrl, adjusted };
}

async function signed(path: string) {
  const { data } = await createAdminClient().storage.from("tracker").createSignedUrl(path, 60 * 60 * 24);
  if (!data) throw new Error("No se pudo crear el enlace del video.");
  return data.signedUrl;
}

/** Videos que solo están en Drive (más de 48 MB): se envían por partes al servidor de subida de Instagram. */
async function uploadDriveVideo(conn: Conn, m: ContentMedia, params: Record<string, string>) {
  const c = await ig<{ id: string; uri: string }>(`/${conn.igId}/media`, conn.token, { method: "POST", params: { ...params, upload_type: "resumable" } });
  const src = await driveDownload(m.drive_file_id!);
  const size = m.size_bytes ?? Number(src.headers.get("content-length") ?? 0);
  const res = await fetch(c.uri, {
    method: "POST",
    headers: { Authorization: `OAuth ${conn.token}`, offset: "0", file_size: String(size) },
    body: src.body,
    // @ts-expect-error: Node necesita duplex para enviar un stream
    duplex: "half",
  });
  if (!res.ok) throw new Error(`Instagram no recibió el video (${res.status}).`);
  return c.id;
}

async function createContainer(conn: Conn, postId: string, plan: IgPlan, item: IgItem, m: ContentMedia, caption: string) {
  const base: Record<string, string> =
    plan.mode === "carousel" ? { is_carousel_item: "true" } :
    plan.mode === "stories" ? { media_type: "STORIES" } :
    { caption };

  if (item.kind === "image") {
    const { url, adjusted } = await igImageUrl(postId, m, plan.mode !== "stories");
    if (adjusted) plan.adjusted = true;
    return (await ig<{ id: string }>(`/${conn.igId}/media`, conn.token, { method: "POST", params: { ...base, image_url: url } })).id;
  }
  const video: Record<string, string> =
    plan.mode === "carousel" ? { ...base, media_type: "VIDEO" } :
    plan.mode === "stories" ? base :
    { ...base, media_type: "REELS", share_to_feed: "true" };
  if (!m.path) return uploadDriveVideo(conn, m, video);
  return (await ig<{ id: string }>(`/${conn.igId}/media`, conn.token, { method: "POST", params: { ...video, video_url: await signed(m.path) } })).id;
}

async function containerStatus(conn: Conn, id: string) {
  const r = await ig<{ status_code?: string; status?: string }>(`/${id}`, conn.token, { params: { fields: "status_code,status" } });
  return { code: r.status_code ?? "IN_PROGRESS", detail: r.status ?? "" };
}

// ---------------------------------------------------------------------------
// Máquina de estados
// ---------------------------------------------------------------------------

export type IgResult = { state: IgStatus | "idle"; error?: string; url?: string; progress?: string; adjusted?: boolean };

type PostRow = {
  id: string; title: string; format: string; caption: string | null; hashtags: string | null; publish_at: string;
  ig_status: IgStatus | null; ig_containers: IgPlan | null; ig_error: string | null; ig_started_at: string | null; published_url: string | null;
};

export type OnPublished = (post: PostRow, url: string, plan: IgPlan) => Promise<void>;

async function savePlan(id: string, plan: IgPlan, patch: Record<string, unknown> = {}) {
  await createAdminClient().from("content_posts").update({ ig_containers: plan, ...patch }).eq("id", id);
}

async function fail(id: string, message: string): Promise<IgResult> {
  await createAdminClient().from("content_posts").update({ ig_status: "error", ig_error: message.slice(0, 500) }).eq("id", id);
  return { state: "error", error: message };
}

/** Arranca la publicación: arma el plan y da el primer paso. */
export async function igStart(postId: string, by: string | null, onPublished: OnPublished): Promise<IgResult> {
  const admin = createAdminClient();
  const { data: post } = await admin.from("content_posts").select("*").eq("id", postId).single();
  if (!post) throw new Error("No encontré la publicación.");
  if (post.ig_status === "publicado") return { state: "publicado", url: post.published_url ?? undefined };
  if (["preparando", "procesando", "publicando"].includes(post.ig_status ?? "")) return igStep(postId, onPublished);
  if (!(await igConnection())) throw new Error("Instagram no está conectado. Un admin lo conecta en Integraciones.");
  const text = publishText(post);
  if (text.length > 2200) throw new Error("El copy con hashtags pasa de 2200 caracteres.");
  if ((text.match(/#[\p{L}\p{N}_]+/gu) ?? []).length > 30) throw new Error("Instagram permite máximo 30 hashtags.");
  const { data: media } = await admin.from("content_media").select("*").eq("post_id", postId).eq("is_current", true);
  const plan = planFor(post.format, (media ?? []) as ContentMedia[], by);
  await admin.from("content_posts").update({ ig_status: "preparando", ig_containers: plan, ig_error: null, ig_started_at: new Date().toISOString() }).eq("id", postId);
  return igStep(postId, onPublished);
}

/** Da el siguiente paso. Es seguro llamarlo muchas veces y desde varios lados. */
export async function igStep(postId: string, onPublished: OnPublished): Promise<IgResult> {
  const admin = createAdminClient();
  const { data } = await admin.from("content_posts").select("*").eq("id", postId).single();
  const post = data as PostRow | null;
  if (!post) return { state: "error", error: "No encontré la publicación." };
  if (!post.ig_status) return { state: "idle" };
  if (post.ig_status === "publicado") return { state: "publicado", url: post.published_url ?? undefined };
  if (post.ig_status === "error") return { state: "error", error: post.ig_error ?? "Error" };
  if (post.ig_status === "publicando") {
    const since = post.ig_started_at ? Date.now() - new Date(post.ig_started_at).getTime() : 0;
    if (since > 3 * 60 * 1000) return fail(post.id, "Se interrumpió justo al publicar. Revisa el perfil de Instagram antes de reintentar para no duplicar.");
    return { state: "publicando" };
  }

  const conn = await igConnection();
  if (!conn) return fail(post.id, "Instagram no está conectado.");
  const plan = post.ig_containers!;
  const caption = publishText(post);
  const total = plan.items.length;

  try {
    // 1) Crear los contenedores (pocos por llamada: las funciones de Netlify tienen poco tiempo)
    if (post.ig_status === "preparando") {
      const t0 = Date.now();
      const { data: rows } = await admin.from("content_media").select("*").in("id", plan.items.map((i) => i.media));
      const byId = new Map(((rows ?? []) as ContentMedia[]).map((m) => [m.id, m]));
      for (const item of plan.items) {
        if (item.container) continue;
        if (Date.now() - t0 > 5000) break;
        const m = byId.get(item.media);
        if (!m) throw new Error("Uno de los archivos ya no existe. Revisa el arte y vuelve a intentar.");
        item.tries = (item.tries ?? 0) + 1;
        if (item.tries > 3) throw new Error(`Instagram no logró recibir "${m.name ?? "un archivo"}". Si es un video pesado, expórtalo por debajo de 48 MB.`);
        await savePlan(post.id, plan);
        item.container = await createContainer(conn, post.id, plan, item, m, caption);
        await savePlan(post.id, plan);
      }
      const ready = plan.items.filter((i) => i.container).length;
      if (ready < total) return { state: "preparando", progress: `${ready}/${total}` };
      await savePlan(post.id, plan, { ig_status: "procesando" });
      return { state: "procesando", progress: `0/${total}`, adjusted: plan.adjusted };
    }

    // 2) Esperar a que Instagram procese (los videos tardan)
    for (const item of plan.items) {
      if (item.status === "FINISHED") continue;
      const s = await containerStatus(conn, item.container!);
      item.status = s.code;
      if (s.code === "ERROR" || s.code === "EXPIRED") throw new Error(`Instagram rechazó la lámina ${plan.items.indexOf(item) + 1}${s.detail ? `: ${s.detail}` : ""}.`);
    }
    const done = plan.items.filter((i) => i.status === "FINISHED" || i.status === "PUBLISHED").length;
    if (done < total) {
      await savePlan(post.id, plan);
      return { state: "procesando", progress: `${done}/${total}` };
    }
    if (plan.mode === "carousel") {
      if (!plan.parent) {
        plan.parent = (await ig<{ id: string }>(`/${conn.igId}/media`, conn.token, {
          method: "POST",
          params: { media_type: "CAROUSEL", children: plan.items.map((i) => i.container).join(","), caption },
        })).id;
        await savePlan(post.id, plan);
        return { state: "procesando", progress: `${done}/${total}` };
      }
      if (plan.parent_status !== "FINISHED") {
        const s = await containerStatus(conn, plan.parent);
        plan.parent_status = s.code;
        if (s.code === "ERROR" || s.code === "EXPIRED") throw new Error(`Instagram rechazó el carrusel${s.detail ? `: ${s.detail}` : ""}.`);
        await savePlan(post.id, plan);
        if (s.code !== "FINISHED") return { state: "procesando", progress: `${done}/${total}` };
      }
    }

    // 3) Publicar (con candado para no publicar dos veces)
    const { data: locked } = await admin
      .from("content_posts")
      .update({ ig_status: "publicando", ig_started_at: new Date().toISOString() })
      .eq("id", post.id)
      .eq("ig_status", "procesando")
      .select("id");
    if (!locked?.length) return { state: "publicando" };

    let mediaId = "";
    if (plan.mode === "stories") {
      for (const item of plan.items) {
        if (item.published) continue;
        item.published = (await ig<{ id: string }>(`/${conn.igId}/media_publish`, conn.token, { method: "POST", params: { creation_id: item.container! } })).id;
        await savePlan(post.id, plan);
        mediaId = item.published;
      }
    } else {
      mediaId = (await ig<{ id: string }>(`/${conn.igId}/media_publish`, conn.token, { method: "POST", params: { creation_id: plan.parent ?? plan.items[0].container! } })).id;
    }

    let url = conn.username ? `https://www.instagram.com/${conn.username}/` : "https://www.instagram.com/";
    if (plan.mode === "stories" && conn.username) url = `https://www.instagram.com/stories/${conn.username}/`;
    else if (mediaId) {
      try {
        url = (await ig<{ permalink?: string }>(`/${mediaId}`, conn.token, { params: { fields: "permalink" } })).permalink ?? url;
      } catch {
        /* el post ya salió; el enlace es solo un extra */
      }
    }
    await admin
      .from("content_posts")
      .update({ ig_status: "publicado", ig_media_id: mediaId, ig_error: null, ig_containers: plan, status: "publicado", published_url: url, auto_publish: false })
      .eq("id", post.id);
    await onPublished(post, url, plan).catch((e) => console.error("[instagram] onPublished", e));
    return { state: "publicado", url };
  } catch (e) {
    return fail(post.id, e instanceof Error ? e.message : String(e));
  }
}

/** Para la tarea programada: avanza lo pendiente y arranca lo programado cuya hora ya llegó. */
export async function igCron(onPublished: OnPublished) {
  const admin = createAdminClient();
  const out: { id: string; state: string }[] = [];
  await refreshInstagramIfNeeded().catch((e) => console.error("[instagram] refresh", e));
  const { data: running } = await admin.from("content_posts").select("id").in("ig_status", ["preparando", "procesando", "publicando"]).limit(10);
  for (const r of running ?? []) out.push({ id: r.id as string, state: (await igStep(r.id as string, onPublished)).state });
  const { data: due } = await admin
    .from("content_posts")
    .select("id,approved_by,created_by")
    .eq("auto_publish", true)
    .is("ig_status", null)
    .lte("publish_at", new Date().toISOString())
    .limit(5);
  for (const r of due ?? []) {
    try {
      out.push({ id: r.id as string, state: (await igStart(r.id as string, (r.approved_by ?? r.created_by) as string | null, onPublished)).state });
    } catch (e) {
      await fail(r.id as string, e instanceof Error ? e.message : String(e));
      out.push({ id: r.id as string, state: "error" });
    }
  }
  return out;
}
