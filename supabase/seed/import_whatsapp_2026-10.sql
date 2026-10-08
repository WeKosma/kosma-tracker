-- =====================================================================
--  KOSMA TRACKER · Importación inicial desde WhatsApp (grupo Kosma + chat Juan Pablo)
--  Fuente: conversaciones jun–oct 2026 + PDFs/DOCX de propuestas compartidos en el grupo.
--  Pegar completo en Supabase → SQL Editor → Run. Corre una sola vez (si ya se importó, se detiene).
--  Lo marcado [por confirmar] no estaba explícito en los chats: revisarlo en la ficha.
-- =====================================================================

do $$
declare
  tian uuid := (select id from public.profiles where email = 'tian@meroestudio.tv');
  jp   uuid;
  l uuid;
  t0 timestamptz := now();
begin
  if exists (select 1 from public.leads where 'importado-whatsapp' = any(tags)) then
    raise exception 'Esta importación ya se corrió (hay leads con la etiqueta importado-whatsapp).';
  end if;
  if tian is null then
    raise exception 'No existe el usuario tian@meroestudio.tv en el tracker. Crea el usuario primero.';
  end if;
  jp := coalesce((select id from public.profiles where email = 'perezalzatej@gmail.com'), tian);

  -- ───────────────────────────────────────────────────────────── 1. ESDECO
  insert into public.leads (company, contact_name, contact_role, industry, country, source, service, stage, priority,
    value, currency, owner_id, tags, summary, next_action, next_action_date, created_at, stage_changed_at)
  values ('ESDECO', 'Oscar', 'Decisor [cargo por confirmar]', 'Construcción', 'Colombia', 'otro', 'Sistemas conectados',
    'propuesta', 'alta', 128000000, 'COP', jp, array['construcción','importado-whatsapp'],
    'Constructora. Discovery el 7-sep con el equipo (Oscar + colaboradoras) y presentación el 14-sep. Necesidades: cotizar con margen, aprender de cada obra, digitalizar documentos, trabajo simultáneo con trazabilidad, alertas y armado de paquetes. Alcance v1 acordado: 20–25 usuarios jerarquizados, sin Recursos Humanos, registro de clientes sin leads/oportunidades. Juan Pablo lo describió como "el mejor posible cliente que hemos tenido". Precio enviado solo a Oscar por correo (no frente al equipo). Pagos 50/50.',
    'Seguimiento con Oscar: decisión sobre Fase 1 (Portal)', '2026-10-06', '2026-09-07 09:00-05', '2026-09-15 17:00-05')
  returning id into l;
  insert into public.contacts (lead_id, name, role, notes) values
    (l, 'Oscar', 'Decisor', 'Pedir apellido, correo y teléfono. Amaury sugirió firmar acuerdo de confidencialidad para que compartan sus Excel.');
  insert into public.meetings (lead_id, title, kind, mode, starts_at, duration_min, attendees, summary, created_by) values
    (l, 'Discovery con la constructora', 'discovery', 'virtual', '2026-09-07 09:00-05', 60, 'Oscar + equipo ESDECO · Juan Pablo, Amaury, Sebastián', 'Primera reunión. Se conectó el agente de IA para la intro. Pendiente: acceso a sus Excel para estructurar propuesta viable y ajustar precio.', jp),
    (l, 'Presentación de propuesta', 'presentacion', 'virtual', '2026-09-14 09:30-05', 60, 'Oscar + 2 personas del equipo', 'Se presentaron las 3 fases. Ajustes: 20–25 usuarios, sin RR.HH., portal operativo 10–12 semanas. Precio por correo solo a Oscar.', jp);
  insert into public.proposals (lead_id, title, kind, version, status, amount, currency, sent_at, url, notes, created_by, created_at) values
    (l, 'ESDECO by Kosma · Technical Quotation', 'propuesta', 1, 'enviada', 128000000, 'COP', '2026-09-15',
     'https://esdeco-kosma-propuesta.jotapol.chatgpt.site/',
     'Fase 1 Portal $45M (10–12 sem) · Fase 2 Data & Information $35M · Fase 3 Project Intel $48M · Kosma Operations $3,5M/mes. Vigencia 60 días, sin IVA, 50/50 por fase. PDF de 24 págs en el grupo de WhatsApp.', jp, '2026-09-15 17:22-05');
  insert into public.notes (lead_id, body, pinned, author_id, created_at) values
    (l, 'Precio y condiciones solo con Oscar. Siguiente paso natural: cerrar Fase 1 y arrancar con acceso a los Excel de obras.', true, jp, '2026-09-15 18:00-05');

  -- ───────────────────────────────────────────────────────────── 2. FLAPX
  insert into public.leads (company, industry, country, source, service, stage, priority, value, currency, owner_id, tags,
    summary, next_action, next_action_date, created_at, stage_changed_at)
  values ('Flapx', 'Asesoría de visas [por confirmar]', 'Colombia', 'otro', 'Sistemas conectados', 'propuesta', 'alta',
    15000000, 'COP', jp, array['whatsapp','hubspot','importado-whatsapp'],
    'Atienden por varias líneas de WhatsApp (B2Chat) y usan HubSpot; hay doble digitación de prospecto a cliente/caso y la conversación se cierra cuando el caso sale aprobado o negado. Propuesta: centralizar WhatsApp, conectar B2Chat con HubSpot y un portal con funnel y siguiente acción. Amaury propuso que la Fase 1 podría bajar a $2–3M para entrar y ganar la mensualidad.',
    'Respuesta a la cotización y definir arranque de Fase 1', '2026-10-05', '2026-09-08 19:00-05', '2026-09-22 19:00-05')
  returning id into l;
  insert into public.meetings (lead_id, title, kind, mode, starts_at, duration_min, summary, created_by) values
    (l, 'Flapx by Kosma · presentación de oportunidades', 'presentacion', 'virtual', '2026-09-10 15:30-05', 60, 'Se presentó el blueprint web. Según Juan Pablo "nos fue bien". Quedó pendiente la cotización.', jp),
    (l, 'Seguimiento a la cotización', 'seguimiento', 'virtual', '2026-09-30 17:00-05', 45, null, jp);
  insert into public.proposals (lead_id, title, kind, version, status, amount, currency, sent_at, url, notes, created_by, created_at) values
    (l, 'Flapx 01 by Kosma · Discovery Blueprint', 'presentacion', 1, 'enviada', null, 'COP', '2026-09-10', 'https://flapx-01-by-kosma.jotapol.chatgpt.site/', 'Blueprint de oportunidades presentado en la reunión.', jp, '2026-09-10 07:10-05'),
    (l, 'Flapx x Kosma · Technical Quotation', 'cotizacion', 1, 'enviada', 15000000, 'COP', '2026-09-22', null,
     'Fase 1 Connect $5M (4–5 sem) · Fase 2 Continuity $10M (5–6 sem) · Kosma Operations $1M/mes. OJO: en el PDF las condiciones dicen "ESDECO" en vez de Flapx (copiado de la otra propuesta). Corregir si se reenvía.', jp, '2026-09-22 19:12-05');

  -- ───────────────────────────────────────────────────────────── 3. GRUPO LOGÍSTICO
  insert into public.leads (company, contact_name, contact_email, contact_role, website, industry, city, country, source, service,
    stage, priority, value, currency, owner_id, tags, summary, next_action, next_action_date, created_at, stage_changed_at)
  values ('Grupo Logístico', 'Lina Granados', 'lina@grupo-logistico.com', 'Directora de mercadeo', 'grupo-logistico.com',
    'Eventos corporativos', null, 'Colombia', 'red', 'IA aplicada', 'propuesta', 'media', 7000000, 'COP', tian,
    array['eventos','importado-whatsapp'],
    'Eventos corporativos (activaciones, stands, congresos) con diseño, producción, montaje y bodega propios. El conocimiento vive en Excel, Drive, correo y WhatsApp de personas clave. 3 oportunidades consolidadas: memoria de proyectos (cotizar sin empezar de cero), bodega consultable / inventario vivo y continuidad operativa entre equipos (+ filtro de viabilidad de diseños hechos con IA). Brief/Debrief descartado por no ser dolor suficiente.',
    'Conseguir nueva fecha con Lina para presentar (la del 28-sep se movió)', '2026-10-05', '2026-09-11 09:00-05', '2026-09-16 12:00-05')
  returning id into l;
  insert into public.contacts (lead_id, name, role) values
    (l, 'Nicolás', 'Director general'),
    (l, 'Sandra', 'Coordinación de proveedores');
  insert into public.proposals (lead_id, title, kind, version, status, amount, currency, sent_at, url, notes, created_by, created_at) values
    (l, 'Biblioteca Operativa + Asistente de WhatsApp', 'propuesta', 1, 'borrador', 7000000, 'COP', null, null,
     'Fase 1 Biblioteca + Portal $4M (4–5 sem) · Fase 2 Asistente interno de WhatsApp $3M (3–4 sem) · Continuidad $1M/mes + IVA.', tian, '2026-09-16 12:06-05'),
    (l, 'Grupo Logístico · Discovery Blueprint (v2)', 'presentacion', 2, 'borrador', null, 'COP', null, 'https://grupologisticopropuesta2.netlify.app/',
     'Versión web con las 3 oportunidades consolidadas. Pendiente correcciones de Juan Pablo (deslizador y espacios).', tian, '2026-09-29 11:51-05');

  -- ───────────────────────────────────────────────────────────── 4. LEMON JOY EVENTS
  insert into public.leads (company, contact_name, contact_email, contact_role, website, industry, country, source, service,
    stage, priority, value, currency, owner_id, tags, summary, next_action, next_action_date, created_at, stage_changed_at)
  values ('Lemon Joy Events', 'Valerie', null, 'CEO', 'lemonjoyevents.com', 'Eventos corporativos para marcas de lujo',
    'Estados Unidos', 'red', 'Operación + automatización', 'propuesta', 'media', 39000, 'USD', tian,
    array['eventos','cliente-mero','importado-whatsapp'],
    'Agencia B2B de eventos corporativos con pocos clientes grandes recurrentes. También es cliente de animación de MERO (paquete aparte, ~USD 3k). Trabajan sobre Google Workspace/Slides. Discovery conducido con el agente de voz "Charlie". Amaury no veía una solución de precio justificable; Juan Pablo identificó 5 oportunidades. Tras enviar la propuesta no respondieron (posible susto por precio).',
    'Escribir directamente a la dueña por correo', '2026-10-05', '2026-09-08 11:16-05', '2026-09-23 12:00-05')
  returning id into l;
  insert into public.contacts (lead_id, name, role, email, notes) values
    (l, 'Diana Agudelo', 'Contacto MERO (animación)', 'dagudelo@lemonjoyevents.com', 'Ya no lleva el proceso, está full.'),
    (l, 'Melissa Rodríguez', 'Equipo Lemon Joy', 'mrodriguez@lemonjoyevents.com', 'Tomó el proyecto del reel.'),
    (l, 'Natalia', 'Participó en el discovery', null, null);
  insert into public.meetings (lead_id, title, kind, mode, starts_at, duration_min, attendees, summary, created_by) values
    (l, 'Discovery Lemon Joy', 'discovery', 'virtual', '2026-09-10 13:00-05', 60, 'Natalia, Diana, Valerie · Sebastián + agente Charlie', null, tian);
  insert into public.proposals (lead_id, title, kind, version, status, amount, currency, sent_at, url, notes, created_by, created_at) values
    (l, 'Portal Operativo, Memoria de Proyectos e Inteligencia Operativa', 'propuesta', 1, 'enviada', 39000, 'USD', '2026-09-23',
     'https://lemonjoy-kosma.netlify.app/', 'Fase 1 USD 12.000 · Fase 2 USD 11.000 · Fase 3 USD 16.000 (12–14 sem c/u, 36–42 sem total).', tian, '2026-09-23 11:56-05');

  -- ───────────────────────────────────────────────────────────── 5. MAGNO CHOCOLATES
  insert into public.leads (company, contact_name, contact_role, website, industry, country, source, service, stage, priority,
    value, currency, owner_id, tags, summary, next_action, next_action_date, created_at, stage_changed_at)
  values ('Magno Chocolates', 'Naty', 'Dueña', 'magnochocolates.com', 'Chocolatería premium / regalos corporativos', 'Colombia',
    'red', 'Sistemas conectados', 'propuesta', 'media', 37000000, 'COP', jp, array['retail','importado-whatsapp'],
    'Arrancó como propuesta en frío (la esposa de Juan Pablo conoce el proceso de una chocolatería). Usan Qenti, Shopify, B2Chat y Excel por ciudad. Dolores: claridad de pedidos y entregas (fecha de pago ≠ fecha de entrega), información fragmentada y validación manual de pagos contra Bancolombia. Propuesta "Centro Operativo Magno" en 3 fases. Se produjo un video situacional ("La conversación que no podía esperar"). Valor = punto medio de los rangos.',
    'Llamar a Naty: sin respuesta desde el 8-sep', '2026-10-05', '2026-08-24 18:56-05', '2026-09-08 12:17-05')
  returning id into l;
  insert into public.meetings (lead_id, title, kind, mode, starts_at, duration_min, attendees, created_by) values
    (l, 'Presentación con la dueña y su esposo', 'presentacion', 'virtual', '2026-09-01 16:00-05', 60, 'Naty (dueña) + esposo · Juan Pablo, Amaury', jp);
  insert into public.proposals (lead_id, title, kind, version, status, amount, currency, sent_at, url, notes, created_by, created_at) values
    (l, 'Magno by Kosma · propuesta en frío', 'presentacion', 1, 'enviada', null, 'COP', '2026-08-24', 'https://magno-by-kosma.jotapol.chatgpt.site/magno', 'Primera iteración comercial enviada en frío.', jp, '2026-08-24 18:56-05'),
    (l, 'Propuesta Magno · Centro Operativo', 'propuesta', 2, 'enviada', null, 'COP', '2026-09-08', null,
     'Fase 1 $12–15M COP (o USD 5k) + $1M/mes · Fase 2 $8–12M · Fase 3 $12–15M. Base técnica: propuesta de Amaury (alternativas A/B de $1,5M a $20M).', jp, '2026-09-08 12:17-05');

  -- ───────────────────────────────────────────────────────────── 6. INNOVA
  insert into public.leads (company, contact_name, industry, country, source, service, stage, priority, owner_id, tags,
    summary, next_action, next_action_date, created_at, stage_changed_at)
  values ('Innova', 'Pablo', 'Seguros (asesoría / corretaje)', 'Colombia', 'red', 'IA aplicada', 'propuesta', 'media', jp,
    array['seguros','importado-whatsapp'],
    'Discovery presencial el 17-sep. Oportunidades: inteligencia de cotización (comparar alternativas de aseguradoras: precio, coberturas, condiciones), formación de asesores, conocimiento y una línea de reinversión → recompra con lógica de e-commerce. Narrativa: ayudar a Innova a vender más seguros y crear ingresos recurrentes. Su blueprint es la referencia estructural de las demás propuestas.',
    'Seguimiento a Pablo sobre el blueprint', '2026-10-05', '2026-09-16 22:00-05', '2026-09-18 15:00-05')
  returning id into l;
  insert into public.meetings (lead_id, title, kind, mode, starts_at, duration_min, attendees, created_by) values
    (l, 'Discovery presencial Innova', 'discovery', 'presencial', '2026-09-17 15:00-05', 90, 'Pablo · Juan Pablo, Sebastián', jp);
  insert into public.proposals (lead_id, title, kind, version, status, amount, currency, sent_at, url, notes, created_by, created_at) values
    (l, 'Innova 01 · Discovery Blueprint by Kosma', 'presentacion', 1, 'enviada', null, 'COP', '2026-09-18', 'https://innovaxkosma.netlify.app/', 'Sin cifras de inversión todavía.', jp, '2026-09-18 15:00-05');

  -- ───────────────────────────────────────────────────────────── 7. SOLUGISTIK
  insert into public.leads (company, contact_name, contact_email, website, industry, country, source, stage, priority, owner_id, tags,
    summary, next_action, next_action_date, created_at, stage_changed_at)
  values ('Solugistik', 'Juan Hoyos', 'juan.hoyos@solugistik.com', 'solugistik.com', 'Logística', 'Colombia', 'red', 'discovery', 'media',
    jp, array['logística','importado-whatsapp'],
    'Contacto traído por Sebastián. Reunión agendada el jueves 24-sep 3 pm. Juan Pablo está trabajando la propuesta (29-sep).',
    'Terminar y enviar propuesta', '2026-10-07', '2026-09-23 10:32-05', '2026-09-24 15:00-05')
  returning id into l;
  insert into public.contacts (lead_id, name, email, role) values
    (l, 'Juan Villa', 'juan.villa@solugistik.com', null),
    (l, 'Área comercial', 'comercial@solugistik.com', 'Correo general');
  insert into public.meetings (lead_id, title, kind, mode, starts_at, duration_min, attendees, summary, created_by) values
    (l, 'Discovery Solugistik', 'discovery', 'virtual', '2026-09-24 15:00-05', 60, 'Juan Hoyos, Juan Villa', '[por confirmar que se realizó en esta fecha]', tian);

  -- ───────────────────────────────────────────────────────────── 8. ATRYS HEALTH (CHILE)
  insert into public.leads (company, contact_name, contact_email, industry, country, source, stage, priority, owner_id, tags,
    summary, next_action, next_action_date, created_at, stage_changed_at)
  values ('Atrys Health', 'M. Gallegos', 'mgallegos@atryshealth.com', 'Salud', 'Chile', 'red', 'discovery', 'media', tian,
    array['salud','chile','importado-whatsapp'],
    'Contacto de Sebastián. Primera reunión de acercamiento con Juan Pablo: quería saber qué hace KOSMA y hasta dónde podría llegar. Quedó hacerle seguimiento la semana siguiente. Juan Pablo ve bastante potencial de leads en Chile.',
    'Seguimiento (quedó pendiente desde mediados de sept)', '2026-10-05', '2026-09-04 14:17-05', '2026-09-09 10:00-05')
  returning id into l;
  insert into public.meetings (lead_id, title, kind, mode, starts_at, duration_min, attendees, summary, created_by) values
    (l, 'Discovery Atrys Health', 'discovery', 'virtual', '2026-09-09 09:00-05', 60, 'M. Gallegos · Juan Pablo', 'Reunión de acercamiento. Sebastián no pudo entrar.', jp);

  -- ───────────────────────────────────────────────────────────── 9. NIYVAL
  insert into public.leads (company, contact_name, website, country, source, stage, priority, owner_id, tags,
    summary, next_action, next_action_date, created_at, stage_changed_at)
  values ('Niyval', 'Luis Miguel Valera', 'niyval.com', 'Colombia', 'red', 'contactado', 'baja', tian,
    array['importado-whatsapp'],
    'Contacto compartido por Sebastián en julio. Reunión "Niyval & AutoMate" el 15-jul. Desde entonces sin respuesta (26-ago: "nada, le escribo").',
    'Retomar contacto o marcar como perdido', '2026-10-09', '2026-07-14 18:44-05', '2026-07-15 15:00-05')
  returning id into l;
  insert into public.meetings (lead_id, title, kind, mode, starts_at, duration_min, created_by) values
    (l, 'Niyval & AutoMate', 'discovery', 'virtual', '2026-07-15 14:00-05', 60, tian);

  -- ───────────────────────────────────────────────────────────── 10. DISCOS VICTORIA
  insert into public.leads (company, contact_name, industry, city, country, source, service, stage, priority, owner_id, tags,
    summary, next_action, next_action_date, created_at, stage_changed_at)
  values ('Discos Victoria', 'Julián', 'Música / catálogo discográfico', 'La Ceja', 'Colombia', 'red', 'IA aplicada', 'discovery', 'baja',
    tian, array['música','importado-whatsapp'],
    'Primer prospecto del equipo (cuando era Auto-Mate). Catálogo de más de 17 mil canciones. Oportunidades: generador de videos, limpieza de duplicados / detección de contenido (Content ID), publicador masivo y agentes para agregadores. Se le envió el documento "Así te entendemos" con preguntas técnicas; Julián nunca respondió.',
    'Último intento de seguimiento o marcar perdido', '2026-10-09', '2026-07-02 11:05-05', '2026-07-10 17:00-05')
  returning id into l;
  insert into public.meetings (lead_id, title, kind, mode, starts_at, duration_min, location, attendees, created_by) values
    (l, 'Visita de discovery en La Ceja', 'discovery', 'presencial', '2026-07-10 15:00-05', 120, 'La Ceja, Antioquia', 'Julián · Juan Pablo, Sebastián', tian);
  insert into public.proposals (lead_id, title, kind, version, status, amount, currency, sent_at, notes, created_by, created_at) values
    (l, 'Discos Victoria · Así te entendemos', 'presentacion', 1, 'enviada', null, 'COP', '2026-07-24', 'Mapa del proceso (release → agregador → Content ID → reclamos) + preguntas técnicas para cotizar. Sin respuesta.', jp, '2026-07-24 18:04-05');

  -- ───────────────────────────────────────────────────────────── 11. NICOLÁS MOLINA (perdido)
  insert into public.leads (company, contact_name, industry, country, source, service, stage, priority, value, currency, owner_id, tags,
    summary, lost_reason, created_at, stage_changed_at)
  values ('Agencia de cobro / líneas de crédito NY [nombre por confirmar]', 'Nicolás Molina', 'Cobranza y crédito', 'Estados Unidos',
    'red', 'IA aplicada', 'perdido', 'alta', 50000, 'USD', jp, array['agente-de-voz','importado-whatsapp'],
    'Agente de voz para llamadas salientes que reemplace a los "filipinos" que califican y calientan (~8 min) antes de pasar al closer. ~400 agentes, USD 5–7/h + comisiones, cierre medio de USD 20k. Querían voces clonadas de sus 3 closers, integración con RingCentral y medir transferidas vs. llamadas totales. Se hizo demo y propuesta formal (6 meses). Valor = referencia interna mínima (Amaury: no bajar de USD 40k).',
    'Prefieren una empresa con más trayectoria en este tipo de construcción', '2026-08-06 18:05-05', '2026-08-24 19:32-05')
  returning id into l;
  insert into public.meetings (lead_id, title, kind, mode, starts_at, duration_min, attendees, summary, created_by) values
    (l, 'Reunión preliminar agente de IA', 'discovery', 'virtual', '2026-08-12 18:45-05', 105, 'Nicolás Molina · Juan Pablo',
     'Transcripción en Tactiq (PDF en el grupo). Pidió mockup o video, no demo en vivo. Duda clave: ¿la IA es capaz de cerrar?', jp);
  insert into public.proposals (lead_id, title, kind, version, status, amount, currency, sent_at, url, notes, created_by, created_at) values
    (l, 'This is the Galaxy by Kosma', 'presentacion', 1, 'enviada', null, 'USD', '2026-08-12', null, 'Presentación de niveles (Galaxia) usada en la reunión.', jp, '2026-08-13 17:42-05'),
    (l, 'Propuesta formal · Agente conversacional de voz', 'cotizacion', 1, 'rechazada', null, 'USD', '2026-08-20',
     'https://kosma-nicolas-molina-proposal.jotapol.chatgpt.site', 'Plan de 6 meses. Seguimiento USD 5k/mes (Amaury sugirió 3k). Monto total por confirmar en el link.', jp, '2026-08-20 10:44-05');

  -- ───────────────────────────────────────────────────────────── 12. MARCUS · trading bot (perdido)
  insert into public.leads (company, contact_name, contact_email, industry, country, source, stage, priority, owner_id, tags,
    summary, lost_reason, created_at, stage_changed_at)
  values ('Marcus · bot de trading', 'Marcus', 'msims82696@aol.com', 'Trading personal', 'Estados Unidos', 'red', 'perdido', 'baja', tian,
    array['inglés','importado-whatsapp'],
    'Conocido de Sebastián. Quería automatizar la detección de patrones de triángulo (compression theory) y ejecutar trades en cTrader. Prefería equipo local a un freelancer de Fiverr. Reunión en inglés.',
    'No era el momento: primero va a aprender cTrader (meses)', '2026-09-25 19:04-05', '2026-09-29 13:59-05');

  -- ───────────────────────────────────────────────────────────── 13. BDO COLOMBIA
  insert into public.leads (company, website, industry, country, source, stage, priority, owner_id, tags,
    summary, next_action, next_action_date, created_at, stage_changed_at)
  values ('BDO Colombia', 'linkedin.com/company/bdo-en-colombia', 'Auditoría y consultoría', 'Colombia', 'red', 'contactado', 'media', jp,
    array['importado-whatsapp'],
    'Juan Pablo tenía reunión con uno de los socios a inicios de agosto [resultado por confirmar]. Para esa reunión se impulsó tener web/landing de KOSMA.',
    'Confirmar resultado de la reunión con el socio', '2026-10-06', '2026-07-29 12:27-05', '2026-08-06 12:00-05');

  -- ───────────────────────────────────────────────────────────── 14. ECOPETROL (vía agencia)
  insert into public.leads (company, industry, country, source, stage, priority, owner_id, tags,
    summary, next_action, next_action_date, created_at, stage_changed_at)
  values ('Ecopetrol (vía agencia aliada)', 'Energía', 'Colombia', 'referido', 'nuevo', 'alta', tian,
    array['referido','importado-whatsapp'],
    'Una agencia tiene contacto directo con alguien que acaba de asumir un cargo importante en Ecopetrol. Discovery "al revés": no partimos de un dolor sino de qué proponerle para que llegue impactando en su nuevo cargo.',
    'Preparar e investigar antes del discovery con la agencia', '2026-10-06', '2026-09-30 10:20-05', '2026-09-30 10:20-05');

  -- ───────────────────────────────────────────────────────────── 15. AVIACIÓN PRIVADA (contacto griego)
  insert into public.leads (company, industry, source, stage, priority, owner_id, tags, summary, next_action, created_at, stage_changed_at)
  values ('Prospecto aviación privada [nombre por confirmar]', 'Aviación privada / charter', 'red', 'nuevo', 'baja', jp,
    array['importado-whatsapp'],
    'Juan Pablo conoció el 20-sep a un empresario griego con un reto de muchas barreras técnicas del sector; consultando con un amigo piloto. Referencias compartidas: Amalfi Jets y Avinode.',
    'Validar viabilidad técnica con Amaury y conseguir datos del contacto', '2026-09-20 21:45-05', '2026-09-20 21:45-05');

  -- ───────────────────────────────────────────────────────────── 16. MERO ESTUDIO (interno)
  insert into public.leads (company, contact_name, industry, city, country, source, service, stage, priority, owner_id, tags,
    summary, next_action, created_at, stage_changed_at)
  values ('MERO Estudio (proyecto interno)', 'Sebastián Escobar', 'Animación 2D', 'Medellín', 'Colombia', 'red', 'Operación + automatización',
    'discovery', 'baja', tian, array['interno','importado-whatsapp'],
    'Automatizar el pipeline completo de MERO (prospección → postventa). Se redactó NDA MERO–KOSMA (firmas como personas naturales). MERO no tiene presupuesto para desarrollo: definir si es viable o es solo inversión de tiempo; sirve como caso propio.',
    'Definir viabilidad y modelo (caso propio vs. proyecto pago)', '2026-08-11 20:46-05', '2026-08-11 20:46-05');

  -- ─────────────────────────────────────────────────────────────
  -- Historial: las acciones importadas quedan a nombre de Sebastián y con su fecha real
  update public.activity a set
    actor_id = coalesce(a.actor_id, tian),
    created_at = case a.kind
      when 'meeting' then coalesce((a.meta->>'starts_at')::timestamptz, a.created_at)
      when 'created' then (select x.created_at from public.leads x where x.id = a.lead_id)
      when 'proposal' then coalesce((select p.created_at from public.proposals p where p.lead_id = a.lead_id and p.title = a.meta->>'title' limit 1), a.created_at)
      when 'contact' then (select x.created_at from public.leads x where x.id = a.lead_id)
      when 'note' then coalesce((select n.created_at from public.notes n where n.lead_id = a.lead_id order by n.created_at desc limit 1), a.created_at)
      else (select x.stage_changed_at from public.leads x where x.id = a.lead_id)
    end
  where a.created_at = t0;

  -- Última actividad real de cada lead importado
  update public.leads x set last_activity_at = greatest(
      x.stage_changed_at,
      coalesce((select max(m.starts_at) from public.meetings m where m.lead_id = x.id and m.starts_at <= now()), x.stage_changed_at),
      coalesce((select max(p.created_at) from public.proposals p where p.lead_id = x.id), x.stage_changed_at))
  where 'importado-whatsapp' = any(x.tags);

  raise notice 'Importación lista: 16 leads.';
end $$;
