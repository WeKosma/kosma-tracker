"use client";

import { useState } from "react";
import { addMember, removeMember, resetMemberPassword, updateMember } from "@/app/actions";
import { ROLES } from "@/lib/constants";
import type { Member, Role } from "@/lib/types";
import PageTopbar from "./PageTopbar";
import { useShell } from "./AppShell";
import { Avatar, Field, Modal, useUi } from "./ui";
import { IKey, IPlus, ITrash } from "./icons";

export default function TeamView({
  members, load, isAdmin, hasSecret,
}: { members: Member[]; load: Record<string, { open: number; won: number }>; isAdmin: boolean; hasSecret: boolean }) {
  const { team, me } = useShell();
  const { toast, confirm } = useUi();
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);

  const profileOf = (email: string) => team.find((t) => t.email === email);

  async function changeRole(m: Member, role: Role) {
    const r = await updateMember(m.email, { role });
    if (!r.ok) return toast(r.error, "error");
    toast("Rol actualizado");
  }
  async function remove(m: Member) {
    if (!(await confirm(`¿Quitar el acceso de ${m.email}?`, { danger: true, detail: "Ya no podrá entrar al tracker. Su historial se conserva." }))) return;
    const r = await removeMember(m.email);
    if (!r.ok) return toast(r.error, "error");
    toast("Acceso retirado");
  }
  async function reset(m: Member) {
    if (!(await confirm(`¿Generar clave temporal para ${m.email}?`, { detail: "La clave actual deja de funcionar. Tú le compartes la nueva." }))) return;
    const r = await resetMemberPassword(m.email);
    if (!r.ok || !r.data) return toast(r.ok ? "Error" : r.error, "error");
    setSecret({ email: m.email, password: r.data.tempPassword });
  }

  return (
    <>
      <PageTopbar crumbs={[{ label: "Equipo" }]} />
      <div className="content">
        <div className="page-head">
          <div>
            <div className="kicker">{members.length} personas con acceso</div>
            <h1>Equipo</h1>
            <p>Solo los correos de esta lista pueden entrar al tracker. Todo lo demás queda bloqueado desde la base de datos.</p>
          </div>
          {isAdmin && <button className="btn primary" onClick={() => setAdding(true)}><IPlus /> Dar acceso</button>}
        </div>

        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr><th>Persona</th><th>Rol</th><th className="num">Leads abiertos</th><th className="num">Confirmados</th><th>Estado</th>{isAdmin && <th />}</tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const p = profileOf(m.email);
                const l = p ? load[p.id] : undefined;
                return (
                  <tr key={m.email} style={{ cursor: "default" }}>
                    <td>
                      <div className="row">
                        <Avatar name={p?.full_name ?? m.full_name ?? m.email} />
                        <div>
                          <div>{p?.full_name ?? m.full_name ?? m.email.split("@")[0]} {p?.id === me.id && <span className="faint tiny">(tú)</span>}</div>
                          <div className="tiny faint">{m.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {isAdmin && m.email !== me.email ? (
                        <select className="select" style={{ width: 130, minHeight: 30 }} value={m.role} onChange={(e) => changeRole(m, e.target.value as Role)}>
                          {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                      ) : (
                        <span className="badge">{ROLES.find((r) => r.id === m.role)?.label}</span>
                      )}
                    </td>
                    <td className="num">{l?.open ?? 0}</td>
                    <td className="num">{l?.won ?? 0}</td>
                    <td>{p ? <span className="badge ok">Activo</span> : <span className="badge warn">Sin primer ingreso</span>}</td>
                    {isAdmin && (
                      <td style={{ textAlign: "right" }}>
                        {hasSecret && <button className="btn ghost sm" onClick={() => reset(m)} title="Generar clave temporal"><IKey /> Clave</button>}
                        {m.email !== me.email && <button className="btn ghost sm icon" onClick={() => remove(m)} aria-label="Quitar acceso"><ITrash /></button>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid g3 mt24">
          {ROLES.map((r) => (
            <div key={r.id} className="card card-body">
              <div className="kicker">{r.label}</div>
              <div className="small muted mt8">{r.hint}</div>
            </div>
          ))}
        </div>
      </div>

      {adding && (
        <AddModal
          hasSecret={hasSecret}
          onClose={() => setAdding(false)}
          onDone={(email, password) => { setAdding(false); if (password) setSecret({ email, password }); else toast("Acceso agregado"); }}
        />
      )}
      {secret && (
        <Modal title="Clave temporal" size="sm" onClose={() => setSecret(null)} footer={<button className="btn primary" onClick={() => setSecret(null)}>Listo</button>}>
          <p className="muted" style={{ marginTop: 0 }}>Compártela por un canal privado con <b style={{ color: "var(--fg)" }}>{secret.email}</b>. Al entrar puede cambiarla en Mi cuenta. No la vas a volver a ver.</p>
          <div className="row">
            <code className="input mono" style={{ display: "flex", alignItems: "center", userSelect: "all" }}>{secret.password}</code>
            <button className="btn" onClick={() => { navigator.clipboard.writeText(secret.password); toast("Copiada"); }}>Copiar</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function AddModal({ hasSecret, onClose, onDone }: { hasSecret: boolean; onClose: () => void; onDone: (email: string, password?: string) => void }) {
  const { toast } = useUi();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await addMember(email, role, name);
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    onDone(email.trim().toLowerCase(), r.data?.tempPassword);
  }
  return (
    <Modal title="Dar acceso al tracker" onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <Field label="Correo"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Field>
        <Field label="Nombre"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Rol">
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label} · {r.hint}</option>)}
          </select>
        </Field>
        <p className="tiny muted" style={{ margin: 0 }}>
          {hasSecret
            ? "Se crea su usuario con una clave temporal que verás al guardar."
            : "Falta SUPABASE_SECRET_KEY en Netlify: crea su usuario en Supabase → Authentication → Add user."}
        </p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{busy ? "…" : "Dar acceso"}</button>
        </div>
      </form>
    </Modal>
  );
}
