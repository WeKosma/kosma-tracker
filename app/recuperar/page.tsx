"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { KosmaMark } from "@/components/icons";

export default function RecoverPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Mínimo 8 caracteres.");
    if (password !== again) return setError("Las claves no coinciden.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="auth-form" style={{ minHeight: "100vh" }}>
      <form onSubmit={submit}>
        <KosmaMark style={{ width: 30, marginBottom: 18 }} />
        <div className="kicker">Nueva clave</div>
        <h2>Crea tu clave</h2>
        {error && <div className="msg error">{error}</div>}
        <label className="field"><span>Clave nueva</span><input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <label className="field"><span>Repítela</span><input className="input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required /></label>
        <button className="btn primary mono-btn" style={{ height: 42 }} disabled={busy}>{busy ? "Guardando…" : "Guardar y entrar"}</button>
      </form>
    </div>
  );
}
