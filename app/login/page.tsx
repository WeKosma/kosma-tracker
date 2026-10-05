import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "./LoginForm";
import KosmaLogo from "@/components/KosmaLogo";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="auth">
      <div className="auth-art">
        <div className="gridbg" />
        <div style={{ position: "relative" }}>
          <KosmaLogo style={{ width: 132, height: "auto", display: "block" }} />
          <div className="kicker" style={{ marginTop: 10, fontSize: 9 }}>Tracker interno</div>
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
