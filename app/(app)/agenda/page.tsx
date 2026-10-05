import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import { googleStatus, listEvents } from "@/lib/google";
import type { Meeting, Task } from "@/lib/types";
import type { LeadEmails } from "@/lib/match";
import AgendaView from "@/components/AgendaView";

export const metadata = { title: "Agenda" };

export default async function AgendaPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const from = new Date(Date.now() - 14 * 86400000).toISOString();
  const to = new Date(Date.now() + 60 * 86400000).toISOString();
  const [{ data: meetings }, { data: tasks }, { data: leads }, { data: contacts }, status] = await Promise.all([
    supabase.from("meetings").select("*").gte("starts_at", from).lte("starts_at", to).order("starts_at"),
    supabase.from("tasks").select("*").order("done").order("due_date", { ascending: true, nullsFirst: false }).limit(300),
    supabase.from("leads").select("id,company,contact_email").order("company"),
    supabase.from("contacts").select("lead_id,email"),
    googleStatus().catch(() => ({ configured: false, connected: false, email: null })),
  ]);
  const cal = status.connected ? await listEvents(from, to) : { events: [] as never[], error: undefined };

  const companies = Object.fromEntries((leads ?? []).map((l) => [l.id as string, l.company as string]));
  const leadEmails: LeadEmails[] = (leads ?? []).map((l) => ({
    id: l.id as string,
    company: l.company as string,
    emails: [l.contact_email, ...(contacts ?? []).filter((c) => c.lead_id === l.id).map((c) => c.email)]
      .filter(Boolean)
      .map((e) => String(e).toLowerCase()),
  }));

  return (
    <AgendaView
      meetings={(meetings ?? []) as Meeting[]}
      tasks={(tasks ?? []) as Task[]}
      companies={companies}
      leads={leadEmails}
      calendar={{ configured: status.configured, connected: status.connected, email: status.email ?? null, error: cal.error ?? null }}
      events={cal.events}
      isAdmin={session.role === "admin"}
    />
  );
}
