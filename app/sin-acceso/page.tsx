import SignOutButton from "@/components/SignOutButton";
import { KosmaMark } from "@/components/icons";

export const metadata = { title: "Sin acceso" };

export default function NoAccess() {
  return (
    <div className="auth-form" style={{ minHeight: "100vh" }}>
      <div style={{ width: "min(380px,100%)" }} className="stack">
        <KosmaMark style={{ width: 30, marginBottom: 12 }} />
        <div className="kicker">Acceso restringido</div>
        <h2 style={{ margin: 0, fontWeight: 400 }}>Tu correo no está en el equipo</h2>
        <p className="muted">Pídele a un admin de KOSMA que te agregue en la sección Equipo.</p>
        <SignOutButton className="btn" />
      </div>
    </div>
  );
}
