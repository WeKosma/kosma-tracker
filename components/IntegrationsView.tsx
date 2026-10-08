"use client";

import Link from "next/link";
import { useState } from "react";
import { registerDiscordCommands, sendPulseNow, testDiscord } from "@/app/actions";
import { disconnectInstagramAction, saveInstagramToken, saveWhatsAppContacts, testWhatsApp } from "@/app/integration-actions";
import { WA_EVENTS, type WaContact, type WaEvent } from "@/lib/content";
import { date, profileName } from "@/lib/format";
import { useShell } from "./AppShell";
import { useRouter } from "next/navigation";
import PageTopbar from "./PageTopbar";
import { useUi } from "./ui";
import { ICalendar, ICheck, IInstagram, IPlus, IPulse, ITrash, IWhatsApp, IX } from "./icons";

type Props = {
  base: string;
  google: { configured: boolean; connected: boolean; email: string | null; drive?: boolean };
  discord: { webhook: boolean; appId: boolean; publicKey: boolean; bot: boolean; guild: boolean; listen: number };
  cron: boolean;
  instagram: { connected: boolean; username: string | null; expiresAt: string | null };
  whatsapp: { saved: boolean; contacts: WaContact[] };
};

function Check({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div className="int-check">
      <span className={`int-dot ${ok ? "ok" : ""}`}>{ok ? <ICheck width={11} /> : <IX width={11} />}</span>
      <span className="grow">{label}</span>
      {hint && <code className="tiny faint">{hint}</code>}
    </div>
  );
}

function DiscordMark(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden="true" {...p}>
      <path d="M19.6 5.3A16.7 16.7 0 0 0 15.4 4l-.5 1a15.5 15.5 0 0 0-5.8 0L8.6 4a16.6 16.6 0 0 0-4.2 1.3C1.7 9.3 1 13.2 1.3 17a16.9 16.9 0 0 0 5.1 2.6l1.1-1.7a10.8 10.8 0 0 1-1.7-.8l.4-.3a11.9 11.9 0 0 0 11.6 0l.4.3c-.5.3-1.1.6-1.7.8l1.1 1.7a16.8 16.8 0 0 0 5.1-2.6c.4-4.4-.7-8.3-3.1-11.7ZM8.7 14.8c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
    </svg>
  );
}

export default function IntegrationsView({ base, google, discord, cron, instagram, whatsapp }: Props) {
  const { toast, confirm } = useUi();
  const router = useRouter();
  const { team } = useShell();
  const [igToken, setIgToken] = useState("");
  const [contacts, setContacts] = useState<WaContact[]>(whatsapp.contacts);
  const [waDirty, setWaDirty] = useState(!whatsapp.saved);
  const setContact = (i: number, patch: Partial<WaContact>) => {
    setContacts((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    setWaDirty(true);
  };
  const toggleEvent = (i: number, ev: WaEvent) => {
    const c = contacts[i];
    setContact(i, { events: c.events.includes(ev) ? c.events.filter((x) => x !== ev) : [...c.events, ev] });
  };
  const [busy, setBusy] = useState<string | null>(null);
  const endpoint = `${base || "https://<tu-tracker>"}/api/discord/interactions`;
  const botReady = discord.appId && discord.publicKey && discord.bot && discord.guild;

  async function act(key: string, fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, okMsg: (d: unknown) => string) {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    if (!r.ok) return toast(r.error ?? "Algo falló", "error");
    toast(okMsg(r.data));
  }

  return (
    <>
      <PageTopbar crumbs={[{ label: "Integraciones" }]} />
      <div className="content">
        <div className="page-head">
          <div>
            <div className="kicker">Conexiones del tracker</div>
            <h1>Integraciones</h1>
          </div>
        </div>

        <div className="int-grid">
          {/* Discord */}
          <section className="card">
            <div className="card-head"><h2 className="row" style={{ gap: 8 }}><DiscordMark /> Discord</h2></div>
            <div className="card-body stack">
              <div className="kicker">1 · Avisos al canal</div>
              <p className="small muted" style={{ margin: 0 }}>Leads nuevos, cambios de etapa, propuestas, reuniones, cierres y el Pulso del lunes.</p>
              <Check ok={discord.webhook} label="Webhook del canal" hint="DISCORD_WEBHOOK_URL" />
              <div><button className="btn sm" disabled={!discord.webhook || busy !== null} onClick={() => act("test", testDiscord, () => "Mensaje de prueba enviado a Discord.")}>{busy === "test" ? "Enviando…" : "Enviar prueba"}</button></div>

              <div className="kicker mt16">2 · Bot: comandos y guardar mensajes</div>
              <p className="small muted" style={{ margin: 0 }}>/lead ver, /lead nuevo, /nota, /tarea, /pulso, /pipeline y clic derecho en un mensaje → Apps → Guardar en KOSMA Tracker.</p>
              <Check ok={discord.appId} label="ID de la aplicación" hint="DISCORD_APPLICATION_ID" />
              <Check ok={discord.publicKey} label="Public key" hint="DISCORD_PUBLIC_KEY" />
              <Check ok={discord.bot} label="Token del bot" hint="DISCORD_BOT_TOKEN" />
              <Check ok={discord.guild} label="ID del servidor" hint="DISCORD_GUILD_ID" />
              <div className="int-copy">
                <span className="tiny muted">Interactions Endpoint URL (pegar en el portal de Discord)</span>
                <div className="row" style={{ gap: 6 }}>
                  <code className="grow ellipsis">{endpoint}</code>
                  <button className="btn ghost sm" onClick={() => { navigator.clipboard.writeText(endpoint); toast("Copiada"); }}>Copiar</button>
                </div>
              </div>
              <div><button className="btn sm" disabled={!botReady || busy !== null} onClick={() => act("cmd", registerDiscordCommands, (d) => `${(d as { count: number }).count} comandos registrados en Discord.`)}>{busy === "cmd" ? "Registrando…" : "Registrar comandos"}</button></div>

              <div className="kicker mt16">3 · Escucha automática</div>
              <p className="small muted" style={{ margin: 0 }}>Cada hora lee los canales elegidos. Si un mensaje nombra a un lead, lo guarda como nota en su ficha y lo marca con ✅.</p>
              <Check ok={discord.listen > 0} label={discord.listen ? `${discord.listen} ${discord.listen === 1 ? "canal" : "canales"} en escucha` : "Canales a escuchar"} hint="DISCORD_LISTEN_CHANNELS" />
              <Check ok={cron} label="Clave de tareas programadas" hint="CRON_SECRET" />
            </div>
          </section>

          <div className="stack gap16">
            {/* Pulso */}
            <section className="card">
              <div className="card-head"><h2 className="row" style={{ gap: 8 }}><IPulse /> Pulso semanal</h2></div>
              <div className="card-body stack">
                <p className="small muted" style={{ margin: 0 }}>Cada lunes a las 7:00 llega al correo del equipo y al canal de Discord: movimientos, cierres, leads que se enfrían, tareas vencidas y la semana que viene.</p>
                <Check ok={cron} label="Envío automático de los lunes" hint="CRON_SECRET" />
                <div className="row" style={{ gap: 8 }}>
                  <Link className="btn sm" href="/pulso">Ver el pulso</Link>
                  <button className="btn sm" disabled={busy !== null} onClick={() => act("pulse", sendPulseNow, (d) => { const x = d as { email: boolean; discord: boolean }; return x.email || x.discord ? "Pulso enviado." : "No se envió: falta correo o Discord."; })}>{busy === "pulse" ? "Enviando…" : "Enviar ahora"}</button>
                </div>
              </div>
            </section>

            {/* Google */}
            <section className="card">
              <div className="card-head"><h2 className="row" style={{ gap: 8 }}><ICalendar /> Google Calendar y Gmail</h2></div>
              <div className="card-body stack">
                <Check ok={google.configured} label="Llaves de Google" hint="GOOGLE_CLIENT_ID / SECRET" />
                <Check ok={google.connected} label={google.connected ? `Conectado: ${google.email ?? "cuenta de KOSMA"}` : "Cuenta conectada"} />
                <Check ok={Boolean(google.drive)} label="Permiso de Drive para las parrillas" hint={google.drive ? undefined : "reconectar en Agenda"} />
                <div><Link className="btn sm" href="/agenda">Ir a la Agenda</Link></div>
              </div>
            </section>
          </div>
        </div>

        <div className="int-grid" style={{ marginTop: 16 }}>
          {/* Instagram */}
          <section className="card">
            <div className="card-head"><h2 className="row" style={{ gap: 8 }}><IInstagram /> Instagram</h2></div>
            <div className="card-body stack">
              <p className="small muted" style={{ margin: 0 }}>El botón Publicar de la parrilla sube posts, reels, carruseles e historias directo al perfil. También publica solo lo programado a su hora.</p>
              <Check ok={instagram.connected} label={instagram.connected ? `Conectado: @${instagram.username ?? "cuenta de KOSMA"}` : "Cuenta de Instagram"} hint={instagram.expiresAt ? `renueva sola · ${date(instagram.expiresAt, { day: "numeric", month: "short" })}` : undefined} />
              <Check ok={cron} label="Publicación programada (revisa cada 5 min)" hint="CRON_SECRET" />
              <div className="row" style={{ gap: 6 }}>
                <input className="input grow" type="password" autoComplete="off" placeholder={instagram.connected ? "Pegar un token nuevo para cambiar la cuenta" : "Pega aquí el token de acceso de Instagram"} value={igToken} onChange={(e) => setIgToken(e.target.value)} />
                <button
                  className="btn sm primary"
                  disabled={!igToken.trim() || busy !== null}
                  onClick={async () => {
                    setBusy("ig");
                    const r = await saveInstagramToken(igToken);
                    setBusy(null);
                    if (!r.ok) return toast(r.error, "error");
                    setIgToken("");
                    toast(`Instagram conectado${r.data?.username ? `: @${r.data.username}` : ""}`);
                    router.refresh();
                  }}
                >
                  {busy === "ig" ? "Validando…" : "Conectar"}
                </button>
              </div>
              {instagram.connected && (
                <div>
                  <button className="btn ghost sm danger-text" disabled={busy !== null} onClick={async () => {
                    if (!(await confirm("¿Desconectar Instagram?", { danger: true, detail: "El botón Publicar deja de funcionar hasta que se pegue un token nuevo." }))) return;
                    const r = await disconnectInstagramAction();
                    if (!r.ok) return toast(r.error, "error");
                    router.refresh();
                  }}>Desconectar</button>
                </div>
              )}
              <details className="int-how">
                <summary>Cómo sacar el token (una sola vez, 10 minutos)</summary>
                <ol>
                  <li>La cuenta de Instagram de KOSMA debe ser profesional (Empresa o Creador).</li>
                  <li>Entra a developers.facebook.com con tu Facebook → Mis apps → Crear app → caso de uso <b>Administrar mensajes y contenido en Instagram</b>.</li>
                  <li>En la app: Instagram → <b>Configuración de la API con inicio de sesión de Instagram</b>.</li>
                  <li>Roles de la app → Agregar personas → <b>Evaluador de Instagram</b> con el usuario de KOSMA. Acepta la invitación desde Instagram (Configuración → Apps y sitios web → Invitaciones de evaluador).</li>
                  <li>Vuelve a la configuración de la API → <b>Generar identificadores de acceso</b> → Agregar cuenta → entra con Instagram de KOSMA y acepta los permisos.</li>
                  <li>Clic en <b>Generar token</b>, cópialo y pégalo arriba. Dura 60 días y el tracker lo renueva solo.</li>
                </ol>
              </details>
            </div>
          </section>

          {/* WhatsApp */}
          <section className="card">
            <div className="card-head"><h2 className="row" style={{ gap: 8 }}><IWhatsApp /> Avisos por WhatsApp</h2></div>
            <div className="card-body stack">
              <p className="small muted" style={{ margin: 0 }}>Cuando se sube un arte, le llega a quien aprueba. Cuando piden cambios o aprueban, le llega a quien diseña. A nadie le llega lo que hizo él mismo.</p>
              {contacts.map((c, i) => (
                <div key={i} className="int-wa">
                  <div className="int-wa-row">
                    <input className="input" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} placeholder="Nombre" aria-label="Nombre" />
                    <input className="input mono" value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} placeholder="+57 300 000 0000" aria-label="WhatsApp" />
                    <input className="input mono" value={c.apikey} onChange={(e) => setContact(i, { apikey: e.target.value })} onFocus={(e) => c.apikey.startsWith("••••") && e.target.select()} placeholder="apikey de CallMeBot" aria-label="apikey" />
                  </div>
                  <div className="int-wa-row2">
                    <select className="select" value={c.user_id ?? ""} onChange={(e) => setContact(i, { user_id: e.target.value || null })} aria-label="Usuario del tracker">
                      <option value="">¿Quién es en el tracker?</option>
                      {team.map((t) => <option key={t.id} value={t.id}>{profileName(t)}</option>)}
                    </select>
                    <div className="ct-platforms">
                      {WA_EVENTS.map((ev) => (
                        <button key={ev.id} type="button" className={c.events.includes(ev.id) ? "on" : ""} onClick={() => toggleEvent(i, ev.id)}>{ev.label}</button>
                      ))}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                    {!c.apikey && <span className="tiny faint grow">Sin apikey: no le llega nada todavía</span>}
                    <button className="btn ghost sm" disabled={!c.apikey || !c.phone || busy !== null} onClick={() => act(`wa${i}`, () => testWhatsApp(c), () => `Mensaje de prueba enviado a ${c.name || c.phone}`)}>{busy === `wa${i}` ? "Enviando…" : "Probar"}</button>
                    <button className="btn ghost sm icon" onClick={() => { setContacts((l) => l.filter((_, j) => j !== i)); setWaDirty(true); }} aria-label="Quitar contacto"><ITrash /></button>
                  </div>
                </div>
              ))}
              <div className="row between wrap" style={{ gap: 8 }}>
                <button className="btn ghost sm" onClick={() => { setContacts((l) => [...l, { name: "", phone: "", apikey: "", events: ["revision"], user_id: null }]); setWaDirty(true); }}><IPlus /> Agregar persona</button>
                <button className="btn sm primary" disabled={!waDirty || busy !== null} onClick={() => act("wasave", () => saveWhatsAppContacts(contacts), () => { setWaDirty(false); router.refresh(); return "Avisos de WhatsApp guardados"; })}>{busy === "wasave" ? "Guardando…" : "Guardar avisos"}</button>
              </div>
              <details className="int-how">
                <summary>Cómo activar los avisos (cada persona, una vez)</summary>
                <ol>
                  <li>Abre <a className="inline-link" href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noreferrer">callmebot.com → WhatsApp</a> y guarda en tus contactos el número que aparece ahí (el bot de CallMeBot).</li>
                  <li>Desde tu WhatsApp mándale exactamente: <code>I allow callmebot to send me messages</code></li>
                  <li>En unos segundos te responde con tu <b>apikey</b>. Pégala en tu fila, escoge quién eres en el tracker y dale Guardar avisos.</li>
                  <li>Usa Probar para confirmar que te llega.</li>
                </ol>
                <p className="tiny faint" style={{ margin: "6px 0 0" }}>CallMeBot es gratis para uso interno. Si algún día se queda corto, se cambia por la API oficial de WhatsApp de Meta sin tocar el resto.</p>
              </details>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
