-- =====================================================================
--  KOSMA TRACKER · 0005 · Publicar en Instagram + avisos por WhatsApp
--  Correr una vez en Supabase → SQL Editor. Se puede repetir sin dañar datos.
-- =====================================================================

-- Estado de la publicación en Instagram (lo maneja el servidor)
alter table public.content_posts add column if not exists auto_publish   boolean not null default false;
alter table public.content_posts add column if not exists ig_status      text;   -- creando · procesando · publicado · error
alter table public.content_posts add column if not exists ig_containers  jsonb;
alter table public.content_posts add column if not exists ig_media_id    text;
alter table public.content_posts add column if not exists ig_error       text;
alter table public.content_posts add column if not exists ig_started_at  timestamptz;

-- Credenciales y configuración de integraciones (solo el servidor las lee)
alter table public.integrations add column if not exists account_id text;
alter table public.integrations add column if not exists config     jsonb;
