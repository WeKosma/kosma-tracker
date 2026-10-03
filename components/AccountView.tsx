"use client";

import { useState } from "react";
import { updateProfile } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";
import { ROLES } from "@/lib/constants";
import PageTopbar from "./PageTopbar";
import { Field, useUi } from "./ui";

export default function AccountView({ email, name: initialName, role }: { email: string; name: string; role: string }) {
  const { toast } = useUi();
  const [name, setName] = useState(initialName);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    const r = await updateProfile(name);
    if (!r.ok) return toast(r.error, "error");
    toast("Nombre actualizado");
  }
  async function savePw(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return toast("Mínimo 8 caracteres", "error");
    if (pw !== pw2) return toast("Las claves no coinciden", "error");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return toast(error.message, "error");
    setPw(""); setPw2("");
    toast("Clave actualizada");
  }

  return (
    <>
      <PageTopbar crumbs={[{ label: "Mi cuenta" }]} />
      <div className="content" style={{ maxWidth: 760 }}>
        <div className="page-head">
          <div>
            <div className="kicker">{email} · {ROLES.find((r) => r.id === role)?.label}</div>
            <h1>Mi cuenta</h1>
          </div>
        </div>
        <div className="stack gap16">
          <form className="card" onSubmit={saveName}>
            <div className="card-head"><h3>Cómo te ve el equipo</h3></div>
            <div className="card-body row" style={{ alignItems: "flex-end" }}>
              <Field label="Nombre" className="grow"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <button className="btn primary">Guardar</button>
            </div>
          </form>
          <form className="card" onSubmit={savePw}>
            <div className="card-head"><h3>Cambiar clave</h3></div>
            <div className="card-body grid g2">
              <Field label="Clave nueva"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
              <Field label="Repítela"><input className="input" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
              <div className="span2 row" style={{ justifyContent: "flex-end" }}><button className="btn primary" disabled={busy || !pw}>{busy ? "…" : "Actualizar clave"}</button></div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
