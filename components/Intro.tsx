"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import KosmaLogo from "./KosmaLogo";

const KEY = "kosma:intro";

/** Marca que, al entrar a la app, se muestre la animación de bienvenida (se llama al iniciar sesión). */
export function queueIntro() {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {}
}

/**
 * Animación de entrada después del login: el símbolo de KOSMA se arma pieza por pieza
 * (marco, señales, K y palabra), y luego la pantalla se abre hacia arriba revelando la app.
 * Se salta con cualquier tecla o clic. Respeta "reducir movimiento".
 */
export default function Intro({ name }: { name?: string }) {
  const [phase, setPhase] = useState<"off" | "play" | "out">("off");

  // Antes de pintar, para que no se vea la app un instante antes de la animación
  useLayoutEffect(() => {
    let on = false;
    try {
      on = sessionStorage.getItem(KEY) === "1";
      sessionStorage.removeItem(KEY);
    } catch {}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (on) setPhase("play");
  }, []);

  useEffect(() => {
    if (phase !== "play") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const done = () => setPhase("out");
    const t = window.setTimeout(done, reduce ? 450 : 2500);
    window.addEventListener("keydown", done);
    window.addEventListener("pointerdown", done);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", done);
      window.removeEventListener("pointerdown", done);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "out") return;
    const t = window.setTimeout(() => setPhase("off"), 800);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === "off") return null;

  return (
    <div className={`intro ${phase}`} aria-hidden="true">
      <div className="intro-grid" />
      <div className="intro-center">
        <KosmaLogo className="intro-logo" />
        <div className="intro-meta">
          <span>Tracker</span>
          <span className="intro-line"><i /></span>
          <span>{name ? `Hola, ${name}` : "Complejidad, en orden"}</span>
        </div>
      </div>
    </div>
  );
}
