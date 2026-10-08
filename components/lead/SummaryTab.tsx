"use client";

import { useState } from "react";
import { deleteRow, saveRow, updateLead } from "@/app/actions";
import { date, todayISO } from "@/lib/format";
import type { Contact, LeadOverview, Note } from "@/lib/types";
import { Field, Modal, useUi } from "../ui";
import { IEdit, IMail, IPhone, IPin, IPlus, ITrash, ILink } from "../icons";
import Linkify from "../Linkify";

export default function SummaryTab({
  lead, contacts, notes, editable, onEdit,
}: { lead: LeadOverview; contacts: Contact[]; notes: Note[]; editable: boolean; onEdit: () => void }) {
  const { toast, confirm } = useUi();
  const [na, setNa] = useState(lead.next_action ?? "");
  const [nad, setNad] = useState(lead.next_action_date ?? "");
  const [savingNa, setSavingNa] = useState(false);
  const [contactModal, setContactModal] = useState<Partial<Contact> | null>(null);
  const pinned = notes.filter((n) => n.pinned);
  const dirty = na !== (lead.next_action ?? "") || nad !== (lead.next_action_date ?? "");
  const late = lead.next_action_date && lead.next_action_date < todayISO();

  async function saveNext() {
    setSavingNa(true);
    const r = await updateLead(lead.id, { next_action: na, next_action_date: nad || null });
    setSavingNa(false);
    if (!r.ok) return toast(r.error, "error");
    toast("Próxima acción guardada");
  }

  async function removeContact(c: Contact) {
    if (!(await confirm(`¿Quitar a ${c.name}?`, { danger: true }))) return;
    const r = await deleteRow("contacts", c.id);
    if (!r.ok) toast(r.error, "error");
  }

  return (
    <div className="stack gap16">
      <section className="card">
        <div className="card-head">
          <h3>Próxima acción</h3>
          {late && <span className="badge danger">Vencida · {date(lead.next_action_date, { year: undefined })}</span>}
        </div>
        <div className="card-body">
          <div className="row wrap" style={{ alignItems: "flex-end" }}>
            <Field label="Qué sigue" className="grow">
              <input className="input" value={na} onChange={(e) => setNa(e.target.value)} placeholder="Ej: Enviar propuesta v2 con alcance ajustado" disabled={!editable} onKeyDown={(e) => e.key === "Enter" && dirty && saveNext()} />
            </Field>
            <Field label="Cuándo">
              <input className="input" type="date" value={nad} onChange={(e) => setNad(e.target.value)} disabled={!editable} style={{ width: 160 }} />
            </Field>
            {editable && dirty && <button className="btn primary" onClick={saveNext} disabled={savingNa}>{savingNa ? "…" : "Guardar"}</button>}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>Contexto</h3>
          {editable && <button className="btn ghost sm" onClick={onEdit}><IEdit /> Editar</button>}
        </div>
        <div className="card-body">
          {lead.summary ? <div className="pre" style={{ lineHeight: 1.6 }}><Linkify text={lead.summary} /></div> : <div className="faint">Sin contexto todavía. ¿Qué problema operativo tienen y qué esperan de KOSMA?</div>}
        </div>
      </section>

      {pinned.length > 0 && (
        <section className="card">
          <div className="card-head"><h3 className="row gap6"><IPin width={13} /> Notas fijadas</h3></div>
          <div>
            {pinned.map((n) => <div key={n.id} className="item"><div className="pre small"><Linkify text={n.body} /></div></div>)}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h3>Personas <span className="faint mono tiny">{contacts.length + (lead.contact_name ? 1 : 0)}</span></h3>
          {editable && <button className="btn ghost sm" onClick={() => setContactModal({})}><IPlus /> Agregar</button>}
        </div>
        <div>
          {lead.contact_name && (
            <div className="item">
              <div className="item-top">
                <div className="grow">
                  <div className="item-title">{lead.contact_name} <span className="badge" style={{ marginLeft: 6 }}>Principal</span></div>
                  <div className="item-meta">
                    {lead.contact_role && <span>{lead.contact_role}</span>}
                    {lead.contact_email && <a href={`mailto:${lead.contact_email}`} className="row gap4"><IMail width={12} /> {lead.contact_email}</a>}
                    {lead.contact_phone && <span className="row gap4"><IPhone width={12} /> {lead.contact_phone}</span>}
                  </div>
                </div>
              </div>
            </div>
          )}
          {contacts.map((c) => (
            <div key={c.id} className="item">
              <div className="item-top">
                <div className="grow">
                  <div className="item-title">{c.name}</div>
                  <div className="item-meta">
                    {c.role && <span>{c.role}</span>}
                    {c.email && <a href={`mailto:${c.email}`} className="row gap4"><IMail width={12} /> {c.email}</a>}
                    {c.phone && <span className="row gap4"><IPhone width={12} /> {c.phone}</span>}
                    {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer" className="row gap4"><ILink width={12} /> LinkedIn</a>}
                  </div>
                  {c.notes && <div className="item-body small">{c.notes}</div>}
                </div>
                {editable && (
                  <div className="item-actions">
                    <button className="btn ghost sm icon" onClick={() => setContactModal(c)} aria-label="Editar"><IEdit /></button>
                    <button className="btn ghost sm icon" onClick={() => removeContact(c)} aria-label="Eliminar"><ITrash /></button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {!lead.contact_name && contacts.length === 0 && <div className="empty">Sin personas registradas.</div>}
        </div>
      </section>

      {contactModal && <ContactModal leadId={lead.id} contact={contactModal} onClose={() => setContactModal(null)} />}
    </div>
  );
}

function ContactModal({ leadId, contact, onClose }: { leadId: string; contact: Partial<Contact>; onClose: () => void }) {
  const { toast } = useUi();
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    setBusy(true);
    const r = await saveRow("contacts", { ...data, lead_id: leadId, id: contact.id });
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    toast("Contacto guardado");
    onClose();
  }
  return (
    <Modal title={contact.id ? "Editar persona" : "Agregar persona"} onClose={onClose}>
      <form onSubmit={submit} className="grid g2">
        <Field label="Nombre *"><input className="input" name="name" required defaultValue={contact.name ?? ""} autoFocus /></Field>
        <Field label="Cargo"><input className="input" name="role" defaultValue={contact.role ?? ""} /></Field>
        <Field label="Correo"><input className="input" type="email" name="email" defaultValue={contact.email ?? ""} /></Field>
        <Field label="Teléfono"><input className="input" name="phone" defaultValue={contact.phone ?? ""} /></Field>
        <Field label="LinkedIn" className="span2"><input className="input" name="linkedin" defaultValue={contact.linkedin ?? ""} placeholder="https://linkedin.com/in/…" /></Field>
        <Field label="Notas" className="span2"><textarea className="textarea" name="notes" defaultValue={contact.notes ?? ""} placeholder="Decide, influye, aprueba presupuesto…" /></Field>
        <div className="span2 row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
        </div>
      </form>
    </Modal>
  );
}
