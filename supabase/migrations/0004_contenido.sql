-- =====================================================================
--  KOSMA TRACKER · 0004 · Parrillas de contenido
--  Publicaciones por día, artes (imagen/video) con versiones, feedback y aprobación.
--  Correr una vez en Supabase → SQL Editor. Se puede repetir sin dañar datos.
-- =====================================================================

create table if not exists public.content_posts (
  id               uuid primary key default gen_random_uuid(),
  brand            text not null default 'KOSMA',
  title            text not null,
  publish_at       timestamptz not null,
  platforms        text[] not null default '{instagram}',
  format           text not null default 'post'
                   check (format in ('post','carrusel','reel','historia','video','articulo','otro')),
  pillar           text,
  caption          text,
  hashtags         text,
  status           text not null default 'idea'
                   check (status in ('idea','diseno','revision','cambios','aprobado','programado','publicado')),
  owner_id         uuid references public.profiles(id) on delete set null,
  lead_id          uuid references public.leads(id) on delete set null,
  published_url    text,
  approved_by      uuid references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  created_by       uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists content_posts_date_idx on public.content_posts(publish_at);

create table if not exists public.content_media (
  id             uuid primary key default gen_random_uuid(),
  post_id        uuid not null references public.content_posts(id) on delete cascade,
  version        int not null default 1,
  position       int not null default 0,
  is_current     boolean not null default true,
  name           text,
  mime           text,
  size_bytes     bigint,
  path           text,          -- archivo en el bucket "tracker"
  url            text,          -- o enlace externo (Drive, Frame.io, YouTube…)
  drive_file_id  text,          -- copia en el Drive de KOSMA
  drive_url      text,
  uploaded_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now()
);
create index if not exists content_media_post_idx on public.content_media(post_id, version, position);

create table if not exists public.content_comments (
  id             uuid primary key default gen_random_uuid(),
  post_id        uuid not null references public.content_posts(id) on delete cascade,
  author_id      uuid references public.profiles(id) on delete set null default auth.uid(),
  kind           text not null default 'comment' check (kind in ('comment','approve','changes','system')),
  body           text,
  media_version  int,
  created_at     timestamptz not null default now()
);
create index if not exists content_comments_post_idx on public.content_comments(post_id, created_at);

-- updated_at automático
create or replace function public.content_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists content_posts_touch on public.content_posts;
create trigger content_posts_touch before update on public.content_posts for each row execute function public.content_touch();

-- Seguridad: todo el equipo ve; editores y admins crean y editan
alter table public.content_posts    enable row level security;
alter table public.content_media    enable row level security;
alter table public.content_comments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['content_posts','content_media','content_comments'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select to authenticated using (public.is_member())', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated using (public.can_write()) with check (public.can_write())', t);
    execute format('grant select, insert, update, delete on public.%1$s to authenticated', t);
  end loop;
end $$;

-- Tiempo real (la parrilla se actualiza sola en todos los computadores)
do $$
begin
  begin alter publication supabase_realtime add table public.content_posts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.content_comments; exception when duplicate_object then null; end;
end $$;
