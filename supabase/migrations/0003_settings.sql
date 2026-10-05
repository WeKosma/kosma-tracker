-- =====================================================================
--  KOSMA TRACKER · 0003 · Ajustes compartidos (Discord, Pulso, Modo sala)
--  Correr una vez en Supabase → SQL Editor. Se puede repetir sin dañar datos.
-- =====================================================================

create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (public.is_member());

drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.settings to authenticated;
