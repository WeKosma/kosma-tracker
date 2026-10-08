"use client";

import { createClient } from "@/lib/supabase/client";
import { driveUploadSession, type MediaInput } from "@/app/content-actions";
import { MAX_STORAGE_BYTES } from "@/lib/content";

/**
 * Sube un arte: hasta 48 MB va al tracker (y luego se copia a Drive);
 * lo más pesado (videos) va directo del navegador al Drive de KOSMA.
 */
export async function uploadArt(
  postId: string,
  file: File,
  opts: { version: number; position: number; onProgress?: (pct: number) => void }
): Promise<MediaInput> {
  const mime = file.type || (/\.(mp4|mov|m4v)$/i.test(file.name) ? "video/mp4" : "application/octet-stream");
  if (file.size <= MAX_STORAGE_BYTES) {
    const clean = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `contenido/${postId}/${Date.now().toString(36)}-${clean}`;
    opts.onProgress?.(10);
    const { error } = await createClient().storage.from("tracker").upload(path, file, { contentType: mime, upsert: false });
    if (error) throw new Error(`${file.name}: ${error.message}`);
    opts.onProgress?.(100);
    return { name: file.name, mime, size: file.size, path };
  }

  const r = await driveUploadSession(postId, { name: file.name, mime, size: file.size }, opts.version, opts.position);
  if (!r.ok) throw new Error(r.error);
  const res = await new Promise<{ id: string; webViewLink?: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", r.data!.uploadUrl);
    xhr.setRequestHeader("Content-Type", mime);
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Drive respondió algo inesperado"));
        }
      } else reject(new Error(`Drive rechazó ${file.name} (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error(`No se pudo subir ${file.name} a Drive`));
    xhr.send(file);
  });
  return { name: file.name, mime, size: file.size, drive_file_id: res.id, drive_url: res.webViewLink ?? `https://drive.google.com/file/d/${res.id}/view` };
}

/** "carrusel-servicios_v2.png" → "Carrusel servicios v2" */
export function titleFromFile(name: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "Nueva publicación";
}
