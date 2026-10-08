/** Parrillas de contenido: estados, plataformas y formatos (compartido cliente/servidor). */

export const CONTENT_STATUS = [
  { id: "idea", label: "Idea", color: "#7d7d78" },
  { id: "diseno", label: "En diseño", color: "#8ea7c4" },
  { id: "revision", label: "Para aprobar", color: "#d6b46a" },
  { id: "cambios", label: "Cambios pedidos", color: "#e08a7b" },
  { id: "aprobado", label: "Aprobado", color: "#8fc49f" },
  { id: "programado", label: "Programado", color: "#b9a7d6" },
  { id: "publicado", label: "Publicado", color: "#f3f3ef" },
] as const;
export type ContentStatus = (typeof CONTENT_STATUS)[number]["id"];
export const statusOf = (id: string) => CONTENT_STATUS.find((s) => s.id === id) ?? CONTENT_STATUS[0];

export const PLATFORMS = [
  { id: "instagram", label: "Instagram", short: "IG" },
  { id: "linkedin", label: "LinkedIn", short: "IN" },
  { id: "tiktok", label: "TikTok", short: "TT" },
  { id: "youtube", label: "YouTube", short: "YT" },
  { id: "facebook", label: "Facebook", short: "FB" },
  { id: "x", label: "X", short: "X" },
  { id: "web", label: "Web / blog", short: "WEB" },
] as const;
export const platformOf = (id: string) => PLATFORMS.find((p) => p.id === id) ?? { id, label: id, short: id.slice(0, 3).toUpperCase() };

export const FORMATS = [
  { id: "post", label: "Post" },
  { id: "carrusel", label: "Carrusel" },
  { id: "reel", label: "Reel" },
  { id: "historia", label: "Historia" },
  { id: "video", label: "Video" },
  { id: "articulo", label: "Artículo" },
  { id: "otro", label: "Otro" },
] as const;
export const formatOf = (id: string) => FORMATS.find((f) => f.id === id)?.label ?? id;

export type ContentPost = {
  id: string;
  brand: string;
  title: string;
  publish_at: string;
  platforms: string[];
  format: string;
  pillar: string | null;
  caption: string | null;
  hashtags: string | null;
  status: string;
  owner_id: string | null;
  lead_id: string | null;
  published_url: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Publicación en Instagram (0005)
  auto_publish?: boolean;
  ig_status?: IgStatus | null;
  ig_media_id?: string | null;
  ig_error?: string | null;
  ig_started_at?: string | null;
};

export type IgStatus = "preparando" | "procesando" | "publicando" | "publicado" | "error";

/** Texto final para publicar: copy + hashtags. */
export const publishText = (p: Pick<ContentPost, "caption" | "hashtags">) =>
  [p.caption?.trim(), p.hashtags?.trim()].filter(Boolean).join("\n\n");

/** Qué publica cada formato en Instagram. */
export const IG_KIND: Record<string, string> = {
  post: "Post", carrusel: "Carrusel", reel: "Reel", video: "Reel", historia: "Historia", articulo: "Post", otro: "Post",
};

/** Avisos por WhatsApp: a quién le llega qué. */
export const WA_EVENTS = [
  { id: "revision", label: "Arte para aprobar" },
  { id: "cambios", label: "Cambios pedidos" },
  { id: "aprobado", label: "Aprobado" },
  { id: "comentario", label: "Comentarios" },
  { id: "publicado", label: "Publicado en Instagram" },
] as const;
export type WaEvent = (typeof WA_EVENTS)[number]["id"];
export type WaContact = { name: string; phone: string; apikey: string; events: WaEvent[]; user_id?: string | null };

export type ContentMedia = {
  id: string;
  post_id: string;
  version: number;
  position: number;
  is_current: boolean;
  name: string | null;
  mime: string | null;
  size_bytes: number | null;
  path: string | null;
  url: string | null;
  drive_file_id: string | null;
  drive_url: string | null;
  uploaded_by: string | null;
  created_at: string;
  /** Calculado en el servidor: enlace temporal para ver el archivo */
  src?: string | null;
};

export type ContentComment = {
  id: string;
  post_id: string;
  author_id: string | null;
  kind: "comment" | "approve" | "changes" | "system";
  body: string | null;
  media_version: number | null;
  created_at: string;
};

export const isVideo = (m: Pick<ContentMedia, "mime" | "name" | "url">) =>
  (m.mime ?? "").startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(m.name ?? m.url ?? "");

/** Cómo mostrar un archivo: archivo propio (src firmado), copia en Drive o enlace externo. */
export function mediaView(m: ContentMedia): { kind: "image" | "video" | "drive" | "link"; src: string } | null {
  if (m.src) return { kind: isVideo(m) ? "video" : "image", src: m.src };
  if (m.drive_file_id) return { kind: isVideo(m) ? "drive" : "image", src: isVideo(m) ? `https://drive.google.com/file/d/${m.drive_file_id}/preview` : `https://drive.google.com/thumbnail?id=${m.drive_file_id}&sz=w1600` };
  if (m.url) {
    const drive = m.url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/);
    if (drive) return { kind: isVideo(m) ? "drive" : "image", src: isVideo(m) ? `https://drive.google.com/file/d/${drive[1]}/preview` : `https://drive.google.com/thumbnail?id=${drive[1]}&sz=w1600` };
    if (/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(m.url)) return { kind: "image", src: m.url };
    if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(m.url)) return { kind: "video", src: m.url };
    return { kind: "link", src: m.url };
  }
  return null;
}

/** Miniatura para la grilla (Drive genera miniaturas también de videos). */
export function thumbOf(m: ContentMedia | undefined): { src: string; video: boolean } | null {
  if (!m) return null;
  if (m.src) return { src: m.src, video: isVideo(m) };
  const id = m.drive_file_id ?? m.url?.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]+)/)?.[1];
  if (id) return { src: `https://drive.google.com/thumbnail?id=${id}&sz=w600`, video: false };
  if (m.url && /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(m.url)) return { src: m.url, video: false };
  return null;
}

/** Tamaño máximo para guardar en el tracker (plan gratis de Supabase). Lo más pesado va directo a Drive. */
export const MAX_STORAGE_BYTES = 48 * 1024 * 1024;
