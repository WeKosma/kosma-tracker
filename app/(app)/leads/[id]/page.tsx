import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import type { Activity, Contact, FileRow, LeadOverview, Meeting, Note, Proposal, Task } from "@/lib/types";
import LeadDetail from "@/components/lead/LeadDetail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select("company").eq("id", id).maybeSingle();
  return { title: data?.company ?? "Lead" };
}

export default async function LeadPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();

  const [lead, contacts, meetings, proposals, notes, tasks, files, activity] = await Promise.all([
    supabase.from("lead_overview").select("*").eq("id", id).maybeSingle(),
    supabase.from("contacts").select("*").eq("lead_id", id).order("created_at"),
    supabase.from("meetings").select("*").eq("lead_id", id).order("starts_at", { ascending: false }),
    supabase.from("proposals").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("notes").select("*").eq("lead_id", id).order("pinned", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("tasks").select("*").eq("lead_id", id).order("done").order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("files").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("activity").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(80),
  ]);
  if (!lead.data) notFound();

  return (
    <LeadDetail
      key={id}
      lead={lead.data as LeadOverview}
      contacts={(contacts.data ?? []) as Contact[]}
      meetings={(meetings.data ?? []) as Meeting[]}
      proposals={(proposals.data ?? []) as Proposal[]}
      notes={(notes.data ?? []) as Note[]}
      tasks={(tasks.data ?? []) as Task[]}
      files={(files.data ?? []) as FileRow[]}
      activity={(activity.data ?? []) as Activity[]}
      initialTab={sp.tab}
    />
  );
}
