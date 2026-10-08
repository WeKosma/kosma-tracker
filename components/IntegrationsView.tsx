"use client";

import Link from "next/link";
import { useState } from "react";
import { registerDiscordCommands, sendPulseNow, testDiscord } from "@/app/actions";
import PageTopbar from "./PageTopbar";
import { useUi } from "./ui";
import { ICalendar, ICheck, IPulse, IX } from "./icons";

type Props = {
  base: string;
  google: { configured: boolean; connected: boolean; email: string | null; drive?: boolean };
  discord: { webhook: boolean; appId: boolean; publicKey: boolean; bot: boolean; guild: boolean; listen: number };
  cron: boolean;
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

export default function IntegrationsView({ base, google, discord, cron }: Props) {
  const { toast } = useUi();
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
      </div>
    </>
  );
}
