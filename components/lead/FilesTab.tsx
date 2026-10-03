"use client";

import { useRef, useState } from "react";
import { deleteRow, getFileUrl, saveRow } from "@/app/actions";
import { fileSize, relative } from "@/lib/format";
import { uploadFile } from "@/lib/upload";
import type { FileRow, LeadOverview } from "@/lib/types";
import { useShell } from "../AppShell";
import { Field, Modal, useUi } from "../ui";
import { IDownload, IExternal, IFile, IFolder, ILink, ITrash, IUpload } from "../icons";

export default function FilesTab({ lead, files, editable }: { lead: LeadOverview; files: FileRow[]; editable: boolean }) {
  const { nameOf } = useShell();
  const { toast, confirm } = useUi();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);

  async function handle(list: FileList | null) {
    if (!list?.length) return;
    for (const file of Array.from(list)) {
      setUploading(file.name);
      try {
        const path = await uploadFile(lead.id, file);
        const r = await saveRow("files", { lead_id: lead.id, name: file.name, path, size_bytes: file.size, mime: file.type });
        if (!r.ok) throw new Error(r.error);
      } catch (e) {
        toast(e instanceof Error ? e.message : "Error subiendo", "error");
      }
    }
    setUploading(null);
    toast("Archivos subidos");
  }

  async function open(f: FileRow) {
    if (f.url) return window.open(f.url, "_blank", "noopener");
    if (!f.path) return;
    const r = await getFileUrl(f.path);
    if (!r.ok || !r.data) return toast(r.ok ? "No se pudo abrir" : r.error, "error");
    window.open(r.data.url, "_blank", "noopener");
  }

  async function remove(f: FileRow) {
    if (!(await confirm(`¿Eliminar ${f.name}?`, { danger: true }))) return;
    const r = await deleteRow("files", f.id);
    if (!r.ok) toast(r.error, "error");
  }

  return (
    <div className="stack gap16">
      {lead.drive_url && (
        <a className="card row" href={lead.drive_url} target="_blank" rel="noreferrer" style={{ padding: "12px 16px" }}>
          <IFolder /> <span className="grow">Carpeta de Drive del cliente</span> <IExternal width={13} />
        </a>
      )}

      {editable && (
        <div className="row wrap gap6" style={{ alignItems: "stretch" }}>
          <div
            className={`dropzone grow ${over ? "over" : ""}`}
            onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
          >
            <IUpload />
            {uploading ? `Subiendo ${uploading}…` : "Arrastra archivos aquí o haz clic · máx 50 MB"}
            <input ref={input} type="file" multiple hidden onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
          </div>
          <button className="btn" style={{ height: "auto" }} onClick={() => setLinkOpen(true)}><ILink /> Agregar enlace de Drive</button>
        </div>
      )}

      <section className="card">
        {files.length === 0 && <div className="empty">Sin archivos. Briefs, contratos, actas, logos del cliente… todo vive aquí o en Drive.</div>}
        {files.map((f) => (
          <div key={f.id} className="taskrow">
            {f.url ? <ILink /> : <IFile />}
            <div className="grow" style={{ minWidth: 0 }}>
              <button className="ellipsis" onClick={() => open(f)} style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "left", maxWidth: "100%" }}>{f.name}</button>
              <div className="tiny faint">{[f.url ? "Enlace" : fileSize(f.size_bytes), nameOf(f.uploaded_by), relative(f.created_at)].filter(Boolean).join(" · ")}</div>
            </div>
            <button className="btn ghost sm icon" onClick={() => open(f)} aria-label="Abrir">{f.url ? <IExternal /> : <IDownload />}</button>
            {editable && <div className="item-actions"><button className="btn ghost sm icon" onClick={() => remove(f)} aria-label="Eliminar"><ITrash /></button></div>}
          </div>
        ))}
      </section>

      {linkOpen && <LinkModal leadId={lead.id} onClose={() => setLinkOpen(false)} />}
    </div>
  );
}

function LinkModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const { toast } = useUi();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!/^https?:\/\//.test(url)) return toast("El enlace debe empezar por https://", "error");
    const r = await saveRow("files", { lead_id: leadId, name: name || url, url });
    if (!r.ok) return toast(r.error, "error");
    toast("Enlace agregado");
    onClose();
  }
  return (
    <Modal title="Agregar enlace" size="sm" onClose={onClose}>
      <form onSubmit={save} className="stack">
        <Field label="Nombre"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Brief del cliente" autoFocus /></Field>
        <Field label="Enlace"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" required /></Field>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary">Agregar</button>
        </div>
      </form>
    </Modal>
  );
}
