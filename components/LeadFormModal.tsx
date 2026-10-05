"use client";

import { useState } from "react";
import { createLead, deleteLead, updateLead } from "@/app/actions";
import { useRouter } from "next/navigation";
import { ITrash } from "./icons";
import { CURRENCIES, PRIORITIES, SERVICES, SOURCES, STAGES } from "@/lib/constants";
import type { Lead } from "@/lib/types";
import { profileName } from "@/lib/format";
import { Field, Modal, useUi } from "./ui";
import { useShell } from "./AppShell";

type Props = {
  lead?: Lead;
  preset?: Record<string, unknown>;
  onClose: () => void;
  onSaved?: (id?: string) => void;
};

export default function LeadFormModal({ lead, preset, onClose, onSaved }: Props) {
  const { team, me, role } = useShell();
  const { toast, confirm } = useUi();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(Boolean(lead));
  const init = (k: keyof Lead, fallback = "") => {
    const v = lead?.[k] ?? (preset?.[k] as unknown);
    if (Array.isArray(v)) return v.join(", ");
    return v == null ? fallback : String(v);
  };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = Object.fromEntries(fd.entries()) as Record<string, unknown>;
    setBusy(true);
    const res = lead ? await updateLead(lead.id, data) : await createLead(data);
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    toast(lead ? "Cambios guardados" : "Lead creado. El equipo fue notificado.");
    onSaved?.(lead ? lead.id : (res.data as { id: string } | undefined)?.id);
    onClose();
  }

  async function remove() {
    if (!lead) return;
    const ok = await confirm(`¿Eliminar ${lead.company}?`, {
      danger: true,
      detail: "Se borran también sus reuniones, propuestas, notas, tareas y archivos. No se puede deshacer.",
    });
    if (!ok) return;
    setBusy(true);
    const r = await deleteLead(lead.id);
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    toast(`${lead.company} eliminado`);
    onClose();
    router.replace("/leads");
    router.refresh();
  }

  return (
    <Modal title={lead ? `Editar · ${lead.company}` : "Nuevo lead"} onClose={onClose} size="lg">
      <form onSubmit={submit} className="stack gap16">
        <div className="grid g2">
          <Field label="Empresa *" className="span2">
            <input className="input" name="company" required defaultValue={init("company")} autoFocus placeholder="Ej: Grupo Logístico" />
          </Field>
          <Field label="Contacto principal"><input className="input" name="contact_name" defaultValue={init("contact_name")} /></Field>
          <Field label="Cargo"><input className="input" name="contact_role" defaultValue={init("contact_role")} placeholder="Gerente de operaciones" /></Field>
          <Field label="Correo"><input className="input" type="email" name="contact_email" defaultValue={init("contact_email")} /></Field>
          <Field label="Teléfono / WhatsApp"><input className="input" name="contact_phone" defaultValue={init("contact_phone")} placeholder="+57 …" /></Field>
        </div>

        <div className="grid g4">
          <Field label="Etapa">
            <select className="select" name="stage" defaultValue={init("stage", "nuevo")}>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Prioridad">
            <select className="select" name="priority" defaultValue={init("priority", "media")}>
              {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Valor estimado"><input className="input" name="value" inputMode="numeric" defaultValue={init("value")} placeholder="0" /></Field>
          <Field label="Moneda">
            <select className="select" name="currency" defaultValue={init("currency", "COP")}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Responsable" className="span2">
            <select className="select" name="owner_id" defaultValue={init("owner_id", me.id)}>
              <option value="">Sin asignar</option>
              {team.map((t) => <option key={t.id} value={t.id}>{profileName(t)}</option>)}
            </select>
          </Field>
          <Field label="Origen">
            <select className="select" name="source" defaultValue={init("source", "otro")}>
              {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Servicio">
            <select className="select" name="service" defaultValue={init("service")}>
              <option value="">—</option>
              {SERVICES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Contexto / necesidad">
          <textarea className="textarea" name="summary" defaultValue={init("summary")} placeholder="¿Qué problema operativo tienen? ¿Qué esperan de KOSMA?" />
        </Field>

        {!more ? (
          <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => setMore(true)}>
            + Más datos (web, ciudad, Drive, etiquetas, próxima acción)
          </button>
        ) : (
          <div className="grid g2">
            <Field label="Sitio web"><input className="input" name="website" defaultValue={init("website")} placeholder="https://" /></Field>
            <Field label="Industria"><input className="input" name="industry" defaultValue={init("industry")} placeholder="Eventos corporativos" /></Field>
            <Field label="Ciudad"><input className="input" name="city" defaultValue={init("city")} /></Field>
            <Field label="País"><input className="input" name="country" defaultValue={init("country", "Colombia")} /></Field>
            <Field label="Carpeta de Drive" className="span2"><input className="input" name="drive_url" defaultValue={init("drive_url")} placeholder="https://drive.google.com/…" /></Field>
            <Field label="Etiquetas (separadas por coma)" className="span2"><input className="input" name="tags" defaultValue={init("tags")} placeholder="eventos, B2B, prioridad Q4" /></Field>
            <Field label="Próxima acción"><input className="input" name="next_action" defaultValue={init("next_action")} placeholder="Enviar propuesta v2" /></Field>
            <Field label="Fecha próxima acción"><input className="input" type="date" name="next_action_date" defaultValue={init("next_action_date")} /></Field>
          </div>
        )}

        <div className="row" style={{ justifyContent: "flex-end", borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          {lead && role === "admin" && (
            <button type="button" className="btn ghost danger-text" onClick={remove} disabled={busy} style={{ marginRight: "auto" }}>
              <ITrash /> Eliminar lead
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{busy ? "Guardando…" : lead ? "Guardar cambios" : "Crear lead"}</button>
        </div>
      </form>
    </Modal>
  );
}
