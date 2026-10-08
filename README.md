# KOSMA Tracker

Sistema interno de KOSMA para seguir leads, clientes, reuniones, propuestas y cierres.
Next.js 16 + Supabase (base de datos, login y archivos) + Netlify + notificaciones por Gmail.

---

## Qué hace

| Módulo | Qué tiene |
|---|---|
| **Inicio** | Pipeline activo, confirmados del mes, reuniones del mes, tasa de cierre, embudo por etapa, próximas reuniones, tareas, leads que se están enfriando (14+ días sin movimiento) y actividad del equipo. |
| **Pipeline** | Tablero Kanban (arrastrar entre etapas) y vista de tabla con orden, filtros (responsable, origen, prioridad, etapa), búsqueda y exportar a CSV. |
| **Ficha del lead** | Datos completos, barra de etapas, próxima acción con fecha, personas de contacto, reuniones (con contador y botón para agendar en Google Calendar), propuestas y presentaciones con versiones y estados, notas fijables, tareas, archivos (subida directa o enlaces de Drive) e historial automático de todo lo que pasa. |
| **Bloqueo** | Cualquier editor puede bloquear una ficha. Mientras esté bloqueada, solo esa persona y los admins pueden editarla. Lo hace cumplir la base de datos, no solo la pantalla. |
| **Agenda** | Reuniones del tracker + eventos del Google Calendar de hello@wearekosma.com, por día. Los eventos sin lead se pueden vincular a un lead con un clic (sugiere el lead por el correo de los invitados). Tareas vencidas y próximas, filtro "solo lo mío". |
| **Google Calendar** | Al registrar una reunión se crea el evento en el Calendar de hello@ con enlace de Google Meet e invitación a los correos del cliente. Editarla actualiza el evento; borrarla lo cancela y avisa a los invitados. |
| **Equipo** | Lista blanca de correos con acceso y roles (Admin, Editor, Lector). Los admins dan acceso y generan claves temporales. |
| **Correos** | Desde hello@wearekosma.com al equipo: cuando entra un lead nuevo y cuando un lead pasa a Confirmado. Salen por la cuenta de Google conectada (o por contraseña de aplicación si se configura). |
| **Extras** | Búsqueda global `⌘K`, atajo `N` para nuevo lead, tema claro/oscuro, tiempo real (si alguien mueve algo, tu pantalla se actualiza sola), responsive. |
| **Entrada desde la web** | `POST /api/intake` para que el formulario o el agente de wearekosma.com creen leads solos (opcional). |

---

## Puesta en marcha (una sola vez)

### 1. Base de datos en Supabase (5 min)

1. Abre tu proyecto en supabase.com → **SQL Editor** → **New query**.
2. Pega todo el contenido de `supabase/migrations/0001_kosma_tracker.sql` y dale **Run**.
   Debe terminar sin errores. Se puede volver a correr sin dañar datos.
   *(Si prefieres la CLI: `supabase link --project-ref ekricybrubtjpdjkgjct` y luego `supabase db push`.)*
3. **Authentication → Sign In / Providers → Email**: desactiva **Allow new users to sign up**. Así nadie se puede registrar solo.
4. **Authentication → URL Configuration**:
   - Site URL: `https://kosma-tracker.netlify.app`
   - Redirect URLs: agrega `https://kosma-tracker.netlify.app/**`
5. **Authentication → Users → Add user → Create new user**:
   - Email: `tian@meroestudio.tv`, tu clave, y marca **Auto Confirm User**.
   - Los otros dos los creas igual, o después desde la sección **Equipo** del tracker (genera una clave temporal).

> La base de datos solo acepta usuarios cuyo correo esté en la tabla `members`. Ya vienen cargados:
> tian@meroestudio.tv, hello@wearekosma.com y perezalzatej@gmail.com (los tres como admin).

### 2. Código en GitHub

1. Crea un repo **privado** `WeKosma/kosma-tracker`.
2. Sube todo el contenido de esta carpeta (incluye los archivos ocultos `.gitignore` y `.env.example`; en Mac se ven con `Cmd + Shift + .`).
   Nunca subas un archivo `.env` con claves reales.

### 3. Netlify

1. **Add new project → Import an existing project → GitHub →** `kosma-tracker`.
2. Nombre del sitio: `kosma-tracker` (queda en `https://kosma-tracker.netlify.app`).
3. La configuración de build ya viene en `netlify.toml`. No cambies nada.
4. **Environment variables** (Site configuration → Environment variables). Marca como *secret* las que dicen secreta:

| Variable | Valor | |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ekricybrubtjpdjkgjct.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` | |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` | **secreta** |
| `APP_URL` | `https://kosma-tracker.netlify.app` | |
| `GMAIL_USER` | `hello@wearekosma.com` | |
| `GMAIL_APP_PASSWORD` | la contraseña de aplicación de 16 letras | **secreta** |
| `GOOGLE_CLIENT_ID` | de Google Cloud (ver sección Google) | |
| `GOOGLE_CLIENT_SECRET` | de Google Cloud | **secreta** |
| `INTAKE_SECRET` | texto largo aleatorio (solo si vas a conectar la web) | **secreta** |
| `INTAKE_ALLOWED_ORIGINS` | `https://wearekosma.com,https://www.wearekosma.com` | |

5. **Deploys → Trigger deploy**. Cuando termine, entra con tu correo y clave.

### 4. Prueba de humo

1. Entra → crea un lead → debe llegar el correo "Nuevo lead" a los 3.
2. Muévelo a **Confirmado** → debe llegar el correo "Confirmado".
3. Bloquéalo y entra con otra cuenta (editor): debe verse en solo lectura.

---

## Conectar Google Calendar + Gmail (hello@wearekosma.com)

1. **Supabase → SQL Editor:** correr `supabase/migrations/0002_google_calendar.sql`.
2. **Google Cloud** (console.cloud.google.com, entrando con hello@wearekosma.com):
   - Crear proyecto `KOSMA Tracker`.
   - **APIs y servicios → Biblioteca:** habilitar **Google Calendar API** y **Gmail API**.
   - **Google Auth Platform → Branding:** nombre `KOSMA Tracker`, correo de soporte hello@wearekosma.com.
   - **Audience:** `Internal` si aparece (Google Workspace). Si solo deja `External`, después de crear todo darle **Publish app** (si se queda en "Testing", la conexión se cae cada 7 días).
   - **Clients → Create client → Web application.** Authorized redirect URI: `https://kosma-tracker.netlify.app/api/google/callback`
   - Copiar **Client ID** y **Client secret**.
3. **Netlify → Environment variables:** `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (esta última marcada como secreta). Redeploy.
4. **Tracker → Agenda → Conectar Google Calendar**, entrar con hello@wearekosma.com y aceptar. Si sale "Google no verificó esta app": *Configuración avanzada → Ir a KOSMA Tracker* (es tu propia app).

Con eso: la agenda muestra los eventos de hello@, las reuniones nuevas se agendan solas con Meet, y los correos de notificación salen desde hello@ sin contraseña de aplicación.

---

## Discord + Pulso semanal

**Supabase → SQL Editor:** correr `supabase/migrations/0003_settings.sql` (una vez).

### 1. Avisos al canal (webhook)
En Discord: canal (ej. `#pipeline`) → Editar canal → Integraciones → Webhooks → Nuevo webhook → Copiar URL.
Netlify: `DISCORD_WEBHOOK_URL` = esa URL (**secreta**). Redeploy → tracker → Integraciones → **Enviar prueba**.

### 2. Bot (comandos y "Guardar en KOSMA Tracker")
1. discord.com/developers/applications → **New Application** → `KOSMA Tracker` (subir el logo).
2. **General Information:** copiar *Application ID* y *Public Key*.
3. **Bot:** *Reset Token* → copiar el token. Activar **Message Content Intent**.
4. **Installation / OAuth2:** scopes `bot` + `applications.commands`; permisos *View Channels, Send Messages, Embed Links, Read Message History, Add Reactions*. Abrir el link e invitar el bot al servidor de KOSMA.
5. En Discord: Ajustes → Avanzado → **Modo desarrollador**. Clic derecho en el servidor → *Copiar ID del servidor*.
6. Netlify:

| Variable | Valor | |
|---|---|---|
| `DISCORD_APPLICATION_ID` | Application ID | |
| `DISCORD_PUBLIC_KEY` | Public Key | |
| `DISCORD_BOT_TOKEN` | token del bot | **secreta** |
| `DISCORD_GUILD_ID` | ID del servidor | |
| `DISCORD_LISTEN_CHANNELS` | IDs de canales a escuchar, separados por coma (clic derecho en el canal → Copiar ID) | |
| `CRON_SECRET` | texto largo aleatorio | **secreta** |

7. Redeploy. En el portal de Discord → General Information → **Interactions Endpoint URL**: `https://<tracker>/api/discord/interactions` → Save (Discord la verifica en ese momento).
8. Tracker → Integraciones → **Registrar comandos**.

Comandos: `/lead ver`, `/lead nuevo`, `/nota`, `/tarea`, `/pulso`, `/pipeline`. Clic derecho en un mensaje → Apps → **Guardar en KOSMA Tracker**.

### 3. Tareas programadas (Netlify)
- `netlify/functions/pulso-semanal.mts`: lunes 7:00 (Bogotá) → correo al equipo + Discord.
- `netlify/functions/instagram-publicar.mts`: cada 5 minutos → publicaciones de Instagram en proceso y programadas.
- `netlify/functions/discord-escucha.mts`: cada hora lee `DISCORD_LISTEN_CHANNELS`; si un mensaje nombra un lead, lo guarda como nota y reacciona con ✅. La primera vez solo marca el punto de partida (no reprocesa historial).
Las tres necesitan `CRON_SECRET`. Se ven en Netlify → Logs → Functions.

---

## Contenido · parrillas

1. **Supabase → SQL Editor:** correr `supabase/migrations/0004_contenido.sql` y después `0005_publicar.sql`.
2. **Google Cloud** (proyecto KOSMA Tracker) → APIs y servicios → Biblioteca → habilitar **Google Drive API**.
3. **Tracker → Agenda → Desconectar** Google y **Conectar** de nuevo con hello@wearekosma.com (acepta el nuevo permiso de Drive).

Cómo funciona:
- **Subir artes**: escoges qué es (Post, Carrusel, Reel o Historia), el día y los archivos. También se pueden arrastrar a un día del calendario; si son varios, pregunta si es un carrusel o publicaciones separadas.
- Cada publicación tiene copy, hashtags, redes, formato, responsable, estado, versiones del arte y un hilo de feedback con **Aprobar** / **Pedir cambios**.
- Carruseles: miniaturas que se reordenan arrastrando, botón + para agregar láminas, flechas, puntos y deslizar con el dedo. Más de un archivo en un post lo vuelve carrusel.
- Subir una versión nueva guarda la anterior en el historial y vuelve a pedir aprobación.
- Vistas: **Resumen** (tablero del mes: planeadas, publicadas, por aprobar, cambios, tiempo de aprobación, lo que necesita atención, próximos 7 días, ritmo semanal, formatos y redes), Mes, Feed y Lista.
- Archivos de hasta 48 MB se guardan en el tracker y se copian a Drive en `KOSMA · Parrillas de contenido / KOSMA / <Mes>`. Videos más pesados suben directo a esa carpeta.
- **Kit para publicar** (cuando está aprobada): copiar copy + hashtags, descargar todos los archivos con nombre ordenado, **Publicar ahora** en Instagram o **Programar** para que salga sola a su fecha y hora.

### Avisos por WhatsApp (CallMeBot, gratis)

Integraciones → Avisos por WhatsApp. Cada persona, una vez: guarda el número del bot que aparece en callmebot.com (sección WhatsApp), le manda `I allow callmebot to send me messages` y pega la apikey que le responde. Se escoge qué le llega a cada uno (arte para aprobar, cambios pedidos, aprobado, comentarios, publicado). A nadie le llega lo que hizo él mismo. Si se suben varias piezas de una vez llega un solo mensaje.

### Publicar en Instagram

Requiere cuenta profesional (Empresa o Creador) y una app de Meta con **API de Instagram con inicio de sesión de Instagram**:
1. developers.facebook.com → Crear app → caso de uso "Administrar mensajes y contenido en Instagram".
2. Roles de la app → agregar el Instagram de KOSMA como **Evaluador de Instagram** y aceptar la invitación desde Instagram.
3. Configuración de la API con inicio de sesión de Instagram → Generar identificadores de acceso → agregar la cuenta → **Generar token**.
4. Tracker → Integraciones → Instagram → pegar el token → Conectar. Dura 60 días y se renueva solo.

Detalles: Instagram descarga los archivos desde enlaces firmados del tracker. Las imágenes se convierten a JPEG y, en el feed, si la proporción no está entre 4:5 y 1.91:1 se completa con borde negro (queda anotado en el hilo de feedback). Carrusel máx. 10 láminas; máx. 30 hashtags y 2200 caracteres; límite de Instagram: 100 publicaciones al día. La tarea programada `instagram-publicar` (cada 5 min, usa `CRON_SECRET`) termina lo que esté procesando y publica lo programado.

---

## Pasar a producción (cuando quieran)

**Opción recomendada: `tracker.wearekosma.com`**
1. Netlify → Domain management → Add domain → `tracker.wearekosma.com`.
2. En el DNS de wearekosma.com: registro **CNAME** `tracker` → `kosma-tracker.netlify.app`.
3. Cambia `APP_URL` en Netlify y agrega `https://tracker.wearekosma.com/**` en Redirect URLs de Supabase.

**Opción `wearekosma.com/tracker`**
Define `TRACKER_BASE_PATH=/tracker` en Netlify y configura en el servidor de la web principal un *rewrite/proxy* de `/tracker/*` hacia `kosma-tracker.netlify.app/tracker/*`. Funciona, pero depende de que el hosting actual de la web permita ese proxy.

---

## Conectar la web de KOSMA (fase 2)

Desde el formulario o el agente de wearekosma.com:

```js
await fetch("https://kosma-tracker.netlify.app/api/intake", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer <INTAKE_SECRET>" },
  body: JSON.stringify({
    company: "Empresa S.A.S", name: "Nombre", email: "correo@empresa.com",
    phone: "+57…", message: "Qué necesitan", service: "IA aplicada",
  }),
});
```

El lead entra en **Nuevo**, con etiqueta `entrada-web`, y el equipo recibe el correo.
Importante: el secreto nunca debe ir en código que corra en el navegador. Llamarlo desde un servidor (función, backend del agente, Zapier/Make/n8n).

---

## Desarrollo local

```bash
cp .env.example .env.local   # y completa los valores
npm install
npm run dev                  # http://localhost:3000
```

## Estructura

```
app/(app)/          páginas internas (inicio, pipeline, ficha, agenda, equipo, cuenta)
app/actions.ts      todas las escrituras (server actions) + disparo de correos
app/api/intake      entrada de leads desde la web
components/         interfaz (shell, kanban, ficha, modales, ⌘K)
lib/                Supabase, correo, formatos, constantes (etapas, orígenes, servicios)
supabase/migrations esquema, seguridad (RLS), triggers de historial, storage
```

Para cambiar etapas, orígenes o servicios: `lib/constants.ts` (y el `check` de `stage` en el SQL si agregas etapas).
