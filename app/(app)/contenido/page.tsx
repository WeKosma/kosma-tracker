import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import { googleStatus } from "@/lib/google";
import { addDays, bogotaMidnight, isMonth, monthGrid } from "@/lib/calendar";
import { igStatus } from "@/lib/instagram";
import { todayISO } from "@/lib/format";
import type { ContentComment, ContentMedia, ContentPost } from "@/lib/content";
import ContentView from "@/components/content/ContentView";

export const metadata = { title: "Contenido" };

export default async function ContenidoPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const session = await requireSession();
  const supabase = await createClient();
  const { m } = await searchParams;
  const month = isMonth(m) ? m : todayISO().slice(0, 7);
  const grid = monthGrid(month);
  const today = todayISO();
  // En el mes actual se carga también la semana siguiente (para "Próximos 7 días" del Resumen)
  const end = today.startsWith(month) && addDays(today, 8) > grid.end ? addDays(today, 8) : grid.end;

  const { data: postRows } = await supabase
    .from("content_posts")
    .select("*")
    .gte("publish_at", bogotaMidnight(grid.start))
    .lt("publish_at", bogotaMidnight(end))
    .order("publish_at");
  const posts = (postRows ?? []) as ContentPost[];
  const ids = posts.map((p) => p.id);

  const [{ data: mediaRows }, { data: commentRows }, g, ig] = await Promise.all([
    ids.length ? supabase.from("content_media").select("*").in("post_id", ids).order("version").order("position") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("content_comments").select("*").in("post_id", ids).order("created_at") : Promise.resolve({ data: [] }),
    googleStatus().catch(() => ({ connected: false, drive: false })),
    igStatus(),
  ]);

  // Enlaces temporales (6 h) para ver los archivos privados del bucket
  const media = (mediaRows ?? []) as ContentMedia[];
  const paths = media.map((x) => x.path).filter(Boolean) as string[];
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("tracker").createSignedUrls(paths, 60 * 60 * 6);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const x of media) if (x.path) x.src = byPath.get(x.path) ?? null;
  }


  return (
    <ContentView
      key={month}
      month={month}
      days={grid.days}
      posts={posts}
      media={media}
      comments={(commentRows ?? []) as ContentComment[]}
      ig={{ connected: ig.connected, username: ig.username }}
      drive={{ connected: g.connected, ready: Boolean(g.connected && (g as { drive?: boolean }).drive) }}
      readOnly={session.role === "viewer"}
    />
  );
}
