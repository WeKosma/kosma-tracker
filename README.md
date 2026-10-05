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
