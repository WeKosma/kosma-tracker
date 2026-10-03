import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth-form" style={{ minHeight: "100vh" }}>
      <div className="stack" style={{ width: "min(380px,100%)" }}>
        <div className="kicker">404</div>
        <div className="display" style={{ fontSize: 64, textTransform: "uppercase" }}>No está.</div>
        <p className="muted">Ese lead o página no existe, o fue eliminado.</p>
        <Link href="/" className="btn" style={{ alignSelf: "flex-start" }}>Volver al inicio</Link>
      </div>
    </div>
  );
}
