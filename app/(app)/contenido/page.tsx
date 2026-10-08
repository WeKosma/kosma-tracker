import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import { googleStatus } from "@/lib/google";
import { bogotaMidnight, isMonth, monthGrid } from "@/lib/calendar";
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

  const { data: postRows } = await supabase
    .from("content_posts")
    .select("*")
    .gte("publish_at", bogotaMidnight(grid.start))
    .lt("publish_at", bogotaMidnight(grid.end))
    .order("publish_at");
  const posts = (postRows ?? []) as ContentPost[];
  const ids = posts.map((p) => p.id);

  const [{ data: mediaRows }, { data: commentRows }, { data: brandRows }, g] = await Promise.all([
    ids.length ? supabase.from("content_media").select("*").in("post_id", ids).order("version").order("position") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("content_comments").select("*").in("post_id", ids).order("created_at") : Promise.resolve({ data: [] }),
    supabase.from("content_posts").select("brand,pillar").order("created_at", { ascending: false }).limit(400),
    googleStatus().catch(() => ({ connected: false, drive: false })),
  ]);

  // Enlaces temporales (6 h) para ver los archivos privados del bucket
  const media = (mediaRows ?? []) as ContentMedia[];
  const paths = media.map((x) => x.path).filter(Boolean) as string[];
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("tracker").createSignedUrls(paths, 60 * 60 * 6);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    for (const x of media) if (x.path) x.src = byPath.get(x.path) ?? null;
  }

  const brands = [...new Set(["KOSMA", ...(brandRows ?? []).map((r) => r.brand as string)])];
  const pillars = [...new Set((brandRows ?? []).map((r) => r.pillar as string).filter(Boolean))];

  return (
    <ContentView
      key={month}
      month={month}
      days={grid.days}
      posts={posts}
      media={media}
      comments={(commentRows ?? []) as ContentComment[]}
      brands={brands}
      pillars={pillars}
      drive={{ connected: g.connected, ready: Boolean(g.connected && (g as { drive?: boolean }).drive) }}
      readOnly={session.role === "viewer"}
    />
  );
}
