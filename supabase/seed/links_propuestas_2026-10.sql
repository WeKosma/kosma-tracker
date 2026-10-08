-- =====================================================================
--  KOSMA TRACKER · Enlaces de propuestas encontrados en los chats
--  Completa links que faltaban y agrega las versiones web que no estaban.
--  Pegar en Supabase → SQL Editor → Run. Se puede correr más de una vez.
-- =====================================================================

do $$
declare
  tian uuid := (select id from public.profiles where email = 'tian@meroestudio.tv');
  jp   uuid;
  l    uuid;
  t0   timestamptz := now();
begin
  jp := coalesce((select id from public.profiles where email = 'perezalzatej@gmail.com'), tian);

  -- Nicolás Molina: el deck "This is the Galaxy" (Google Slides, 11-ago)
  update public.proposals
     set url = 'https://docs.google.com/presentation/d/1F6q619tUONXAri-Rf-BYC62Shhja2arjs7ObLwsVuVY/edit?usp=sharing'
   where title = 'This is the Galaxy by Kosma' and (url is null or url = '');

  -- Magno: versión web de la propuesta (27-ago)
  select id into l from public.leads where company = 'Magno Chocolates' order by created_at limit 1;
  if l is not null and not exists (select 1 from public.proposals where lead_id = l and url like '%kosma-magno.netlify.app%') then
    insert into public.proposals (lead_id, title, kind, version, status, amount, currency, sent_at, url, notes, created_by, created_at)
    values (l, 'Magno by Kosma · versión web', 'presentacion', 2, 'enviada', null, 'COP', null, 'https://kosma-magno.netlify.app/',
      'Versión web hecha por Sebastián el 27-ago, base de la presentación del 1-sep con Naty y su esposo. [por confirmar si se les compartió el link]', tian, '2026-08-27 19:22-05');
  end if;

  -- Grupo Logístico: primera versión web del blueprint (18-sep)
  select id into l from public.leads where company = 'Grupo Logístico' order by created_at limit 1;
  if l is not null and not exists (select 1 from public.proposals where lead_id = l and url like '%grupo-logistico-kosma.netlify.app%') then
    insert into public.proposals (lead_id, title, kind, version, status, amount, currency, sent_at, url, notes, created_by, created_at)
    values (l, 'Grupo Logístico · Discovery Blueprint (v1)', 'presentacion', 1, 'en_revision', null, 'COP', null, 'https://grupo-logistico-kosma.netlify.app/',
      'Primera versión web. Juan Pablo envió correcciones el 19-sep y de ahí salió la v2.', tian, '2026-09-18 19:24-05');
  end if;

  -- ESDECO: blueprint en Claude compartido antes de la presentación (10-sep)
  select id into l from public.leads where company = 'ESDECO' order by created_at limit 1;
  if l is not null and not exists (select 1 from public.proposals where lead_id = l and url like '%c9a984aa-cbb4-41e6-a948-be6d4b8bdab0%') then
    insert into public.proposals (lead_id, title, kind, version, status, amount, currency, sent_at, url, notes, created_by, created_at)
    values (l, 'ESDECO · Blueprint de la presentación (Claude)', 'presentacion', 1, 'borrador', null, 'COP', null,
      'https://claude.ai/code/artifact/c9a984aa-cbb4-41e6-a948-be6d4b8bdab0',
      'Compartido entre Juan Pablo y Sebastián el 10-sep. Base de la presentación del 14-sep. [por confirmar] Puede pedir iniciar sesión en Claude.', jp, '2026-09-10 11:57-05');
  end if;

  -- Discos Victoria: documento del proceso de Victoria Records (17-jul)
  select id into l from public.leads where company = 'Discos Victoria' order by created_at limit 1;
  if l is not null and not exists (select 1 from public.proposals where lead_id = l and url like '%1VC5ZfkLcyTzpKz4TxS4XRu5I7THqat_mxUYDPjSZ1k0%') then
    insert into public.proposals (lead_id, title, kind, version, status, amount, currency, sent_at, url, notes, created_by, created_at)
    values (l, 'Victoria Records · mapa del proceso', 'otro', 1, 'borrador', null, 'COP', null,
      'https://docs.google.com/document/d/1VC5ZfkLcyTzpKz4TxS4XRu5I7THqat_mxUYDPjSZ1k0/edit?usp=sharing',
      'Documento del proceso (release, agregador, Content ID) que sirvió de base para "Así te entendemos".', jp, '2026-07-17 13:30-05');
  end if;

  -- Innova: copia del blueprint en Claude (además de la web en Netlify)
  update public.proposals
     set notes = coalesce(notes || E'\n', '') || 'También en Claude: https://claude.ai/artifact/6mqjY5yqjtkcsAjJ5P6Q5p'
   where title = 'Innova 01 · Discovery Blueprint by Kosma' and coalesce(notes, '') not like '%6mqjY5yqjtkcsAjJ5P6Q5p%';

  -- El historial queda con la fecha real de cada documento (no la de hoy)
  update public.activity a
     set created_at = coalesce((select p.created_at from public.proposals p where p.lead_id = a.lead_id and p.title = a.meta->>'title' limit 1), a.created_at),
         actor_id = coalesce(a.actor_id, tian)
   where a.created_at = t0 and a.kind = 'proposal';

  update public.leads x set last_activity_at = greatest(
      x.stage_changed_at,
      coalesce((select max(m.starts_at) from public.meetings m where m.lead_id = x.id and m.starts_at <= now()), x.stage_changed_at),
      coalesce((select max(p.created_at) from public.proposals p where p.lead_id = x.id), x.stage_changed_at),
      coalesce((select max(n.created_at) from public.notes n where n.lead_id = x.id), x.stage_changed_at))
   where x.last_activity_at = t0;

  raise notice 'Enlaces de propuestas actualizados.';
end $$;
