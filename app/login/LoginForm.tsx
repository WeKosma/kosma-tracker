"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BASE_PATH } from "@/lib/env";
import { IArrowRight } from "@/components/icons";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") === "enlace" ? "El enlace expiró o ya se usó. Pide uno nuevo." : null
  );
  const [ok, setOk] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const supabase = createClient();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (error) {
        setError(/invalid/i.test(error.message) ? "Correo o clave incorrectos." : error.message);
        setBusy(false);
        return;
      }
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } else {
      const redirectTo = `${window.location.origin}${BASE_PATH}/auth/callback?next=/recuperar`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
      setBusy(false);
      if (error) setError(error.message);
      else setOk("Si el correo tiene acceso, te llegó un enlace para crear una clave nueva.");
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="kicker">{mode === "login" ? "Acceso del equipo" : "Recuperar clave"}</div>
      <h2>{mode === "login" ? "Entra al tracker" : "Te mandamos un enlace"}</h2>
      {error && <div className="msg error">{error}</div>}
      {ok && <div className="msg ok">{ok}</div>}
      <label className="field">
        <span>Correo</span>
        <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" autoFocus />
      </label>
      {mode === "login" && (
        <label className="field">
          <span>Clave</span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
      )}
      <button className="btn primary mono-btn" style={{ height: 42, justifyContent: "space-between", marginTop: 6 }} disabled={busy}>
        {busy ? "Un momento…" : mode === "login" ? "Entrar" : "Enviar enlace"}
        <IArrowRight />
      </button>
      <button type="button" className="btn ghost sm" style={{ alignSelf: "flex-start" }} onClick={() => { setMode(mode === "login" ? "reset" : "login"); setError(null); setOk(null); }}>
        {mode === "login" ? "¿Olvidaste tu clave?" : "← Volver a entrar"}
      </button>
      <p className="tiny faint" style={{ marginTop: 18 }}>Acceso privado. Solo personas del equipo KOSMA.</p>
    </form>
  );
}
