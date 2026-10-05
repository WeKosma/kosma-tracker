"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IX } from "./icons";
import { stageOf } from "@/lib/constants";
import { initials } from "@/lib/format";

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------
export function Modal({
  title, onClose, children, footer, size,
}: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; size?: "sm" | "lg" }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size ?? ""}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost sm icon" onClick={onClose} aria-label="Cerrar"><IX /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------
export function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Avatar({ name, size }: { name?: string | null; size?: "sm" | "lg" }) {
  return <span className={`avatar ${size ?? ""}`} title={name ?? ""}>{initials(name)}</span>;
}

export function StageBadge({ stage }: { stage: string }) {
  const s = stageOf(stage);
  return (
    <span className="badge">
      <span className="dot" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function StageDot({ stage }: { stage: string }) {
  return <span className="dot" style={{ background: stageOf(stage).color }} />;
}

// ---------------------------------------------------------------------------
// Toasts + Confirmación
// ---------------------------------------------------------------------------
type Toast = { id: number; text: string; kind: "ok" | "error" };
type ConfirmState = { text: string; detail?: string; danger?: boolean; resolve: (v: boolean) => void } | null;

const UiCtx = createContext<{
  toast: (text: string, kind?: "ok" | "error") => void;
  confirm: (text: string, opts?: { detail?: string; danger?: boolean }) => Promise<boolean>;
}>({ toast: () => {}, confirm: async () => false });

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirm] = useState<ConfirmState>(null);
  const idRef = useRef(0);

  const toast = useCallback((text: string, kind: "ok" | "error" = "ok") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 9000 : 3200);
  }, []);

  const confirm = useCallback(
    (text: string, opts?: { detail?: string; danger?: boolean }) =>
      new Promise<boolean>((resolve) => setConfirm({ text, ...opts, resolve })),
    []
  );

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirm(null);
  };

  return (
    <UiCtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "error" ? "error" : ""}`}>{t.text}</div>
        ))}
      </div>
      {confirmState && (
        <Modal
          title={confirmState.text}
          onClose={() => close(false)}
          size="sm"
          footer={
            <>
              <button className="btn" onClick={() => close(false)}>Cancelar</button>
              <button className={`btn ${confirmState.danger ? "danger" : "primary"}`} onClick={() => close(true)} autoFocus>
                Confirmar
              </button>
            </>
          }
        >
          <p className="muted" style={{ margin: 0 }}>{confirmState.detail ?? "Esta acción no se puede deshacer."}</p>
        </Modal>
      )}
    </UiCtx.Provider>
  );
}

export const useUi = () => useContext(UiCtx);
