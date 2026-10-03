export type Role = "admin" | "editor" | "viewer";

export type Profile = { id: string; email: string; full_name: string | null };
export type Member = { email: string; role: Role; full_name: string | null; created_at: string };

export type Lead = {
  id: string;
  company: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_role: string | null;
  website: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
  source: string;
  service: string | null;
  stage: string;
  priority: "alta" | "media" | "baja";
  value: number | null;
  currency: string;
  owner_id: string | null;
  tags: string[];
  drive_url: string | null;
  summary: string | null;
  next_action: string | null;
  next_action_date: string | null;
  lost_reason: string | null;
  locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  lock_reason: string | null;
  stage_changed_at: string;
  confirmed_at: string | null;
  last_activity_at: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadOverview = Lead & {
  meetings_done: number;
  meetings_total: number;
  last_meeting_at: string | null;
  next_meeting_at: string | null;
  proposals_total: number;
  open_tasks: number;
};

export type Contact = {
  id: string; lead_id: string; name: string; role: string | null; email: string | null;
  phone: string | null; linkedin: string | null; notes: string | null; created_at: string;
};

export type Meeting = {
  id: string; lead_id: string; title: string; kind: string; mode: string; starts_at: string;
  duration_min: number | null; location: string | null; attendees: string | null; summary: string | null;
  next_steps: string | null; recording_url: string | null; created_by: string | null; created_at: string;
};

export type Proposal = {
  id: string; lead_id: string; title: string; kind: string; version: number; status: string;
  amount: number | null; currency: string; sent_at: string | null; url: string | null; file_path: string | null;
  notes: string | null; created_by: string | null; created_at: string; updated_at: string;
};

export type Note = { id: string; lead_id: string; body: string; pinned: boolean; author_id: string | null; created_at: string };

export type Task = {
  id: string; lead_id: string | null; title: string; due_date: string | null; done: boolean; done_at: string | null;
  assignee_id: string | null; created_by: string | null; created_at: string;
};

export type FileRow = {
  id: string; lead_id: string; name: string; path: string | null; url: string | null; size_bytes: number | null;
  mime: string | null; uploaded_by: string | null; created_at: string;
};

export type Activity = {
  id: number; lead_id: string | null; actor_id: string | null; kind: string; message: string;
  meta: Record<string, unknown>; created_at: string;
};

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
