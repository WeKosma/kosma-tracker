"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { disconnectGoogleAction, importCalendarEvent } from "@/app/actions";
import { MEETING_KINDS, labelOf } from "@/lib/constants";
import { date, time, todayISO } from "@/lib/format";
import { suggestLead, type LeadEmails } from "@/lib/match";
import { BASE_PATH } from "@/lib/env";
import type { Meeting, Task } from "@/lib/types";
import type { CalendarEvent } from "@/lib/google";
import PageTopbar from "./PageTopbar";
import { useShell } from "./AppShell";
import { Field, Modal, useUi } from "./ui";
import { TaskComposer, TaskRow } from "./lead/TasksTab";
import { ICalendar, IExternal, ILink, IVideo } from "./icons";

const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(iso));

type CalendarState = { configured: boolean; connected: boolean; email: string | null; error: string | null };

type Item =
  | { type: "meeting"; at: string; m: Meeting }
  | { type: "event"; at: string; e: CalendarEvent; suggestion: LeadEmails | null };

const GOOGLE_MSG: Record<string, [string, "ok" | "error"]> = {
  ok: ["Google Calendar conectado. La agenda ya trae los eventos de la cuenta.", "ok"],
  cancelado: ["Conexión cancelada.", "error"],
  "sin-permiso": ["Solo un admin puede conectar Google.", "error"],
  "sin-configurar": ["Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Netlify.", "error"],
  "estado-invalido": ["La conexión expiró. Inténtalo de nuevo.", "error"],
  error: ["Google rechazó la conexión. Revisa la configuración e inténtalo otra vez.", "error"],
};

export default function AgendaView({
  meetings, tasks, companies, leads, calendar, events, isAdmin,
}: {
  meetings: Meeting[];
  tasks: Task[];
  companies: Record<string, string>;
  leads: LeadEmails[];
  calendar: CalendarState;
  events: CalendarEvent[];
  isAdmin: boolean;
}) {
  const { me, canWrite, nameOf } = useShell();
  const { toast, confirm } = useUi();
  const router = useRouter();
  const params = useSearchParams();
  const [mine, setMine] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [onlyKosma, setOnlyKosma] = useState(false);
  const [linking, setLinking] = useState<{ e: CalendarEvent; suggestion: LeadEmails | null } | null>(null);
  const [now] = useState(() => Date.now());
  const today = todayISO();

  useEffect(() => {
    const g = params.get("google");
    if (g && GOOGLE_MSG[g]) {
      toast(...GOOGLE_MSG[g]);
      router.replace("/agenda");
    }
  }, [params, toast, router]);

  // Unir reuniones del tracker + eventos del Calendar (sin duplicar los ya vinculados)
  const linkedIds = new Set(meetings.map((m) => m.gcal_event_id).filter(Boolean));
  const items: Item[] = [
    ...meetings.map((m) => ({ type: "meeting" as const, at: m.starts_at, m })),
    ...(onlyKosma ? [] : events)
      .filter((e) => !linkedIds.has(e.id))
      .map((e) => ({ type: "event" as const, at: e.start, e, suggestion: suggestLead(e.attendees, leads) })),
  ]
    .filter((it) => (showPast ? true : new Date(it.at).getTime() >= now - 3600000))
    .filter((it) => !mine || it.type === "event" || it.m.created_by === me.id)
    .sort((a, b) => a.at.localeCompare(b.at));

  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const k = dayKey(it.at);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }

  const myFilter = (t: Task) => !mine || t.assignee_id === me.id;
  const openTasks = tasks.filter((t) => !t.done && myFilter(t));
  const late = openTasks.filter((t) => t.due_date && t.due_date < today);
  const upcoming = openTasks.filter((t) => !t.due_date || t.due_date >= today);
  const doneRecent = tasks.filter((t) => t.done && myFilter(t)).slice(0, 10);

  const label = (k: string) => {
    if (k === today) return "Hoy";
    const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(now + 86400000));
    if (k === tomorrow) return "Mañana";
    return date(k, { weekday: "long", day: "numeric", month: "long", year: undefined });
  };

  async function disconnect() {
    if (!(await confirm("¿Desconectar Google Calendar?", { detail: "La agenda deja de mostrar los eventos de la cuenta y las reuniones nuevas no se agendan solas. Lo ya creado en Calendar no se borra." }))) return;
    const r = await disconnectGoogleAction();
    if (!r.ok) return toast(r.error, "error");
    toast("Google desconectado");
  }

  const taskExtra = (t: Task) => (t.lead_id ? <Link href={`/leads/${t.lead_id}?tab=tareas`}>{companies[t.lead_id]}</Link> : "General");

  return (
    <>
      <PageTopbar crumbs={[{ label: "Agenda" }]} />
      <div className="content">
        <div className="page-head">
          <div>
            <div className="kicker">Reuniones y tareas del equipo</div>
            <h1>Agenda</h1>
          </div>
          <div className="seg">
            <button className={!mine ? "on" : ""} onClick={() => setMine(false)}>Todo el equipo</button>
            <button className={mine ? "on" : ""} onClick={() => setMine(true)}>Solo lo mío</button>
          </div>
        </div>

        {/* Estado de la conexión con Google */}
        <div className="card row wrap" style={{ padding: "12px 16px", marginBottom: 16, gap: 12 }}>
          <ICalendar />
          {calendar.connected ? (
            <>
              <span className="grow small">
                Conectada al Google Calendar de <b>{calendar.email ?? "KOSMA"}</b>
                <span className="muted"> · las reuniones que registres se agendan ahí con Meet e invitación</span>
              </span>
              {calendar.error && <span className="badge danger" title={calendar.error}>Error leyendo Calendar</span>}
              <label className="check tiny muted"><input type="checkbox" checked={onlyKosma} onChange={(e) => setOnlyKosma(e.target.checked)} /> Ocultar eventos sin lead</label>
              {isAdmin && <button className="btn ghost sm" onClick={disconnect}>Desconectar</button>}
            </>
          ) : (
            <>
              <span className="grow small">
                <b>Google Calendar sin conectar.</b>
                <span className="muted"> Conéctalo una vez con hello@wearekosma.com y la agenda trae los eventos, y cada reunión nueva se agenda sola con Meet.</span>
              </span>
              {isAdmin ? (
                calendar.configured ? (
                  <a className="btn primary sm" href={`${BASE_PATH}/api/google/connect`}>Conectar Google Calendar</a>
                ) : (
                  <span className="badge warn">Faltan las llaves de Google en Netlify</span>
                )
              ) : (
                <span className="tiny faint">Un admin debe conectarlo</span>
              )}
            </>
          )}
        </div>

        <div className="dash" style={{ marginTop: 0 }}>
          <section className="card">
            <div className="card-head">
              <h2>Reuniones</h2>
              <label className="check tiny muted"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Ver últimas 2 semanas</label>
            </div>
            {groups.size === 0 && (
              <div className="empty">
                {calendar.connected ? "No hay reuniones ni eventos en los próximos 60 días." : "No hay reuniones agendadas. Se registran desde la ficha de cada lead."}
              </div>
            )}
            {[...groups.entries()].map(([k, its]) => (
              <div key={k}>
                <div className="kicker" style={{ padding: "14px 16px 6px", color: k === today ? "var(--fg)" : undefined }}>{label(k)}</div>
                {its.map((it) =>
                  it.type === "meeting" ? (
                    <div key={it.m.id} className="list-item">
                      <span className="when">{time(it.m.starts_at)}</span>
                      <Link href={`/leads/${it.m.lead_id}?tab=reuniones`} className="grow ellipsis">
                        <b style={{ fontWeight: 500 }}>{companies[it.m.lead_id] ?? "—"}</b> <span className="muted">· {it.m.title}</span>
                      </Link>
                      {it.m.gcal_event_id && <span title="En Google Calendar"><ICalendar width={13} style={{ color: "var(--ok)" }} /></span>}
                      {it.m.meet_url && <a className="btn ghost sm" href={it.m.meet_url} target="_blank" rel="noreferrer"><IVideo /> Meet</a>}
                      <span className="badge">{labelOf(MEETING_KINDS, it.m.kind)}</span>
                      <span className="tiny faint nowrap">{nameOf(it.m.created_by)}</span>
                    </div>
                  ) : (
                    <div key={it.e.id} className="list-item" style={{ opacity: 0.92 }}>
                      <span className="when">{it.e.allDay ? "Todo el día" : time(it.e.start)}</span>
                      <span className="grow ellipsis">
                        <span className="muted">{it.e.title}</span>
                        {it.suggestion && <span className="tiny faint"> · ¿{it.suggestion.company}?</span>}
                      </span>
                      {it.e.meetUrl && <a className="btn ghost sm" href={it.e.meetUrl} target="_blank" rel="noreferrer"><IVideo /> Meet</a>}
                      {it.e.htmlLink && <a className="btn ghost sm icon" href={it.e.htmlLink} target="_blank" rel="noreferrer" title="Abrir en Google Calendar"><IExternal /></a>}
                      {canWrite && leads.length > 0 && (
                        <button className="btn sm" onClick={() => setLinking({ e: it.e, suggestion: it.suggestion })}><ILink /> Vincular</button>
                      )}
                      <span className="badge"><ICalendar width={11} /> Calendar</span>
                    </div>
                  )
                )}
              </div>
            ))}
          </section>

          <div className="stack gap16">
            <section className="card">
              <div className="card-head"><h2>Tareas</h2><span className="tiny faint">{openTasks.length} abiertas</span></div>
              {canWrite && <TaskComposer />}
              {late.length > 0 && <div className="kicker" style={{ padding: "12px 16px 4px", color: "var(--danger)" }}>Vencidas</div>}
              {late.map((t) => <TaskRow key={t.id} t={t} editable={canWrite} extra={taskExtra(t)} />)}
              {late.length > 0 && <div className="kicker" style={{ padding: "12px 16px 4px" }}>Próximas</div>}
              {upcoming.map((t) => <TaskRow key={t.id} t={t} editable={canWrite} extra={taskExtra(t)} />)}
              {openTasks.length === 0 && <div className="empty">Nada pendiente. Limpio.</div>}
            </section>
            {doneRecent.length > 0 && (
              <section className="card">
                <div className="card-head"><h2>Completadas recientemente</h2></div>
                {doneRecent.map((t) => <TaskRow key={t.id} t={t} editable={canWrite} extra={t.lead_id ? companies[t.lead_id] : "General"} />)}
              </section>
            )}
          </div>
        </div>
      </div>

      {linking && <LinkModal event={linking.e} suggestion={linking.suggestion} leads={leads} onClose={() => setLinking(null)} />}
    </>
  );
}

function LinkModal({
  event, suggestion, leads, onClose,
}: { event: CalendarEvent; suggestion: LeadEmails | null; leads: LeadEmails[]; onClose: () => void }) {
  const { toast } = useUi();
  const router = useRouter();
  const [leadId, setLeadId] = useState(suggestion?.id ?? "");
  const [kind, setKind] = useState("seguimiento");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!leadId) return toast("Escoge un lead", "error");
    setBusy(true);
    const r = await importCalendarEvent(event.id, leadId, kind);
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    toast("Reunión vinculada al lead");
    onClose();
    router.refresh();
  }

  return (
    <Modal
      title="Vincular evento a un lead"
      size="sm"
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? "…" : "Vincular"}</button></>}
    >
      <div className="stack">
        <div className="small">
          <b>{event.title}</b>
          <div className="muted tiny">{date(event.start, { weekday: "short", day: "numeric", month: "short", year: undefined })} · {event.allDay ? "todo el día" : time(event.start)}</div>
          {event.attendees.length > 0 && <div className="faint tiny mt8">{event.attendees.join(", ")}</div>}
        </div>
        <Field label="Lead">
          <select className="select" value={leadId} onChange={(e) => setLeadId(e.target.value)} autoFocus>
            <option value="">Escoge…</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.company}{suggestion?.id === l.id ? "  (sugerido)" : ""}</option>)}
          </select>
        </Field>
        <Field label="Tipo de reunión">
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
            {MEETING_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </Field>
        <p className="tiny muted" style={{ margin: 0 }}>Queda en la ficha del lead, cuenta en sus reuniones y aparece en el historial.</p>
      </div>
    </Modal>
  );
}
