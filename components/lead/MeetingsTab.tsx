"use client";

import { useState } from "react";
import { deleteRow, saveRow } from "@/app/actions";
import { MEETING_KINDS, MEETING_MODES, labelOf } from "@/lib/constants";
import { bogotaLocalToISO, dateTime, isoToBogotaLocal } from "@/lib/format";
import type { LeadOverview, Meeting } from "@/lib/types";
import { useShell } from "../AppShell";
import { Field, Modal, useUi } from "../ui";
import { ICalendar, IEdit, IExternal, IPlus, ITrash, IVideo } from "../icons";

/** Link para crear el evento en Google Calendar con un clic (sin integraciones) */
function gcalLink(m: Meeting, company: string, guestEmail?: string | null) {
  const start = new Date(m.starts_at);
  const end = new Date(start.getTime() + (m.duration_min ?? 45) * 60000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${company} · ${m.title}`,
    dates: `${f(start)}/${f(end)}`,
    details: [m.summary, "Agendado desde KOSMA Tracker"].filter(Boolean).join("\n\n"),
    location: m.location ?? "",
    ctz: "America/Bogota",
  });
  if (guestEmail) params.set("add", guestEmail);
  return `https://calendar.google.com/calendar/render?${params}`;
}

export default function MeetingsTab({ lead, meetings, editable }: { lead: LeadOverview; meetings: Meeting[]; editable: boolean }) {
  const { nameOf } = useShell();
  const { toast, confirm } = useUi();
  const [modal, setModal] = useState<Partial<Meeting> | null>(null);
  const [now] = useState(() => Date.now());
  const upcoming = meetings.filter((m) => new Date(m.starts_at).getTime() > now).reverse();
  const past = meetings.filter((m) => new Date(m.starts_at).getTime() <= now);

  async function remove(m: Meeting) {
    if (!(await confirm(`¿Eliminar la reunión “${m.title}”?`, { danger: true }))) return;
    const r = await deleteRow("meetings", m.id);
    if (!r.ok) toast(r.error, "error");
  }

  const render = (m: Meeting, future: boolean) => (
    <div key={m.id} className="item">
      <div className="item-top">
        <div className="grow">
          <div className="row wrap gap6">
            <span className="item-title">{m.title}</span>
            <span className="badge">{labelOf(MEETING_KINDS, m.kind)}</span>
            <span className="badge">{labelOf(MEETING_MODES, m.mode)}</span>
          </div>
          <div className="item-meta">
            <span className="mono">{dateTime(m.starts_at)}</span>
            {m.duration_min && <span>{m.duration_min} min</span>}
            {m.attendees && <span>Con: {m.attendees}</span>}
            {m.location && (/^https?:/.test(m.location) ? <a href={m.location} target="_blank" rel="noreferrer" className="row gap4"><IVideo width={12} /> Enlace</a> : <span>{m.location}</span>)}
            <span>Registró {nameOf(m.created_by)}</span>
          </div>
          {m.summary && <div className="item-body">{m.summary}</div>}
          {m.next_steps && <div className="item-body"><span className="kicker" style={{ marginRight: 8 }}>Siguientes pasos</span>{m.next_steps}</div>}
          <div className="row wrap gap6 mt8">
            {future && <a className="btn sm" href={gcalLink(m, lead.company, lead.contact_email)} target="_blank" rel="noreferrer"><ICalendar /> Agregar a Google Calendar</a>}
            {m.recording_url && <a className="btn ghost sm" href={m.recording_url} target="_blank" rel="noreferrer"><IExternal /> Grabación / acta</a>}
          </div>
        </div>
        {editable && (
          <div className="item-actions">
            <button className="btn ghost sm icon" onClick={() => setModal(m)} aria-label="Editar"><IEdit /></button>
            <button className="btn ghost sm icon" onClick={() => remove(m)} aria-label="Eliminar"><ITrash /></button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="stack gap16">
      <div className="row between">
        <div className="muted small">{past.length} realizadas · {upcoming.length} agendadas</div>
        {editable && <button className="btn sm primary" onClick={() => setModal({})}><IPlus /> Registrar reunión</button>}
      </div>

      {upcoming.length > 0 && (
        <section className="card">
          <div className="card-head"><h3>Agendadas</h3></div>
          <div>{upcoming.map((m) => render(m, true))}</div>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h3>Realizadas</h3></div>
        <div>
          {past.length === 0 ? <div className="empty">Todavía no hay reuniones registradas.</div> : past.map((m) => render(m, false))}
        </div>
      </section>

      {modal && <MeetingModal lead={lead} meeting={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

function MeetingModal({ lead, meeting, onClose }: { lead: LeadOverview; meeting: Partial<Meeting>; onClose: () => void }) {
  const { toast } = useUi();
  const [busy, setBusy] = useState(false);
  const defaultStart = meeting.starts_at ? isoToBogotaLocal(meeting.starts_at) : isoToBogotaLocal(new Date().toISOString()).slice(0, 14) + "00";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const starts_at = bogotaLocalToISO(data.starts_at);
    if (!starts_at) return toast("Falta la fecha", "error");
    setBusy(true);
    const r = await saveRow("meetings", { ...data, starts_at, lead_id: lead.id, id: meeting.id });
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    toast(meeting.id ? "Reunión actualizada" : "Reunión registrada");
    onClose();
  }

  return (
    <Modal title={meeting.id ? "Editar reunión" : "Registrar reunión"} onClose={onClose} size="lg">
      <form onSubmit={submit} className="grid g4">
        <Field label="Título *" className="span2"><input className="input" name="title" required defaultValue={meeting.title ?? ""} placeholder="Discovery con gerencia" autoFocus /></Field>
        <Field label="Fecha y hora (Bogotá) *" className="span2"><input className="input" type="datetime-local" name="starts_at" required defaultValue={defaultStart} /></Field>
        <Field label="Tipo">
          <select className="select" name="kind" defaultValue={meeting.kind ?? "seguimiento"}>
            {MEETING_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Modalidad">
          <select className="select" name="mode" defaultValue={meeting.mode ?? "virtual"}>
            {MEETING_MODES.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Duración (min)"><input className="input" type="number" min={5} step={5} name="duration_min" defaultValue={meeting.duration_min ?? 45} /></Field>
        <Field label="Lugar o enlace"><input className="input" name="location" defaultValue={meeting.location ?? ""} placeholder="Meet / oficina" /></Field>
        <Field label="Asistentes" className="span-all"><input className="input" name="attendees" defaultValue={meeting.attendees ?? lead.contact_name ?? ""} placeholder="Quiénes estuvieron" /></Field>
        <Field label="Resumen / qué se habló" className="span-all"><textarea className="textarea" name="summary" defaultValue={meeting.summary ?? ""} /></Field>
        <Field label="Siguientes pasos" className="span2"><textarea className="textarea" name="next_steps" defaultValue={meeting.next_steps ?? ""} style={{ minHeight: 64 }} /></Field>
        <Field label="Grabación o acta (link)" className="span2"><input className="input" name="recording_url" defaultValue={meeting.recording_url ?? ""} placeholder="https://" /></Field>
        <div className="span-all row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </Modal>
  );
}
