-- =====================================================================
--  KOSMA TRACKER · Integración con Google (Calendar + Gmail de hello@)
--  Pegar en Supabase → SQL Editor → Run. Se puede correr varias veces.
-- =====================================================================

-- Credenciales de la cuenta de Google conectada.
-- RLS activo y SIN políticas: nadie la puede leer desde el navegador,
-- solo el servidor del tracker con la llave secreta.
create table if not exists public.integrations (
  provider       text primary key,
  account_email  text,
  refresh_token  text,
  access_token   text,
  expires_at     timestamptz,
  scopes         text,
  connected_by   uuid references public.profiles(id) on delete set null,
  connected_at   timestamptz not null default now()
);
alter table public.integrations enable row level security;
revoke all on public.integrations from anon, authenticated;

-- Reuniones enlazadas a eventos de Google Calendar
alter table public.meetings add column if not exists gcal_event_id text;
alter table public.meetings add column if not exists meet_url      text;
alter table public.meetings add column if not exists invitees      text;
create unique index if not exists meetings_gcal_event_idx
  on public.meetings(gcal_event_id) where gcal_event_id is not null;
