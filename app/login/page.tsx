import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./LoginForm";
import { KosmaMark } from "@/components/icons";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="auth">
      <div className="auth-art">
        <div className="gridbg" />
        <div className="row" style={{ position: "relative", gap: 12 }}>
          <KosmaMark style={{ width: 30 }} />
          <div>
            <div style={{ font: "300 15px/1 var(--body)", letterSpacing: ".34em" }}>KOSMA</div>
            <div className="kicker" style={{ marginTop: 5, fontSize: 9 }}>Tracker interno</div>
          </div>
        </div>
        <h1>
          COMPLEJIDAD,
          <br />
          EN ORDEN.
        </h1>
        <div className="bottom kicker">
          <span>Leads</span>
          <span>Reuniones</span>
          <span>Propuestas</span>
          <span>Cierres</span>
        </div>
      </div>
      <div className="auth-form">
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
