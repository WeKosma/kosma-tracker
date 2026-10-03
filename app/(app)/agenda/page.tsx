import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import type { Meeting, Task } from "@/lib/types";
import AgendaView from "@/components/AgendaView";

export const metadata = { title: "Agenda" };

export default async function AgendaPage() {
  await requireSession();
  const supabase = await createClient();
  const from = new Date(Date.now() - 14 * 86400000).toISOString();
  const to = new Date(Date.now() + 60 * 86400000).toISOString();
  const [{ data: meetings }, { data: tasks }, { data: leads }] = await Promise.all([
    supabase.from("meetings").select("*").gte("starts_at", from).lte("starts_at", to).order("starts_at"),
    supabase.from("tasks").select("*").order("done").order("due_date", { ascending: true, nullsFirst: false }).limit(300),
    supabase.from("leads").select("id,company"),
  ]);
  const companies = Object.fromEntries((leads ?? []).map((l) => [l.id as string, l.company as string]));
  return <AgendaView meetings={(meetings ?? []) as Meeting[]} tasks={(tasks ?? []) as Task[]} companies={companies} />;
}
