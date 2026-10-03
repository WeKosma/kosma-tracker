"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { stageOf } from "@/lib/constants";
import { IBoard, IBuilding, ICalendar, IHome, IMoon, IPlus, ITable, IUser, IUsers } from "./icons";
import { useShell } from "./AppShell";

type LeadHit = { id: string; company: string; contact_name: string | null; contact_email: string | null; stage: string; tags: string[] };
type Item = { key: string; label: string; hint?: string; icon: React.ReactNode; group: string; run: () => void };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function CommandPalette({ onClose, onToggleTheme }: { onClose: () => void; onToggleTheme: () => void }) {
  const router = useRouter();
  const { openNewLead, canWrite } = useShell();
  const [q, setQ] = useState("");
  const [leads, setLeads] = useState<LeadHit[]>([]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    createClient()
      .from("leads")
      .select("id,company,contact_name,contact_email,stage,tags")
      .order("last_activity_at", { ascending: false })
      .limit(500)
      .then(({ data }: { data: LeadHit[] | null }) => setLeads(data ?? []));
  }, []);

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => { router.push(href); onClose(); };
    const actions: Item[] = [
      ...(canWrite ? [{ key: "new", label: "Crear nuevo lead", hint: "N", icon: <IPlus />, group: "Acciones", run: () => { onClose(); openNewLead(); } }] : []),
      { key: "home", label: "Ir a Inicio", icon: <IHome />, group: "Navegar", run: go("/") },
      { key: "pipe", label: "Ir al Pipeline", icon: <IBoard />, group: "Navegar", run: go("/leads") },
      { key: "table", label: "Ver leads en tabla", icon: <ITable />, group: "Navegar", run: go("/leads?vista=tabla") },
      { key: "agenda", label: "Ir a Agenda", icon: <ICalendar />, group: "Navegar", run: go("/agenda") },
      { key: "team", label: "Ir a Equipo", icon: <IUsers />, group: "Navegar", run: go("/equipo") },
      { key: "me", label: "Mi cuenta", icon: <IUser />, group: "Navegar", run: go("/cuenta") },
      { key: "theme", label: "Cambiar tema claro / oscuro", icon: <IMoon />, group: "Acciones", run: () => { onToggleTheme(); onClose(); } },
    ];
    const nq = norm(q.trim());
    const leadItems: Item[] = leads
      .filter((l) => !nq || norm([l.company, l.contact_name, l.contact_email, ...(l.tags ?? [])].join(" ")).includes(nq))
      .slice(0, nq ? 12 : 6)
      .map((l) => ({
        key: l.id,
        label: l.company,
        hint: [l.contact_name, stageOf(l.stage).label].filter(Boolean).join(" · "),
        icon: <IBuilding />,
        group: nq ? "Leads" : "Recientes",
        run: go(`/leads/${l.id}`),
      }));
    const filteredActions = actions.filter((a) => !nq || norm(a.label).includes(nq));
    return [...leadItems, ...filteredActions];
  }, [q, leads, router, onClose, openNewLead, onToggleTheme, canWrite]);


  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); items[idx]?.run(); }
    else if (e.key === "Escape") onClose();
  }

  let lastGroup = "";
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" onKeyDown={onKey}>
        <input autoFocus placeholder="Busca un cliente, contacto, etiqueta o acción…" value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} />
        <div className="results">
          {items.length === 0 && <div className="empty">Nada por aquí con “{q}”.</div>}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? <div className="group kicker">{it.group}</div> : null;
            lastGroup = it.group;
            return (
              <div key={it.key}>
                {header}
                <div className={`res ${i === idx ? "on" : ""}`} onMouseEnter={() => setIdx(i)} onClick={it.run}>
                  {it.icon}
                  <span className="ellipsis">{it.label}</span>
                  {it.hint && <span className="tiny faint ellipsis" style={{ marginLeft: "auto" }}>{it.hint}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="foot"><span>↑↓ moverse</span><span>↵ abrir</span><span>esc cerrar</span></div>
      </div>
    </div>,
    document.body
  );
}
