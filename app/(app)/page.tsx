import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import { profileName } from "@/lib/format";
import type { Activity, LeadOverview, Meeting, Task } from "@/lib/types";
import DashboardView from "@/components/DashboardView";

export const metadata = { title: "Inicio" };

export default async function Dashboard() {
  const session = await requireSession();
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString();

  const [{ data: leadsData }, { data: meetingsData }, { data: tasksData }, { data: actData }, { count: meetingsMonth }] = await Promise.all([
    supabase.from("lead_overview").select("*"),
    supabase.from("meetings").select("*").gte("starts_at", new Date(Date.now() - 3600000).toISOString()).lte("starts_at", in14).order("starts_at").limit(8),
    supabase.from("tasks").select("*").eq("done", false).order("due_date", { ascending: true, nullsFirst: false }).limit(10),
    supabase.from("activity").select("*").order("created_at", { ascending: false }).limit(18),
    supabase.from("meetings").select("id", { count: "exact", head: true }).gte("starts_at", monthStart).lte("starts_at", now.toISOString()),
  ]);

  return (
    <DashboardView
      leadsData={(leadsData ?? []) as LeadOverview[]}
      meetingsData={(meetingsData ?? []) as Meeting[]}
      tasksData={(tasksData ?? []) as Task[]}
      actData={(actData ?? []) as Activity[]}
      meetingsMonth={meetingsMonth ?? 0}
      firstName={profileName(session.profile).split(" ")[0]}
      readOnly={session.role === "viewer"}
    />
  );
}
