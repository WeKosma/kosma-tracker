-- =====================================================================
--  KOSMA TRACKER · Esquema base
--  Pegar completo en Supabase → SQL Editor → Run (una sola vez).
--  Es idempotente en lo posible: se puede volver a correr sin romper datos.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. EQUIPO · lista blanca de correos con acceso + rol
-- ---------------------------------------------------------------------
create table if not exists public.members (
  email       text primary key check (email = lower(email)),
  role        text not null default 'editor' check (role in ('admin','editor','viewer')),
  full_name   text,
  created_at  timestamptz not null default now()
);

insert into public.members (email, role, full_name) values
  ('tian@meroestudio.tv',    'admin', 'Sebastián'),
  ('hello@wearekosma.com',   'admin', 'KOSMA'),
  ('perezalzatej@gmail.com', 'admin', null)
on conflict (email) do nothing;

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null unique,
  full_name   text,
  created_at  timestamptz not null default now()
);

-- Helpers de permisos (security definer para poder leer members sin recursión de RLS)
create or replace function public.kosma_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.kosma_role() returns text
language sql stable security definer set search_path = public as $$
  select m.role from public.members m where m.email = public.kosma_email()
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members m where m.email = public.kosma_email())
$$;

create or replace function public.can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.kosma_role() in ('admin','editor'), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.kosma_role() = 'admin', false)
$$;

-- Solo se pueden crear usuarios cuyo correo esté en members
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  select * into m from public.members where email = lower(new.email);
  if not found then
    raise exception 'KOSMA: el correo % no tiene acceso al tracker', new.email;
  end if;
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), coalesce(m.full_name, split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Si ya existían usuarios antes de correr este script
insert into public.profiles (id, email, full_name)
select u.id, lower(u.email), coalesce(m.full_name, split_part(u.email, '@', 1))
from auth.users u join public.members m on m.email = lower(u.email)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. LEADS / CLIENTES
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  company           text not null,
  contact_name      text,
  contact_email     text,
  contact_phone     text,
  contact_role      text,
  website           text,
  industry          text,
  city              text,
  country           text default 'Colombia',
  source            text not null default 'otro',
  service           text,
  stage             text not null default 'nuevo'
                    check (stage in ('nuevo','contactado','discovery','propuesta','negociacion','confirmado','perdido')),
  priority          text not null default 'media' check (priority in ('alta','media','baja')),
  value             numeric(14,2),
  currency          text not null default 'COP' check (currency in ('COP','USD','EUR','AUD')),
  owner_id          uuid references public.profiles(id) on delete set null,
  tags              text[] not null default '{}',
  drive_url         text,
  summary           text,
  next_action       text,
  next_action_date  date,
  lost_reason       text,
  locked            boolean not null default false,
  locked_by         uuid references public.profiles(id) on delete set null,
  locked_at         timestamptz,
  lock_reason       text,
  stage_changed_at  timestamptz not null default now(),
  confirmed_at      timestamptz,
  last_activity_at  timestamptz not null default now(),
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists leads_stage_idx on public.leads(stage);
create index if not exists leads_owner_idx on public.leads(owner_id);

create or replace function public.can_edit_lead(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_write() and coalesce((
    select (not l.locked) or l.locked_by = auth.uid() or public.is_admin()
    from public.leads l where l.id = lid
  ), false)
$$;

-- Contactos adicionales
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  name        text not null,
  role        text,
  email       text,
  phone       text,
  linkedin    text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists contacts_lead_idx on public.contacts(lead_id);

-- Reuniones
create table if not exists public.meetings (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  title         text not null,
  kind          text not null default 'seguimiento'
                check (kind in ('discovery','seguimiento','presentacion','negociacion','cierre','kickoff','otro')),
  mode          text not null default 'virtual' check (mode in ('virtual','presencial','llamada')),
  starts_at     timestamptz not null,
  duration_min  int default 45,
  location      text,
  attendees     text,
  summary       text,
  next_steps    text,
  recording_url text,
  created_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists meetings_lead_idx on public.meetings(lead_id);
create index if not exists meetings_starts_idx on public.meetings(starts_at);

-- Propuestas, presentaciones, cotizaciones, contratos
create table if not exists public.proposals (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  title       text not null,
  kind        text not null default 'propuesta'
              check (kind in ('propuesta','presentacion','cotizacion','contrato','otro')),
  version     int not null default 1,
  status      text not null default 'borrador'
              check (status in ('borrador','enviada','en_revision','aprobada','rechazada')),
  amount      numeric(14,2),
  currency    text not null default 'COP' check (currency in ('COP','USD','EUR','AUD')),
  sent_at     date,
  url         text,
  file_path   text,
  notes       text,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists proposals_lead_idx on public.proposals(lead_id);

-- Notas
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads(id) on delete cascade,
  body        text not null,
  pinned      boolean not null default false,
  author_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists notes_lead_idx on public.notes(lead_id);

-- Tareas (pueden ser de un lead o generales)
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid references public.leads(id) on delete cascade,
  title        text not null,
  due_date     date,
  done         boolean not null default false,
  done_at      timestamptz,
  assignee_id  uuid references public.profiles(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists tasks_lead_idx on public.tasks(lead_id);

-- Archivos subidos al tracker (Storage) o enlazados (Drive)
create table if not exists public.files (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads(id) on delete cascade,
  name         text not null,
  path         text,
  url          text,
  size_bytes   bigint,
  mime         text,
  uploaded_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists files_lead_idx on public.files(lead_id);

-- Bitácora de actividad (la llenan los triggers)
create table if not exists public.activity (
  id          bigint generated always as identity primary key,
  lead_id     uuid references public.leads(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  kind        text not null,
  message     text not null,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists activity_lead_idx on public.activity(lead_id, created_at desc);
create index if not exists activity_created_idx on public.activity(created_at desc);

-- ---------------------------------------------------------------------
-- 3. TRIGGERS · timestamps, candado, bitácora
-- ---------------------------------------------------------------------
create or replace function public.log_activity(p_lead uuid, p_kind text, p_message text, p_meta jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity (lead_id, actor_id, kind, message, meta)
  values (p_lead, auth.uid(), p_kind, p_message, coalesce(p_meta, '{}'));
  if p_lead is not null then
    update public.leads set last_activity_at = now() where id = p_lead;
  end if;
end $$;

create or replace function public.leads_before_update() returns trigger
language plpgsql as $$
begin
  if new.last_activity_at is distinct from old.last_activity_at
     and row(new.company, new.stage, new.locked, new.value, new.owner_id, new.summary)
         is not distinct from row(old.company, old.stage, old.locked, old.value, old.owner_id, old.summary) then
    return new; -- solo se está tocando last_activity_at
  end if;
  new.updated_at := now();
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
    if new.stage = 'confirmado' then new.confirmed_at := now(); end if;
  end if;
  if new.locked and not old.locked then
    new.locked_by := coalesce(auth.uid(), new.locked_by);
    new.locked_at := now();
  elsif not new.locked and old.locked then
    new.locked_by := null; new.locked_at := null; new.lock_reason := null;
  end if;
  return new;
end $$;

drop trigger if exists leads_before_update on public.leads;
create trigger leads_before_update before update on public.leads
  for each row execute function public.leads_before_update();

create or replace function public.leads_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity(new.id, 'created', 'Lead creado', jsonb_build_object('source', new.source));
    return new;
  end if;
  if new.stage is distinct from old.stage then
    perform public.log_activity(new.id, 'stage', 'Cambió de etapa',
      jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;
  if new.locked is distinct from old.locked then
    perform public.log_activity(new.id, case when new.locked then 'lock' else 'unlock' end,
      case when new.locked then 'Bloqueó la ficha' else 'Desbloqueó la ficha' end,
      jsonb_build_object('reason', new.lock_reason));
  end if;
  if new.owner_id is distinct from old.owner_id then
    perform public.log_activity(new.id, 'owner', 'Cambió el responsable',
      jsonb_build_object('to', new.owner_id));
  end if;
  if new.value is distinct from old.value or new.currency is distinct from old.currency then
    perform public.log_activity(new.id, 'value', 'Actualizó el valor estimado',
      jsonb_build_object('value', new.value, 'currency', new.currency));
  end if;
  return new;
end $$;

drop trigger if exists leads_after_change on public.leads;
create trigger leads_after_change after insert or update on public.leads
  for each row execute function public.leads_after_change();

create or replace function public.children_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
-- Nota: cada tabla tiene columnas distintas, por eso los IF van anidados
-- (plpgsql no permite referenciar new.<campo> de otra tabla en la misma expresión).
begin
  if tg_table_name = 'meetings' then
    if tg_op = 'INSERT' then
      perform public.log_activity(new.lead_id, 'meeting', 'Registró una reunión',
        jsonb_build_object('title', new.title, 'kind', new.kind, 'starts_at', new.starts_at));
    end if;
  elsif tg_table_name = 'proposals' then
    if tg_op = 'INSERT' then
      perform public.log_activity(new.lead_id, 'proposal', 'Agregó una ' || new.kind,
        jsonb_build_object('title', new.title, 'version', new.version, 'status', new.status));
    elsif new.status is distinct from old.status then
      perform public.log_activity(new.lead_id, 'proposal_status', 'Cambió el estado de una ' || new.kind,
        jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status));
    end if;
  elsif tg_table_name = 'notes' then
    if tg_op = 'INSERT' then
      perform public.log_activity(new.lead_id, 'note', 'Escribió una nota',
        jsonb_build_object('preview', left(new.body, 140)));
    end if;
  elsif tg_table_name = 'files' then
    if tg_op = 'INSERT' then
      perform public.log_activity(new.lead_id, 'file', 'Adjuntó un archivo',
        jsonb_build_object('name', new.name));
    end if;
  elsif tg_table_name = 'contacts' then
    if tg_op = 'INSERT' then
      perform public.log_activity(new.lead_id, 'contact', 'Agregó un contacto',
        jsonb_build_object('name', new.name));
    end if;
  elsif tg_table_name = 'tasks' then
    if tg_op = 'UPDATE' then
      if new.done and not old.done and new.lead_id is not null then
        perform public.log_activity(new.lead_id, 'task_done', 'Completó una tarea',
          jsonb_build_object('title', new.title));
      end if;
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['meetings','proposals','notes','files','contacts','tasks'] loop
    execute format('drop trigger if exists %I_after_change on public.%I', t, t);
    execute format('create trigger %I_after_change after insert or update on public.%I
                    for each row execute function public.children_after_change()', t, t);
  end loop;
end $$;

create or replace function public.tasks_before_update() returns trigger
language plpgsql as $$
begin
  if new.done and not old.done then new.done_at := now(); end if;
  if not new.done then new.done_at := null; end if;
  return new;
end $$;
drop trigger if exists tasks_before_update on public.tasks;
create trigger tasks_before_update before update on public.tasks
  for each row execute function public.tasks_before_update();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists proposals_touch on public.proposals;
create trigger proposals_touch before update on public.proposals
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 4. VISTA de resumen por lead (contadores de reuniones, propuestas…)
-- ---------------------------------------------------------------------
create or replace view public.lead_overview with (security_invoker = true) as
select
  l.*,
  (select count(*) from public.meetings m where m.lead_id = l.id and m.starts_at <= now())  as meetings_done,
  (select count(*) from public.meetings m where m.lead_id = l.id)                           as meetings_total,
  (select max(m.starts_at) from public.meetings m where m.lead_id = l.id and m.starts_at <= now()) as last_meeting_at,
  (select min(m.starts_at) from public.meetings m where m.lead_id = l.id and m.starts_at > now())  as next_meeting_at,
  (select count(*) from public.proposals p where p.lead_id = l.id)                          as proposals_total,
  (select count(*) from public.tasks t where t.lead_id = l.id and not t.done)               as open_tasks
from public.leads l;

-- ---------------------------------------------------------------------
-- 5. SEGURIDAD (RLS) · nadie fuera del equipo ve nada
-- ---------------------------------------------------------------------
alter table public.members   enable row level security;
alter table public.profiles  enable row level security;
alter table public.leads     enable row level security;
alter table public.contacts  enable row level security;
alter table public.meetings  enable row level security;
alter table public.proposals enable row level security;
alter table public.notes     enable row level security;
alter table public.tasks     enable row level security;
alter table public.files     enable row level security;
alter table public.activity  enable row level security;

do $$
declare t text; p record;
begin
  -- limpiar políticas previas para poder re-ejecutar
  for p in select policyname, tablename from pg_policies
           where schemaname = 'public'
             and tablename in ('members','profiles','leads','contacts','meetings','proposals','notes','tasks','files','activity')
  loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- members
create policy members_select on public.members for select to authenticated using (public.is_member());
create policy members_admin  on public.members for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (public.is_member());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- leads
create policy leads_select on public.leads for select to authenticated using (public.is_member());
create policy leads_insert on public.leads for insert to authenticated with check (public.can_write());
create policy leads_update on public.leads for update to authenticated
  using (public.can_write() and ((not locked) or locked_by = auth.uid() or public.is_admin()))
  with check (public.can_write());
create policy leads_delete on public.leads for delete to authenticated using (public.is_admin());

-- tablas hijas del lead
do $$
declare t text;
begin
  foreach t in array array['contacts','meetings','proposals','notes','files'] loop
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_member())', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.can_edit_lead(lead_id))', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.can_edit_lead(lead_id)) with check (public.can_edit_lead(lead_id))', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.can_edit_lead(lead_id))', t, t);
  end loop;
end $$;

-- tareas (pueden no tener lead)
create policy tasks_select on public.tasks for select to authenticated using (public.is_member());
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.can_write() and (lead_id is null or public.can_edit_lead(lead_id)));
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_write() and (lead_id is null or public.can_edit_lead(lead_id)))
  with check (public.can_write());
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.can_write() and (lead_id is null or public.can_edit_lead(lead_id)));

-- actividad: solo lectura (la escriben los triggers)
create policy activity_select on public.activity for select to authenticated using (public.is_member());

-- ---------------------------------------------------------------------
-- 6. STORAGE · bucket privado para propuestas, presentaciones, PDFs
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('tracker', 'tracker', false, 52428800)
on conflict (id) do nothing;

drop policy if exists tracker_read   on storage.objects;
drop policy if exists tracker_write  on storage.objects;
drop policy if exists tracker_update on storage.objects;
drop policy if exists tracker_delete on storage.objects;
create policy tracker_read   on storage.objects for select to authenticated using (bucket_id = 'tracker' and public.is_member());
create policy tracker_write  on storage.objects for insert to authenticated with check (bucket_id = 'tracker' and public.can_write());
create policy tracker_update on storage.objects for update to authenticated using (bucket_id = 'tracker' and public.can_write());
create policy tracker_delete on storage.objects for delete to authenticated using (bucket_id = 'tracker' and public.can_write());

-- ---------------------------------------------------------------------
-- 7. TIEMPO REAL · el pipeline se actualiza solo cuando otro mueve algo
-- ---------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.leads;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.activity;
  exception when duplicate_object then null; end;
end $$;

-- Listo. Siguiente paso: Authentication → Users → Add user (con clave y "Auto Confirm").
