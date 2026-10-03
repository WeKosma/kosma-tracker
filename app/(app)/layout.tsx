import AppShell from "@/components/AppShell";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STAGES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const supabase = await createClient();
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .in("stage", OPEN_STAGES);

  return (
    <AppShell me={session.profile} role={session.role} team={session.team} openCount={count ?? 0}>
      {children}
    </AppShell>
  );
}
