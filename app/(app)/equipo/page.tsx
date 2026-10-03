import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import type { Member } from "@/lib/types";
import TeamView from "@/components/TeamView";

export const metadata = { title: "Equipo" };

export default async function TeamPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const [{ data: members }, { data: leads }] = await Promise.all([
    supabase.from("members").select("*").order("created_at"),
    supabase.from("leads").select("owner_id,stage"),
  ]);
  const load: Record<string, { open: number; won: number }> = {};
  for (const l of leads ?? []) {
    if (!l.owner_id) continue;
    load[l.owner_id] ??= { open: 0, won: 0 };
    if (l.stage === "confirmado") load[l.owner_id].won++;
    else if (l.stage !== "perdido") load[l.owner_id].open++;
  }
  return <TeamView members={(members ?? []) as Member[]} load={load} isAdmin={session.role === "admin"} hasSecret={Boolean(process.env.SUPABASE_SECRET_KEY)} />;
}
