"use client";

import { useShell } from "./AppShell";
import ActivityItem from "./ActivityItem";
import type { Activity } from "@/lib/types";

/** Nombre de una persona del equipo por id */
export function TeamName({ id }: { id?: string | null }) {
  const { nameOf } = useShell();
  return <>{nameOf(id)}</>;
}

/** Lista de actividad (cliente, para poder resolver nombres) */
export function ActivityList({ items, companies }: { items: Activity[]; companies?: Record<string, string> }) {
  const { nameOf } = useShell();
  if (!items.length) return <div className="empty">Todavía no hay movimiento.</div>;
  return (
    <div className="timeline">
      {items.map((a) => (
        <ActivityItem key={a.id} a={a} nameOf={nameOf} company={companies && a.lead_id ? companies[a.lead_id] : undefined} />
      ))}
    </div>
  );
}
