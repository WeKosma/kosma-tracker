"use client";

import { useState } from "react";
import { deleteRow, saveRow } from "@/app/actions";
import { relative } from "@/lib/format";
import type { Note } from "@/lib/types";
import { useShell } from "../AppShell";
import { Avatar, useUi } from "../ui";
import { IEdit, IPin, ITrash } from "../icons";

export default function NotesTab({ leadId, notes, editable }: { leadId: string; notes: Note[]; editable: boolean }) {
  const { nameOf, me } = useShell();
  const { toast, confirm } = useUi();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    const r = await saveRow("notes", { lead_id: leadId, body });
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    setBody("");
  }

  async function saveEdit(n: Note) {
    const r = await saveRow("notes", { id: n.id, body: editBody });
    if (!r.ok) return toast(r.error, "error");
    setEditId(null);
  }

  async function togglePin(n: Note) {
    const r = await saveRow("notes", { id: n.id, pinned: !n.pinned });
    if (!r.ok) toast(r.error, "error");
  }

  async function remove(n: Note) {
    if (!(await confirm("¿Eliminar esta nota?", { danger: true }))) return;
    const r = await deleteRow("notes", n.id);
    if (!r.ok) toast(r.error, "error");
  }

  return (
    <div className="stack gap16">
      {editable && (
        <section className="card">
          <div className="card-body stack gap6">
            <textarea
              className="textarea"
              placeholder="Escribe una nota… (⌘ + Enter para guardar)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") add(); }}
            />
            <div className="row between">
              <span className="tiny faint">Las notas quedan en el historial del lead.</span>
              <button className="btn sm primary" onClick={add} disabled={busy || !body.trim()}>{busy ? "…" : "Guardar nota"}</button>
            </div>
          </div>
        </section>
      )}

      <section className="card">
        {notes.length === 0 && <div className="empty">Sin notas todavía.</div>}
        {notes.map((n) => (
          <div key={n.id} className={`item ${n.pinned ? "note-pinned" : ""}`}>
            <div className="item-top">
              <Avatar name={nameOf(n.author_id)} />
              <div className="grow">
                <div className="row gap6 small">
                  <b style={{ fontWeight: 500 }}>{nameOf(n.author_id)}</b>
                  <span className="faint tiny">{relative(n.created_at)}</span>
                  {n.pinned && <span className="badge"><IPin width={11} /> Fijada</span>}
                </div>
                {editId === n.id ? (
                  <div className="stack gap6 mt8">
                    <textarea className="textarea" value={editBody} onChange={(e) => setEditBody(e.target.value)} autoFocus />
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <button className="btn sm" onClick={() => setEditId(null)}>Cancelar</button>
                      <button className="btn sm primary" onClick={() => saveEdit(n)}>Guardar</button>
                    </div>
                  </div>
                ) : (
                  <div className="item-body" style={{ marginTop: 4 }}>{n.body}</div>
                )}
              </div>
              {editable && editId !== n.id && (
                <div className="item-actions">
                  <button className="btn ghost sm icon" onClick={() => togglePin(n)} title={n.pinned ? "Desfijar" : "Fijar arriba"} aria-label="Fijar"><IPin /></button>
                  {n.author_id === me.id && <button className="btn ghost sm icon" onClick={() => { setEditId(n.id); setEditBody(n.body); }} aria-label="Editar"><IEdit /></button>}
                  <button className="btn ghost sm icon" onClick={() => remove(n)} aria-label="Eliminar"><ITrash /></button>
                </div>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
