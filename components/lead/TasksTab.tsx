"use client";

import { useState } from "react";
import { deleteRow, saveRow } from "@/app/actions";
import { date, profileName, todayISO } from "@/lib/format";
import type { Task } from "@/lib/types";
import { useShell } from "../AppShell";
import TaskCheck from "../TaskCheck";
import { useUi } from "../ui";
import { IPlus, ITrash } from "../icons";

export function TaskComposer({ leadId }: { leadId?: string | null }) {
  const { team, me } = useShell();
  const { toast } = useUi();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [who, setWho] = useState(me.id);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const r = await saveRow("tasks", { lead_id: leadId ?? null, title, due_date: due || null, assignee_id: who || null });
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    setTitle("");
    setDue("");
  }

  return (
    <form onSubmit={add} className="row wrap" style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>
      <input className="input grow" style={{ minWidth: 200 }} placeholder="Nueva tarea… (Enter para agregar)" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} style={{ width: 150 }} aria-label="Fecha límite" />
      <select className="select" value={who} onChange={(e) => setWho(e.target.value)} style={{ width: 150 }} aria-label="Responsable">
        <option value="">Sin asignar</option>
        {team.map((t) => <option key={t.id} value={t.id}>{profileName(t)}</option>)}
      </select>
      <button className="btn primary icon" disabled={busy || !title.trim()} aria-label="Agregar"><IPlus /></button>
    </form>
  );
}

export function TaskRow({ t, editable, extra }: { t: Task; editable: boolean; extra?: React.ReactNode }) {
  const { nameOf } = useShell();
  const { toast, confirm } = useUi();
  const today = todayISO();
  async function remove() {
    if (!(await confirm(`¿Eliminar “${t.title}”?`, { danger: true }))) return;
    const r = await deleteRow("tasks", t.id);
    if (!r.ok) toast(r.error, "error");
  }
  return (
    <div className={`taskrow ${t.done ? "done" : ""}`}>
      <TaskCheck id={t.id} done={t.done} disabled={!editable} />
      <div className="grow">
        <div className="tt">{t.title}</div>
        <div className="tiny faint">{extra}{extra && " · "}{nameOf(t.assignee_id)}</div>
      </div>
      {t.due_date && <span className={`due ${!t.done && t.due_date < today ? "late" : ""}`}>{date(t.due_date, { year: undefined })}</span>}
      {editable && <div className="item-actions"><button className="btn ghost sm icon" onClick={remove} aria-label="Eliminar"><ITrash /></button></div>}
    </div>
  );
}

export default function TasksTab({ leadId, tasks, editable }: { leadId: string; tasks: Task[]; editable: boolean }) {
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  return (
    <div className="stack gap16">
      <section className="card">
        {editable && <TaskComposer leadId={leadId} />}
        {open.length === 0 && <div className="empty">Sin tareas pendientes.</div>}
        {open.map((t) => <TaskRow key={t.id} t={t} editable={editable} />)}
      </section>
      {done.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>Completadas</h3><span className="tiny faint">{done.length}</span></div>
          {done.map((t) => <TaskRow key={t.id} t={t} editable={editable} />)}
        </section>
      )}
    </div>
  );
}
