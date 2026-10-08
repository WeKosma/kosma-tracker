"use client";

import Linkify from "../Linkify";

import { useState } from "react";
import { deleteRow, getFileUrl, saveRow } from "@/app/actions";
import { CURRENCIES, PROPOSAL_KINDS, PROPOSAL_STATUS, labelOf } from "@/lib/constants";
import { date, money } from "@/lib/format";
import { uploadFile } from "@/lib/upload";
import type { LeadOverview, Proposal } from "@/lib/types";
import { useShell } from "../AppShell";
import { Field, Modal, useUi } from "../ui";
import { IDownload, IEdit, IExternal, IPlus, IPresent, ITrash } from "../icons";

const statusClass = (s: string) => (s === "aprobada" ? "ok" : s === "rechazada" ? "danger" : s === "enviada" || s === "en_revision" ? "warn" : "");

export default function ProposalsTab({ lead, proposals, editable }: { lead: LeadOverview; proposals: Proposal[]; editable: boolean }) {
  const { nameOf } = useShell();
  const { toast, confirm } = useUi();
  const [modal, setModal] = useState<Partial<Proposal> | null>(null);

  const approved = proposals.filter((p) => p.status === "aprobada");
  const nextVersion = (kind: string) => Math.max(0, ...proposals.filter((p) => p.kind === kind).map((p) => p.version)) + 1;

  async function setStatus(p: Proposal, status: string) {
    const extra = status === "enviada" && !p.sent_at ? { sent_at: new Date().toISOString().slice(0, 10) } : {};
    const r = await saveRow("proposals", { id: p.id, status, ...extra });
    if (!r.ok) return toast(r.error, "error");
    toast(`Marcada como ${labelOf(PROPOSAL_STATUS, status).toLowerCase()}`);
  }

  async function open(p: Proposal) {
    if (!p.file_path) return;
    const r = await getFileUrl(p.file_path);
    if (!r.ok || !r.data) return toast(r.ok ? "No se pudo abrir" : r.error, "error");
    window.open(r.data.url, "_blank", "noopener");
  }

  async function remove(p: Proposal) {
    if (!(await confirm(`¿Eliminar “${p.title}”?`, { danger: true }))) return;
    const r = await deleteRow("proposals", p.id);
    if (!r.ok) toast(r.error, "error");
  }

  return (
    <div className="stack gap16">
      <div className="row between">
        <div className="muted small">
          {proposals.length} documentos{approved.length ? ` · ${approved.length} aprobada${approved.length > 1 ? "s" : ""}` : ""}
        </div>
        {editable && <button className="btn sm primary" onClick={() => setModal({ kind: "propuesta", version: nextVersion("propuesta"), currency: lead.currency })}><IPlus /> Nueva propuesta / presentación</button>}
      </div>

      <section className="card">
        {proposals.length === 0 && (
          <div className="empty">
            <IPresent width={22} height={22} style={{ margin: "0 auto 8px" }} />
            Aquí quedan todas las propuestas, presentaciones y cotizaciones que le hemos hecho, con sus versiones.
          </div>
        )}
        {proposals.map((p) => (
          <div key={p.id} className="item">
            <div className="item-top">
              <div className="grow">
                <div className="row wrap gap6">
                  {p.url ? (
                    <a className="item-title link-title" href={p.url} target="_blank" rel="noreferrer" title={p.url}>{p.title} <IExternal width={12} /></a>
                  ) : (
                    <span className="item-title">{p.title}</span>
                  )}
                  <span className="tag">v{p.version}</span>
                  <span className="badge">{labelOf(PROPOSAL_KINDS, p.kind)}</span>
                  <span className={`badge ${statusClass(p.status)}`}>{labelOf(PROPOSAL_STATUS, p.status)}</span>
                </div>
                <div className="item-meta">
                  {p.amount != null && <span className="mono" style={{ color: "var(--fg)" }}>{money(p.amount, p.currency)}</span>}
                  {p.sent_at && <span>Enviada {date(p.sent_at)}</span>}
                  <span>Por {nameOf(p.created_by)}</span>
                </div>
                {p.notes && <div className="item-body small pre"><Linkify text={p.notes} /></div>}
                <div className="row wrap gap6 mt8">
                  {p.url && <a className="btn sm" href={p.url} target="_blank" rel="noreferrer"><IExternal /> Abrir {hostOf(p.url)}</a>}
                  {!p.url && !p.file_path && editable && <button className="btn ghost sm" onClick={() => setModal(p)}><IPlus /> Agregar enlace o archivo</button>}
                  {p.file_path && <button className="btn sm" onClick={() => open(p)}><IDownload /> Archivo</button>}
                  {editable && (
                    <select className="select" style={{ width: "auto", minHeight: 28, height: 28, padding: "0 28px 0 8px", fontSize: 12.5 }} value={p.status} onChange={(e) => setStatus(p, e.target.value)} aria-label="Estado">
                      {PROPOSAL_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  )}
                </div>
              </div>
              {editable && (
                <div className="item-actions">
                  <button className="btn ghost sm icon" onClick={() => setModal({ ...p, id: undefined, version: nextVersion(p.kind), status: "borrador", sent_at: null, file_path: null })} title="Nueva versión" aria-label="Nueva versión"><IPlus /></button>
                  <button className="btn ghost sm icon" onClick={() => setModal(p)} aria-label="Editar"><IEdit /></button>
                  <button className="btn ghost sm icon" onClick={() => remove(p)} aria-label="Eliminar"><ITrash /></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </section>

      {modal && <ProposalModal lead={lead} proposal={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

function ProposalModal({ lead, proposal, onClose }: { lead: LeadOverview; proposal: Partial<Proposal>; onClose: () => void }) {
  const { toast } = useUi();
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, unknown>;
    delete data.file;
    setBusy(true);
    try {
      if (file) data.file_path = await uploadFile(lead.id, file, "propuestas");
      const r = await saveRow("proposals", { ...data, lead_id: lead.id, id: proposal.id });
      if (!r.ok) throw new Error(r.error);
      toast(proposal.id ? "Propuesta actualizada" : "Propuesta guardada");
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={proposal.id ? "Editar documento" : "Nueva propuesta / presentación"} onClose={onClose} size="lg">
      <form onSubmit={submit} className="grid g4">
        <Field label="Título *" className="span2"><input className="input" name="title" required defaultValue={proposal.title ?? ""} placeholder="Propuesta de automatización operativa" autoFocus /></Field>
        <Field label="Tipo">
          <select className="select" name="kind" defaultValue={proposal.kind ?? "propuesta"}>
            {PROPOSAL_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Versión"><input className="input" type="number" min={1} name="version" defaultValue={proposal.version ?? 1} /></Field>
        <Field label="Estado">
          <select className="select" name="status" defaultValue={proposal.status ?? "borrador"}>
            {PROPOSAL_STATUS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Fecha de envío"><input className="input" type="date" name="sent_at" defaultValue={proposal.sent_at ?? ""} /></Field>
        <Field label="Monto"><input className="input" name="amount" inputMode="numeric" defaultValue={proposal.amount ?? ""} /></Field>
        <Field label="Moneda">
          <select className="select" name="currency" defaultValue={proposal.currency ?? "COP"}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Enlace (Drive, Slides, Claude, Figma…)" className="span-all"><input className="input" name="url" defaultValue={proposal.url ?? ""} placeholder="https://" /></Field>
        <Field label={proposal.file_path ? "Reemplazar archivo (opcional)" : "O sube el archivo (PDF, deck… máx 50 MB)"} className="span-all">
          <input className="input" type="file" name="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <Field label="Notas" className="span-all"><textarea className="textarea" name="notes" defaultValue={proposal.notes ?? ""} placeholder="Qué cambió frente a la versión anterior, feedback del cliente…" /></Field>
        <div className="span-all row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{busy ? (file ? "Subiendo…" : "Guardando…") : "Guardar"}</button>
        </div>
      </form>
    </Modal>
  );
}

/** "lemonjoy-kosma.netlify.app" → "lemonjoy-kosma.netlify.app", "docs.google.com/presentation" → "Google Slides" */
export function hostOf(url: string) {
  try {
    const u = new URL(url);
    if (u.hostname === "docs.google.com") return u.pathname.startsWith("/presentation") ? "Google Slides" : u.pathname.startsWith("/spreadsheets") ? "Google Sheets" : "Google Docs";
    if (u.hostname === "drive.google.com") return "Drive";
    if (u.hostname.endsWith("claude.ai")) return "Claude";
    if (u.hostname.endsWith("figma.com")) return "Figma";
    if (u.hostname.endsWith("canva.com")) return "Canva";
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "enlace";
  }
}
