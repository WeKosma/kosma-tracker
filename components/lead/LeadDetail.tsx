"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteLead, setLock, updateLead } from "@/app/actions";
import { PRIORITIES, STAGES, labelOf, sourceLabel, stageOf } from "@/lib/constants";
import { date, daysSince, money, relative } from "@/lib/format";
import type { Activity, Contact, FileRow, LeadOverview, Meeting, Note, Proposal, Task } from "@/lib/types";
import { Topbar, useShell } from "../AppShell";
import { ActivityList } from "../TeamName";
import LeadFormModal from "../LeadFormModal";
import { Avatar, Field, Modal, StageBadge, useUi } from "../ui";
import { IEdit, IExternal, IFolder, ILock, IMail, IPhone, ITrash, IUnlock } from "../icons";
import SummaryTab from "./SummaryTab";
import MeetingsTab, { type CalendarInfo } from "./MeetingsTab";
import ProposalsTab from "./ProposalsTab";
import NotesTab from "./NotesTab";
import TasksTab from "./TasksTab";
import FilesTab from "./FilesTab";

type Props = {
  lead: LeadOverview;
  contacts: Contact[];
  meetings: Meeting[];
  proposals: Proposal[];
  notes: Note[];
  tasks: Task[];
  files: FileRow[];
  activity: Activity[];
  initialTab?: string;
  calendar: CalendarInfo;
};

const TABS = ["resumen", "reuniones", "propuestas", "notas", "tareas", "archivos"] as const;
type Tab = (typeof TABS)[number];

function waLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits.length === 10 ? "57" + digits : digits}`;
}
function safeUrl(u: string) {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

export default function LeadDetail(p: Props) {
  const { lead } = p;
  const router = useRouter();
  const { nameOf, canWrite, me, role } = useShell();
  const { toast, confirm } = useUi();
  const [tab, setTab] = useState<Tab>(TABS.includes(p.initialTab as Tab) ? (p.initialTab as Tab) : "resumen");
  const [editing, setEditing] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [busyStage, setBusyStage] = useState(false);

  const editable = canWrite && (!lead.locked || lead.locked_by === me.id || role === "admin");
  const stageIdx = STAGES.findIndex((s) => s.id === lead.stage);

  function changeTab(t: Tab) {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === "resumen") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  }

  async function moveTo(stage: string, extra: Record<string, unknown> = {}) {
    if (stage === lead.stage) return;
    setBusyStage(true);
    const r = await updateLead(lead.id, { stage, ...extra });
    setBusyStage(false);
    if (!r.ok) return toast(r.error, "error");
    toast(stage === "confirmado" ? "Confirmado. El equipo fue notificado por correo." : `Movido a ${stageOf(stage).label}`);
  }

  async function toggleLock(reason?: string) {
    const r = await setLock(lead.id, !lead.locked, reason);
    if (!r.ok) return toast(r.error, "error");
    toast(lead.locked ? "Ficha desbloqueada" : "Ficha bloqueada. Solo tú y los admins pueden editarla.");
    setLockOpen(false);
  }

  async function remove() {
    const ok = await confirm(`¿Eliminar ${lead.company}?`, {
      danger: true,
      detail: "Se borran también sus reuniones, propuestas, notas, tareas y archivos. No se puede deshacer.",
    });
    if (!ok) return;
    const r = await deleteLead(lead.id);
    if (!r.ok) return toast(r.error, "error");
    toast("Lead eliminado");
    router.replace("/leads");
  }

  const counts: Record<Tab, number | null> = {
    resumen: null,
    reuniones: p.meetings.length,
    propuestas: p.proposals.length,
    notas: p.notes.length,
    tareas: p.tasks.filter((t) => !t.done).length,
    archivos: p.files.length,
  };
  const labels: Record<Tab, string> = {
    resumen: "Resumen", reuniones: "Reuniones", propuestas: "Propuestas", notas: "Notas", tareas: "Tareas", archivos: "Archivos",
  };

  return (
    <>
      <Topbar
        crumbs={[{ label: "Pipeline", href: "/leads" }, { label: lead.company }]}
        actions={
          <>
            {canWrite && (lead.locked ? (
              <button className="btn sm" onClick={() => toggleLock()} disabled={!editable} title={editable ? "Desbloquear" : "Solo quien la bloqueó o un admin"}>
                <IUnlock /> Desbloquear
              </button>
            ) : (
              <button className="btn ghost sm" onClick={() => setLockOpen(true)}><ILock /> Bloquear</button>
            ))}
            {editable && <button className="btn sm" onClick={() => setEditing(true)}><IEdit /> Editar</button>}
            {role === "admin" && <button className="btn ghost sm icon" onClick={remove} title="Eliminar lead" aria-label="Eliminar lead"><ITrash /></button>}
          </>
        }
      />

      <div className="content">
        {lead.locked && (
          <div className="lockbanner">
            <ILock />
            <span className="grow">
              Bloqueada por <b>{nameOf(lead.locked_by)}</b> {relative(lead.locked_at)}
              {lead.lock_reason && <span className="muted"> · {lead.lock_reason}</span>}
              {!editable && <span className="muted"> · Solo lectura para ti</span>}
            </span>
          </div>
        )}

        <div className="lead-head">
          <div style={{ minWidth: 0 }}>
            <div className="kicker">{[lead.industry, lead.city, lead.country].filter(Boolean).join(" · ") || "Lead"}</div>
            <h1>{lead.company}</h1>
            <div className="sub">
              <StageBadge stage={lead.stage} />
              <span className={`badge ${lead.priority === "alta" ? "solid" : ""}`}>Prioridad {labelOf(PRIORITIES, lead.priority).toLowerCase()}</span>
              {lead.value ? <span className="mono" style={{ color: "var(--fg)" }}>{money(lead.value, lead.currency)}</span> : null}
              <span className="row gap6"><Avatar name={nameOf(lead.owner_id)} size="sm" /> {nameOf(lead.owner_id)}</span>
            </div>
          </div>
        </div>

        <div className="stagebar" role="group" aria-label="Etapa del lead">
          {STAGES.map((s, i) => (
            <button
              key={s.id}
              className={i === stageIdx ? "current" : i < stageIdx && lead.stage !== "perdido" ? "past" : ""}
              disabled={!editable || busyStage}
              onClick={() => (s.id === "perdido" ? setLostOpen(true) : moveTo(s.id))}
              title={s.label}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="lead-grid">
          <div style={{ minWidth: 0 }}>
            <div className="tabs" role="tablist">
              {TABS.map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "on" : ""} onClick={() => changeTab(t)}>
                  {labels[t]} {counts[t] ? <span className="n">{counts[t]}</span> : null}
                </button>
              ))}
            </div>
            {tab === "resumen" && <SummaryTab lead={lead} contacts={p.contacts} notes={p.notes} editable={editable} onEdit={() => setEditing(true)} />}
            {tab === "reuniones" && <MeetingsTab lead={lead} meetings={p.meetings} editable={editable} calendar={p.calendar} />}
            {tab === "propuestas" && <ProposalsTab lead={lead} proposals={p.proposals} editable={editable} />}
            {tab === "notas" && <NotesTab leadId={lead.id} notes={p.notes} editable={editable} />}
            {tab === "tareas" && <TasksTab leadId={lead.id} tasks={p.tasks} editable={editable} />}
            {tab === "archivos" && <FilesTab lead={lead} files={p.files} editable={editable} />}
          </div>

          <aside className="stack gap16">
            <section className="card">
              <div className="statgrid">
                <div className="stat"><div className="kicker">Reuniones</div><div className="v">{lead.meetings_done}</div></div>
                <div className="stat"><div className="kicker">Propuestas</div><div className="v">{lead.proposals_total}</div></div>
                <div className="stat"><div className="kicker">Días etapa</div><div className="v">{daysSince(lead.stage_changed_at)}</div></div>
              </div>
            </section>

            <section className="card">
              <div className="card-head"><h3>Ficha</h3>{editable && <button className="btn ghost sm" onClick={() => setEditing(true)}><IEdit /> Editar</button>}</div>
              <div className="facts">
                <div className="fact"><span>Contacto</span><span>{lead.contact_name ?? "—"}{lead.contact_role && <span className="muted"> · {lead.contact_role}</span>}</span></div>
                {lead.contact_email && <div className="fact"><span>Correo</span><a href={`mailto:${lead.contact_email}`} className="row gap6"><IMail width={13} /> {lead.contact_email}</a></div>}
                {lead.contact_phone && <div className="fact"><span>Teléfono</span><a href={waLink(lead.contact_phone)} target="_blank" rel="noreferrer" className="row gap6"><IPhone width={13} /> {lead.contact_phone}</a></div>}
                {lead.website && <div className="fact"><span>Web</span><a href={safeUrl(lead.website)} target="_blank" rel="noreferrer">{lead.website.replace(/^https?:\/\//, "")}</a></div>}
                <div className="fact"><span>Drive</span>{lead.drive_url ? <a href={safeUrl(lead.drive_url)} target="_blank" rel="noreferrer" className="row gap6"><IFolder width={13} /> Abrir carpeta <IExternal width={11} /></a> : <span className="faint">Sin carpeta</span>}</div>
                <div className="fact"><span>Origen</span><span>{sourceLabel(lead.source)}</span></div>
                <div className="fact"><span>Servicio</span><span>{lead.service ?? "—"}</span></div>
                {(lead.tags?.length ?? 0) > 0 && <div className="fact"><span>Etiquetas</span><span className="row wrap gap6">{lead.tags.map((t) => <span key={t} className="tag">{t}</span>)}</span></div>}
                {lead.stage === "perdido" && lead.lost_reason && <div className="fact"><span>Motivo</span><span>{lead.lost_reason}</span></div>}
                <div className="fact"><span>Creado</span><span>{date(lead.created_at)}</span></div>
                <div className="fact"><span>Últ. reunión</span><span>{lead.last_meeting_at ? relative(lead.last_meeting_at) : "—"}</span></div>
                <div className="fact"><span>Próx. reunión</span><span>{lead.next_meeting_at ? date(lead.next_meeting_at, { hour: "numeric", minute: "2-digit" }) : "—"}</span></div>
              </div>
            </section>

            <section className="card">
              <div className="card-head"><h3>Historial</h3><span className="tiny faint">{p.activity.length} eventos</span></div>
              <ActivityList items={p.activity} />
            </section>
          </aside>
        </div>
      </div>

      {editing && <LeadFormModal lead={lead} onClose={() => setEditing(false)} />}

      {lockOpen && <LockModal onClose={() => setLockOpen(false)} onConfirm={toggleLock} />}
      {lostOpen && (
        <LostModal
          onClose={() => setLostOpen(false)}
          onConfirm={async (reason) => { setLostOpen(false); await moveTo("perdido", { lost_reason: reason }); }}
        />
      )}
    </>
  );
}

function LockModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason?: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      title="Bloquear ficha"
      size="sm"
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={() => onConfirm(reason)}><ILock /> Bloquear</button></>}
    >
      <p className="muted" style={{ marginTop: 0 }}>Mientras esté bloqueada, solo tú y los admins pueden editarla. El resto del equipo la ve en modo lectura.</p>
      <Field label="Motivo (opcional)">
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Negociación delicada, la llevo yo" autoFocus />
      </Field>
    </Modal>
  );
}

function LostModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  const options = ["Presupuesto", "Eligieron a otro", "No era el momento", "Sin respuesta", "No encaja con KOSMA"];
  return (
    <Modal
      title="Marcar como perdido"
      size="sm"
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn danger" onClick={() => onConfirm(reason)}>Marcar perdido</button></>}
    >
      <p className="muted" style={{ marginTop: 0 }}>Guardar el motivo nos enseña dónde se cae el pipeline.</p>
      <div className="row wrap gap6" style={{ marginBottom: 12 }}>
        {options.map((o) => <button key={o} className={`btn sm ${reason === o ? "primary" : ""}`} onClick={() => setReason(o)}>{o}</button>)}
      </div>
      <Field label="Motivo"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}
