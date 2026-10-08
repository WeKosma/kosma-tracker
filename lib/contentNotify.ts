import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { announceContent } from "@/lib/discord";
import { contentMessage, notifyWhatsApp } from "@/lib/whatsapp";
import { profileName } from "@/lib/format";
import type { OnPublished } from "@/lib/instagram";

/** Qué pasa cuando Instagram confirma la publicación (desde el modal o desde la tarea programada). */
export const onInstagramPublished: OnPublished = async (post, url, plan) => {
  const admin = createAdminClient();
  let by = "KOSMA";
  if (plan.by) {
    const { data } = await admin.from("profiles").select("full_name,email").eq("id", plan.by).maybeSingle();
    if (data) by = profileName(data as { full_name: string | null; email: string });
  }
  const what = plan.mode === "carousel" ? `el carrusel (${plan.items.length} láminas)` : plan.mode === "stories" ? (plan.items.length > 1 ? `${plan.items.length} historias` : "la historia") : "la publicación";
  await admin.from("content_comments").insert({
    post_id: post.id,
    kind: "system",
    author_id: plan.by ?? null,
    body: `Publicó ${what} en Instagram.${plan.adjusted ? " Se agregó borde negro para cumplir la proporción del feed." : ""}`,
  });
  await Promise.all([
    announceContent("publicado", post, by, { url }),
    notifyWhatsApp("publicado", contentMessage("publicado", post, by, { url }), plan.by),
  ]);
};
