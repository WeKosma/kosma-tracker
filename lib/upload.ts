"use client";
import { createClient } from "@/lib/supabase/client";

const MAX = 50 * 1024 * 1024;

/** Sube un archivo al bucket privado "tracker" y devuelve su ruta */
export async function uploadFile(leadId: string, file: File, folder = "archivos") {
  if (file.size > MAX) throw new Error(`${file.name} pesa más de 50 MB. Súbelo a Drive y pega el enlace.`);
  const clean = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-90);
  const path = `${leadId}/${folder}/${Date.now().toString(36)}-${clean}`;
  const { error } = await createClient().storage.from("tracker").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}
