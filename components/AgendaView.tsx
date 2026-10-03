"use client";

import Link from "next/link";
import { useState } from "react";
import { MEETING_KINDS, labelOf } from "@/lib/constants";
import { date, time, todayISO } from "@/lib/format";
import type { Meeting, Task } from "@/lib/types";
import PageTopbar from "./PageTopbar";
import { useShell } from "./AppShell";
import { TaskComposer, TaskRow } from "./lead/TasksTab";

const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(iso));

export default function AgendaView({ meetings, tasks, companies }: { meetings: Meeting[]; tasks: Task[]; companies: Record<string, string> }) {
  const { me, canWrite, nameOf } = useShell();
  const [mine, setMine] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const today = todayISO();
  const [now] = useState(() => Date.now());

  const visibleMeetings = meetings.filter((m) => (showPast ? true : new Date(m.starts_at).getTime() >= now - 3600000));
  const groups = new Map<string, Meeting[]>();
  for (const m of visibleMeetings) {
    const k = dayKey(m.starts_at);
    groups.set(k, [...(groups.get(k) ?? []), m]);
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

        <div className="dash" style={{ marginTop: 0 }}>
          <section className="card">
            <div className="card-head">
              <h2>Reuniones</h2>
              <label className="check tiny muted"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Ver últimas 2 semanas</label>
            </div>
            {groups.size === 0 && <div className="empty">No hay reuniones agendadas. Se registran desde la ficha de cada lead.</div>}
            {[...groups.entries()].map(([k, ms]) => (
              <div key={k}>
                <div className="kicker" style={{ padding: "14px 16px 6px", color: k === today ? "var(--fg)" : undefined }}>{label(k)}</div>
                {ms.map((m) => (
                  <Link key={m.id} href={`/leads/${m.lead_id}?tab=reuniones`} className="list-item">
                    <span className="when">{time(m.starts_at)}</span>
                    <span className="grow ellipsis"><b style={{ fontWeight: 500 }}>{companies[m.lead_id] ?? "—"}</b> <span className="muted">· {m.title}</span></span>
                    <span className="badge">{labelOf(MEETING_KINDS, m.kind)}</span>
                    <span className="tiny faint nowrap">{nameOf(m.created_by)}</span>
                  </Link>
                ))}
              </div>
            ))}
          </section>

          <div className="stack gap16">
            <section className="card">
              <div className="card-head"><h2>Tareas</h2><span className="tiny faint">{openTasks.length} abiertas</span></div>
              {canWrite && <TaskComposer />}
              {late.length > 0 && <div className="kicker" style={{ padding: "12px 16px 4px", color: "var(--danger)" }}>Vencidas</div>}
              {late.map((t) => <TaskRow key={t.id} t={t} editable={canWrite} extra={t.lead_id ? <Link href={`/leads/${t.lead_id}?tab=tareas`}>{companies[t.lead_id]}</Link> : "General"} />)}
              {late.length > 0 && <div className="kicker" style={{ padding: "12px 16px 4px" }}>Próximas</div>}
              {upcoming.map((t) => <TaskRow key={t.id} t={t} editable={canWrite} extra={t.lead_id ? <Link href={`/leads/${t.lead_id}?tab=tareas`}>{companies[t.lead_id]}</Link> : "General"} />)}
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
    </>
  );
}
