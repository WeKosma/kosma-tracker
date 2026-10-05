"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { disconnectGoogleAction, importCalendarEvent } from "@/app/actions";
import { MEETING_KINDS, labelOf } from "@/lib/constants";
import { date, time, todayISO } from "@/lib/format";
import { addDays, dayKey, shiftMonth } from "@/lib/calendar";
import { suggestLead, type LeadEmails } from "@/lib/match";
import { BASE_PATH } from "@/lib/env";
import type { Meeting, Task } from "@/lib/types";
import type { CalendarEvent } from "@/lib/google";
import PageTopbar from "./PageTopbar";
import { useShell } from "./AppShell";
import { Field, Modal, useUi } from "./ui";
import { TaskComposer, TaskRow } from "./lead/TasksTab";
import { ICalendar, IChevron, IExternal, ILink, IVideo } from "./icons";

type CalendarState = { configured: boolean; connected: boolean; email: string | null; error: string | null };

type Item =
  | { type: "meeting"; at: string; m: Meeting }
  | { type: "event"; at: string; e: CalendarEvent; suggestion: LeadEmails | null }
  | { type: "task"; at: string; t: Task };

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MAX_CHIPS = 4;
/** Hora corta de 24 h para la grilla y el panel ("09:00", "15:30"). */
const hm = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Bogota" }).format(new Date(iso));

const GOOGLE_MSG: Record<string, [string, "ok" | "error"]> = {
  ok: ["Google Calendar conectado. La agenda ya trae los eventos de la cuenta.", "ok"],
  cancelado: ["Conexión cancelada.", "error"],
  "sin-permiso": ["Solo un admin puede conectar Google.", "error"],
  "sin-configurar": ["Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Netlify.", "error"],
  "estado-invalido": ["La conexión expiró. Inténtalo de nuevo.", "error"],
  "falta-sql": ["Falta correr en Supabase el SQL de Google (kosma-tracker-supabase-2-google.sql). Córrelo y vuelve a conectar.", "error"],
  "cliente-invalido": ["Google no reconoce el Client ID o el Client secret. Revisa GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Netlify.", "error"],
  redirect: ["La URL de regreso no coincide. En Google Cloud debe estar https://kosma-tracker.netlify.app/api/google/callback y APP_URL en Netlify igual al dominio.", "error"],
  "sin-refresh": ["Google no entregó el permiso permanente. En myaccount.google.com/permissions quita KOSMA Tracker y vuelve a conectar.", "error"],
  "codigo-usado": ["El código de Google ya se usó o venció. Dale Conectar otra vez.", "error"],
  "supabase-key": ["La clave secreta de Supabase (SUPABASE_SECRET_KEY) no es válida en Netlify.", "error"],
  error: ["Google rechazó la conexión. Revisa la configuración e inténtalo otra vez.", "error"],
};

export default function AgendaView({
  month, days, meetings, tasks, companies, leads, calendar, events, isAdmin,
}: {
  month: string;
  days: string[];
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
  const [pending, startTransition] = useTransition();
  const today = todayISO();
  const [selected, setSelected] = useState(() => (today.startsWith(month) ? today : `${month}-01`));
  const [mine, setMine] = useState(false);
  const [onlyKosma, setOnlyKosma] = useState(false);
  const [linking, setLinking] = useState<{ e: CalendarEvent; suggestion: LeadEmails | null } | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const g = params.get("google");
    if (g && GOOGLE_MSG[g]) {
      toast(...GOOGLE_MSG[g]);
      router.replace(`/agenda${params.get("m") ? `?m=${params.get("m")}` : ""}`);
    }
  }, [params, toast, router]);

  const go = (m: string | null) =>
    startTransition(() => router.push(m ? `/agenda?m=${m}` : "/agenda", { scroll: false }));

  // Flechas del teclado para cambiar de mes (si no estás escribiendo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") go(shiftMonth(month, -1));
      else if (e.key === "ArrowRight") go(shiftMonth(month, 1));
      else if (e.key.toLowerCase() === "t") go(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const myTask = (t: Task) => !mine || t.assignee_id === me.id;

  // Todo lo del mes agrupado por día (reuniones del tracker, eventos de Calendar y tareas con fecha)
  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    const push = (k: string, it: Item) => map.set(k, [...(map.get(k) ?? []), it]);
    const linked = new Set(meetings.map((m) => m.gcal_event_id).filter(Boolean));
    for (const m of meetings) if (!mine || m.created_by === me.id) push(dayKey(m.starts_at), { type: "meeting", at: m.starts_at, m });
    if (!onlyKosma) {
      for (const e of events) {
        if (linked.has(e.id)) continue;
        const it: Item = { type: "event", at: e.start, e, suggestion: suggestLead(e.attendees, leads) };
        const first = dayKey(e.start);
        const last = e.allDay && e.end ? addDays(dayKey(e.end), -1) : first;
        for (let d = first; d <= last; d = addDays(d, 1)) push(d, it);
      }
    }
    for (const t of tasks) if (!t.done && t.due_date && myTask(t)) push(t.due_date, { type: "task", at: `${t.due_date}T23:59:00-05:00`, t });
    const rank = (it: Item) => (it.type === "event" && it.e.allDay ? 0 : it.type === "task" ? 2 : 1);
    for (const list of map.values()) list.sort((a, b) => rank(a) - rank(b) || a.at.localeCompare(b.at));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, events, tasks, leads, mine, onlyKosma, me.id]);

  const openTasks = tasks.filter((t) => !t.done && myTask(t));
  const late = openTasks.filter((t) => t.due_date && t.due_date < today);
  const upcoming = openTasks.filter((t) => !t.due_date || t.due_date >= today);
  const monthCount = [...byDay.entries()].filter(([k]) => k.startsWith(month)).reduce((n, [, v]) => n + v.filter((i) => i.type !== "task").length, 0);
  const dayItems = byDay.get(selected) ?? [];

  const title = date(`${month}-01`, { month: "long", year: "numeric", day: undefined });

  async function disconnect() {
    if (!(await confirm("¿Desconectar Google Calendar?", { detail: "La agenda deja de mostrar los eventos de la cuenta y las reuniones nuevas no se agendan solas. Lo ya creado en Calendar no se borra." }))) return;
    const r = await disconnectGoogleAction();
    if (!r.ok) return toast(r.error, "error");
    toast("Google desconectado");
  }

  const taskExtra = (t: Task) => (t.lead_id ? <Link href={`/leads/${t.lead_id}?tab=tareas`}>{companies[t.lead_id]}</Link> : "General");

  const chip = (it: Item, key: string) => {
    if (it.type === "meeting") {
      return (
        <span key={key} className={`cal-chip kosma${new Date(it.at).getTime() < now ? " past" : ""}`} title={`${companies[it.m.lead_id] ?? ""} · ${it.m.title}`}>
          <span className="t">{hm(it.at)}</span><span className="ellipsis">{companies[it.m.lead_id] ?? it.m.title}</span>
        </span>
      );
    }
    if (it.type === "event") {
      const past = new Date(it.e.end ?? it.at).getTime() < now;
      return it.e.allDay ? (
        <span key={key} className={`cal-chip allday${past ? " past" : ""}`} title={it.e.title}><span className="ellipsis">{it.e.title}</span></span>
      ) : (
        <span key={key} className={`cal-chip gcal${past ? " past" : ""}`} title={it.e.title}>
          <span className="dot" /><span className="t">{hm(it.at)}</span><span className="ellipsis">{it.e.title}</span>
        </span>
      );
    }
    return (
      <span key={key} className={`cal-chip task${it.t.due_date! < today ? " late" : ""}`} title={`Tarea: ${it.t.title}`}>
        <span className="box" /><span className="ellipsis">{it.t.title}</span>
      </span>
    );
  };

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
        <div className="card row wrap" style={{ padding: "10px 16px", marginBottom: 16, gap: 12 }}>
          <ICalendar />
          {calendar.connected ? (
            <>
              <span className="grow small">
                Google Calendar de <b>{calendar.email ?? "KOSMA"}</b>
                <span className="muted"> · las reuniones que registres en un lead se agendan ahí con Meet e invitación</span>
              </span>
              {calendar.error && <span className="badge danger" title={calendar.error}>Error leyendo Calendar</span>}
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

        <div className="agenda">
          {/* ───────── Mes ───────── */}
          <section className="card cal">
            <div className="cal-bar">
              <button className="btn sm" onClick={() => go(null)} disabled={today.startsWith(month)}>Hoy</button>
              <div className="row" style={{ gap: 2 }}>
                <button className="btn ghost sm icon" onClick={() => go(shiftMonth(month, -1))} aria-label="Mes anterior" title="Mes anterior (←)"><IChevron style={{ transform: "rotate(180deg)" }} /></button>
                <button className="btn ghost sm icon" onClick={() => go(shiftMonth(month, 1))} aria-label="Mes siguiente" title="Mes siguiente (→)"><IChevron /></button>
              </div>
              <h2 className="cal-title">{title}</h2>
              <span className="tiny faint nowrap">{monthCount} {monthCount === 1 ? "evento" : "eventos"}</span>
              <span className="grow" />
              <div className="cal-legend tiny muted">
                <span><i className="lg kosma" /> Reunión de lead</span>
                {calendar.connected && <span><i className="lg gcal" /> Calendar</span>}
                <span><i className="lg task" /> Tarea</span>
              </div>
              {calendar.connected && (
                <label className="check tiny muted"><input type="checkbox" checked={onlyKosma} onChange={(e) => setOnlyKosma(e.target.checked)} /> Solo leads</label>
              )}
            </div>

            <div className={`cal-grid${pending ? " loading" : ""}`} role="grid" aria-label={title}>
              {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
              {days.map((d) => {
                const its = byDay.get(d) ?? [];
                const out = !d.startsWith(month);
                const extra = its.length - MAX_CHIPS;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`cal-day${out ? " out" : ""}${d === today ? " today" : ""}${d === selected ? " sel" : ""}${d < today ? " before" : ""}`}
                    onClick={() => setSelected(d)}
                    aria-label={date(d, { weekday: "long", day: "numeric", month: "long", year: undefined })}
                    aria-pressed={d === selected}
                  >
                    <span className="num">{Number(d.slice(8))}</span>
                    <span className="chips">
                      {its.slice(0, extra > 0 ? MAX_CHIPS - 1 : MAX_CHIPS).map((it, i) => chip(it, `${d}-${i}`))}
                      {extra > 0 && <span className="cal-more">+{extra + 1} más</span>}
                    </span>
                    {its.length > 0 && (
                      <span className="dots" aria-hidden>
                        {its.slice(0, 4).map((it, i) => <i key={i} className={`lg ${it.type === "meeting" ? "kosma" : it.type === "task" ? "task" : "gcal"}`} />)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ───────── Día seleccionado + tareas ───────── */}
          <div className="stack gap16">
            <section className="card">
              <div className="card-head">
                <div>
                  <div className="kicker">{selected === today ? "Hoy" : date(selected, { weekday: "long", day: undefined, month: undefined, year: undefined })}</div>
                  <h2 className="day-title">{date(selected, { day: "numeric", month: "long", year: undefined })}</h2>
                </div>
                <span className="tiny faint">{dayItems.length || "Sin"} {dayItems.length === 1 ? "cosa" : "cosas"}</span>
              </div>
              {dayItems.length === 0 && <div className="empty">Día libre.</div>}
              {dayItems.map((it, i) =>
                it.type === "meeting" ? (
                  <div key={`m${it.m.id}`} className="day-item">
                    <span className="when">{hm(it.m.starts_at)}</span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <Link href={`/leads/${it.m.lead_id}?tab=reuniones`} className="ellipsis" style={{ display: "block" }}>
                        <b style={{ fontWeight: 500 }}>{companies[it.m.lead_id] ?? "—"}</b> <span className="muted">· {it.m.title}</span>
                      </Link>
                      <div className="row tiny faint" style={{ gap: 8, marginTop: 4 }}>
                        <span className="badge">{labelOf(MEETING_KINDS, it.m.kind)}</span>
                        <span>{nameOf(it.m.created_by).split(" ")[0]}</span>
                        {it.m.gcal_event_id && <span title="Está en Google Calendar" className="row" style={{ gap: 4 }}><ICalendar width={12} /></span>}
                      </div>
                    </div>
                    {it.m.meet_url && <a className="btn ghost sm icon" href={it.m.meet_url} target="_blank" rel="noreferrer" title="Entrar a Meet"><IVideo /></a>}
                  </div>
                ) : it.type === "event" ? (
                  <div key={`e${it.e.id}-${i}`} className="day-item">
                    <span className="when">{it.e.allDay ? "Todo el día" : hm(it.e.start)}</span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      <div className="ellipsis">{it.e.title}</div>
                      <div className="tiny faint ellipsis" style={{ marginTop: 3 }}>
                        {it.suggestion ? <>¿Es de <b>{it.suggestion.company}</b>?</> : it.e.attendees.length > 0 ? it.e.attendees.slice(0, 3).join(", ") : "Google Calendar"}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 4 }}>
                      {it.e.meetUrl && <a className="btn ghost sm icon" href={it.e.meetUrl} target="_blank" rel="noreferrer" title="Entrar a Meet"><IVideo /></a>}
                      {it.e.htmlLink && <a className="btn ghost sm icon" href={it.e.htmlLink} target="_blank" rel="noreferrer" title="Abrir en Google Calendar"><IExternal /></a>}
                      {canWrite && leads.length > 0 && (
                        <button className="btn sm icon" onClick={() => setLinking({ e: it.e, suggestion: it.suggestion })} title="Vincular a un lead"><ILink /></button>
                      )}
                    </div>
                  </div>
                ) : (
                  <TaskRow key={`t${it.t.id}`} t={it.t} editable={canWrite} extra={taskExtra(it.t)} />
                )
              )}
            </section>

            <section className="card">
              <div className="card-head"><h2>Tareas</h2><span className="tiny faint">{openTasks.length} abiertas</span></div>
              {canWrite && <TaskComposer />}
              {late.length > 0 && <div className="kicker" style={{ padding: "12px 16px 4px", color: "var(--danger)" }}>Vencidas</div>}
              {late.map((t) => <TaskRow key={t.id} t={t} editable={canWrite} extra={taskExtra(t)} />)}
              {late.length > 0 && upcoming.length > 0 && <div className="kicker" style={{ padding: "12px 16px 4px" }}>Próximas</div>}
              {upcoming.map((t) => <TaskRow key={t.id} t={t} editable={canWrite} extra={taskExtra(t)} />)}
              {openTasks.length === 0 && <div className="empty">Nada pendiente. Limpio.</div>}
            </section>
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
