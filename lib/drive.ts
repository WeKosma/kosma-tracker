import "server-only";
import { accessToken } from "@/lib/google";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Copia de las parrillas en el Google Drive de KOSMA (cuenta conectada en el tracker, hello@).
 * Estructura:  KOSMA · Parrillas de contenido / <Marca> / 2026-10 · Octubre / archivos
 * Con el permiso drive.file el tracker solo ve y toca lo que él mismo crea: no lee el resto del Drive.
 */

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
const ROOT_NAME = "KOSMA · Parrillas de contenido";
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

type FolderMap = { rootId?: string; rootUrl?: string; folders?: Record<string, string> };

async function token() {
  const t = await accessToken();
  if (!t) throw new Error("Google no está conectado. Agenda → Conectar Google Calendar.");
  return t;
}

async function driveFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { error?: { message?: string } })?.error?.message ?? String(res.status);
    if (/insufficient|scope/i.test(msg)) throw new Error("Falta el permiso de Drive: desconecta y vuelve a conectar Google en la Agenda.");
    if (/has not been used|is disabled/i.test(msg)) throw new Error("La API de Google Drive no está activada en Google Cloud.");
    throw new Error(`Google Drive: ${msg}`);
  }
  return json as T;
}

async function createFolder(name: string, parent?: string) {
  return driveFetch<{ id: string; webViewLink: string }>(`${API}/files?fields=id,webViewLink`, {
    method: "POST",
    body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }),
  });
}

async function loadMap(): Promise<FolderMap> {
  const { data } = await createAdminClient().from("settings").select("value").eq("key", "drive_content").maybeSingle();
  return (data?.value as FolderMap) ?? {};
}
async function saveMap(map: FolderMap) {
  await createAdminClient().from("settings").upsert({ key: "drive_content", value: map, updated_at: new Date().toISOString() });
}

/** Carpeta raíz (se crea la primera vez y se comparte con el equipo como editores). */
export async function ensureRoot() {
  const map = await loadMap();
  if (map.rootId) return { id: map.rootId, url: map.rootUrl ?? `https://drive.google.com/drive/folders/${map.rootId}`, map };
  const root = await createFolder(ROOT_NAME);
  const { data: members } = await createAdminClient().from("members").select("email,role");
  for (const m of members ?? []) {
    if (m.role === "viewer") continue;
    await driveFetch(`${API}/files/${root.id}/permissions?sendNotificationEmail=false`, {
      method: "POST",
      body: JSON.stringify({ type: "user", role: "writer", emailAddress: m.email }),
    }).catch(() => {}); // la propia cuenta dueña o un correo sin Google no detienen nada
  }
  const next: FolderMap = { ...map, rootId: root.id, rootUrl: root.webViewLink, folders: {} };
  await saveMap(next);
  return { id: root.id, url: root.webViewLink, map: next };
}

/** Carpeta de la marca y el mes ("KOSMA / 2026-10 · Octubre"). */
export async function ensureMonthFolder(brand: string, month: string) {
  const root = await ensureRoot();
  const map = root.map;
  const folders: Record<string, string> = { ...(map.folders ?? {}) };
  const brandKey = `brand:${brand}`;
  if (!folders[brandKey]) folders[brandKey] = (await createFolder(brand, root.id)).id;
  const key = `${brand}:${month}`;
  if (!folders[key]) {
    const [y, m] = month.split("-").map(Number);
    folders[key] = (await createFolder(`${month} · ${MONTHS[m - 1]} ${y}`, folders[brandKey])).id;
  }
  await saveMap({ ...map, folders });
  return folders[key];
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

export function driveName(opts: { date: string; title: string; version: number; position: number; original: string }) {
  const ext = opts.original.includes(".") ? opts.original.slice(opts.original.lastIndexOf(".")) : "";
  return `${opts.date} · ${safe(opts.title)} · v${opts.version}${opts.position ? ` · ${opts.position + 1}` : ""}${ext}`;
}

/**
 * Abre una subida directa navegador → Drive (para videos pesados que no caben en el tracker).
 * Devuelve la URL de sesión: el navegador hace PUT del archivo ahí mismo.
 */
export async function createUploadSession(opts: { name: string; mime: string; size: number; folderId: string; origin: string }) {
  const res = await fetch(`${UPLOAD}?uploadType=resumable&fields=id,webViewLink,mimeType`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.mime || "application/octet-stream",
      "X-Upload-Content-Length": String(opts.size),
      Origin: opts.origin, // habilita CORS para que el navegador suba directo
    },
    body: JSON.stringify({ name: opts.name, parents: [opts.folderId] }),
  });
  if (!res.ok) throw new Error(`Google Drive: no se pudo abrir la subida (${res.status})`);
  const url = res.headers.get("location");
  if (!url) throw new Error("Google Drive no devolvió la sesión de subida");
  return url;
}

/** Copia a Drive un archivo que ya está en el bucket del tracker (streaming, sin pasar por memoria). */
export async function copyStorageFileToDrive(opts: { path: string; name: string; mime: string; folderId: string }) {
  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage.from("tracker").createSignedUrl(opts.path, 600);
  if (error || !signed) throw new Error("No se pudo leer el archivo del tracker");
  const src = await fetch(signed.signedUrl);
  if (!src.ok || !src.body) throw new Error("No se pudo descargar el archivo del tracker");
  const size = src.headers.get("content-length");

  const session = await fetch(`${UPLOAD}?uploadType=resumable&fields=id,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": opts.mime || "application/octet-stream",
      ...(size ? { "X-Upload-Content-Length": size } : {}),
    },
    body: JSON.stringify({ name: opts.name, parents: [opts.folderId] }),
  });
  const location = session.headers.get("location");
  if (!session.ok || !location) throw new Error(`Google Drive: no se pudo abrir la subida (${session.status})`);

  const put = await fetch(location, {
    method: "PUT",
    headers: { "Content-Type": opts.mime || "application/octet-stream", ...(size ? { "Content-Length": size } : {}) },
    body: src.body,
    // @ts-expect-error: Node necesita duplex para enviar un stream
    duplex: "half",
  });
  const json = (await put.json().catch(() => ({}))) as { id?: string; webViewLink?: string };
  if (!put.ok || !json.id) throw new Error(`Google Drive: la copia falló (${put.status})`);
  return { id: json.id, url: json.webViewLink ?? `https://drive.google.com/file/d/${json.id}/view` };
}

/** Descarga el contenido de un archivo de Drive (para publicarlo en Instagram). */
export async function driveDownload(id: string) {
  const res = await fetch(`${API}/files/${encodeURIComponent(id)}?alt=media`, {
    headers: { Authorization: `Bearer ${await token()}` },
    cache: "no-store",
  });
  if (!res.ok || !res.body) throw new Error(`Google Drive: no se pudo leer el archivo (${res.status})`);
  return res;
}

export async function getDriveFile(id: string) {
  return driveFetch<{ id: string; name: string; mimeType: string; webViewLink: string; size?: string }>(
    `${API}/files/${encodeURIComponent(id)}?fields=id,name,mimeType,webViewLink,size`
  );
}
