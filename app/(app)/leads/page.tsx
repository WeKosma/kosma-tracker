import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import type { LeadOverview } from "@/lib/types";
import LeadsView from "@/components/LeadsView";

export const metadata = { title: "Pipeline" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSession();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("lead_overview").select("*").order("last_activity_at", { ascending: false });
  return <LeadsView leads={(data ?? []) as LeadOverview[]} initialView={sp.vista === "tabla" ? "table" : "board"} initialStage={sp.etapa} />;
}
