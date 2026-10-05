"use client";

import Link from "next/link";
import { useState } from "react";
import { sendPulseNow } from "@/app/actions";
import { stageOf } from "@/lib/constants";
import { compactMoney, date, money } from "@/lib/format";
import type { Pulse } from "@/lib/pulse";
import PageTopbar from "./PageTopbar";
import { StageBadge, useUi } from "./ui";
import { IArrowRight, IVideo } from "./icons";

const when = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Bogota" }).format(new Date(iso));

function L({ id, children }: { id: string | null; children: React.ReactNode }) {
  return id ? <Link href={`/leads/${id}`}>{children}</Link> : <>{children}</>;
}

function Section({ title, n, children, empty }: { title: string; n?: number; children: React.ReactNode; empty?: string }) {
  return (
    <section className="card">
      <div className="card-head"><h2>{title}</h2>{n != null && <span className="tiny faint">{n}</span>}</div>
      {n === 0 ? <div className="empty">{empty ?? "Nada esta semana."}</div> : children}
    </section>
  );
}

export default function PulseView({ pulse: p, headline, isAdmin }: { pulse: Pulse; headline: string; isAdmin: boolean }) {
  const { toast } = useUi();
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    const r = await sendPulseNow();
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    const d = r.data!;
    toast(d.email || d.discord ? `Pulso enviado${d.email ? " por correo" : ""}${d.email && d.discord ? " y" : ""}${d.discord ? " a Discord" : ""}.` : "No se envió: falta configurar el correo o Discord.", d.email || d.discord ? "ok" : "error");
  }

  return (
    <>
      <PageTopbar crumbs={[{ label: "Pulso" }]} />
      <div className="content">
        <div className="page-head">
          <div>
            <div className="kicker">Semana del {date(p.from, { year: undefined })} al {date(p.to, { year: undefined })}</div>
            <h1>Pulso</h1>
          </div>
          {isAdmin && (
            <div className="row" style={{ gap: 8 }}>
              <span className="tiny faint">Se envía solo cada lunes a las 7:00</span>
              <button className="btn" onClick={send} disabled={busy}>{busy ? "Enviando…" : "Enviar ahora"}</button>
            </div>
          )}
        </div>

        <p className="pulse-headline">{headline}</p>

        <div className="pulse-kpis">
          {p.totals.filter((t) => t.open > 0).map((t) => (
            <div key={t.currency} className="kpi">
              <div className="kicker">Pipeline {t.currency}</div>
              <div className="v">{compactMoney(t.open, t.currency)}</div>
              <div className="tiny muted">ponderado {compactMoney(t.weighted, t.currency)} · {t.count} leads</div>
            </div>
          ))}
          <div className="kpi"><div className="kicker">Cierres</div><div className="v">{p.won.length}</div><div className="tiny muted">últimos 7 días</div></div>
          <div className="kpi"><div className="kicker">Reuniones</div><div className="v">{p.meetingsDone}</div><div className="tiny muted">realizadas</div></div>
          <div className="kpi"><div className="kicker">Enfriándose</div><div className={`v${p.cooling.length ? " warn" : ""}`}>{p.cooling.length}</div><div className="tiny muted">14+ días quietos</div></div>
        </div>

        <div className="dash" style={{ marginTop: 16 }}>
          <div className="stack gap16">
            {p.won.length > 0 && (
              <Section title="Cierres" n={p.won.length}>
                {p.won.map((w) => (
                  <div key={w.id} className="list-item"><L id={w.id}><b style={{ fontWeight: 500 }}>{w.company}</b></L><span className="grow" /><span className="small">{money(w.value, w.currency)}</span></div>
                ))}
              </Section>
            )}
            <Section title="Movimientos" n={p.moves.length} empty="Nadie movió etapas esta semana.">
              {p.moves.map((m, i) => (
                <div key={i} className="list-item">
                  <L id={m.id}><span className="ellipsis" style={{ fontWeight: 500 }}>{m.company}</span></L>
                  <span className="grow" />
                  <span className="tiny muted nowrap">{stageOf(m.from).label}</span><IArrowRight width={12} className="faint" /><StageBadge stage={m.to} />
                  <span className="tiny faint nowrap">{m.by}</span>
                </div>
              ))}
            </Section>
            <Section title="Leads nuevos" n={p.newLeads.length}>
              {p.newLeads.map((l) => <div key={l.id} className="list-item"><L id={l.id}>{l.company}</L><span className="grow" /><span className="tiny faint">{l.owner}</span></div>)}
            </Section>
            <Section title="Propuestas" n={p.proposals.length}>
              {p.proposals.map((x, i) => (
                <div key={i} className="list-item">
                  <L id={x.leadId}><b style={{ fontWeight: 500 }}>{x.company}</b></L>
                  <span className="muted small ellipsis grow">{x.title}</span>
                  <span className="badge">{x.status}</span>
                  {x.amount ? <span className="small nowrap">{money(x.amount, x.currency)}</span> : null}
                </div>
              ))}
            </Section>
          </div>

          <div className="stack gap16">
            <Section title="Se están enfriando" n={p.cooling.length} empty="Todo el pipeline se está moviendo.">
              {p.cooling.map((c) => (
                <div key={c.id} className="list-item" style={{ alignItems: "flex-start" }}>
                  <span className="when" style={{ color: c.days >= 30 ? "var(--danger)" : "var(--warn)" }}>{c.days} días</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <L id={c.id}><b style={{ fontWeight: 500 }}>{c.company}</b></L>
                    <div className="tiny faint ellipsis">{stageOf(c.stage).label} · {c.owner}{c.next ? ` · → ${c.next}` : ""}</div>
                  </div>
                </div>
              ))}
            </Section>
            {p.overdue.length > 0 && (
              <Section title="Tareas vencidas" n={p.overdue.length}>
                {p.overdue.map((t, i) => (
                  <div key={i} className="list-item">
                    <span className="when" style={{ color: "var(--danger)" }}>{date(t.due, { year: undefined })}</span>
                    <span className="grow ellipsis">{t.title} <span className="tiny faint">· {t.company ?? "General"} · {t.owner}</span></span>
                  </div>
                ))}
              </Section>
            )}
            <Section title="Esta semana" n={p.upcoming.length} empty="Sin reuniones agendadas en los próximos 7 días.">
              {p.upcoming.map((u, i) => (
                <div key={i} className="list-item">
                  <span className="when">{when(u.at)}</span>
                  <span className="grow ellipsis">{u.company ? <L id={u.leadId}><b style={{ fontWeight: 500 }}>{u.company}</b> · </L> : null}<span className="muted">{u.title}</span></span>
                  {u.meetUrl && <a className="btn ghost sm icon" href={u.meetUrl} target="_blank" rel="noreferrer" title="Meet"><IVideo /></a>}
                </div>
              ))}
            </Section>
          </div>
        </div>
      </div>
    </>
  );
}
