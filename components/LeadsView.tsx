"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { updateLead } from "@/app/actions";
import { PRIORITIES, SOURCES, STAGES, sourceLabel, stageOf } from "@/lib/constants";
import { compactMoney, date, daysSince, money, relative } from "@/lib/format";
import type { LeadOverview } from "@/lib/types";
import { Topbar, useShell } from "./AppShell";
import { Avatar, StageBadge, useUi } from "./ui";
import { IBoard, IDownload, ILock, IPlus, IPresent, ISearch, ITable, IVideo, IClock } from "./icons";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type SortKey = "company" | "stage" | "value" | "owner" | "meetings" | "proposals" | "next" | "activity";

export default function LeadsView({
  leads: initial, initialView, initialStage,
}: { leads: LeadOverview[]; initialView: "board" | "table"; initialStage?: string }) {
  const router = useRouter();
  const { team, nameOf, canWrite, openNewLead, me, role } = useShell();
  const { toast } = useUi();
  const [leads, setLeads] = useState(initial);
  const [view, setView] = useState(initialView);
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("");
  const [source, setSource] = useState("");
  const [priority, setPriority] = useState("");
  const [stage, setStage] = useState(initialStage ?? "");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "activity", dir: -1 });
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  useEffect(() => setLeads(initial), [initial]);

  const switchView = (v: "board" | "table") => {
    setView(v);
    const url = new URL(window.location.href);
    if (v === "table") url.searchParams.set("vista", "tabla");
    else url.searchParams.delete("vista");
    window.history.replaceState(null, "", url);
  };

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return leads.filter((l) => {
      if (owner && (owner === "none" ? l.owner_id : l.owner_id !== owner)) return false;
      if (source && l.source !== source) return false;
      if (priority && l.priority !== priority) return false;
      if (view === "table" && stage && l.stage !== stage) return false;
      if (nq) {
        const hay = norm([l.company, l.contact_name, l.contact_email, l.industry, l.city, l.service, ...(l.tags ?? [])].filter(Boolean).join(" "));
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
  }, [leads, q, owner, source, priority, stage, view]);

  const sorted = useMemo(() => {
    const val = (l: LeadOverview): string | number => {
      switch (sort.key) {
        case "company": return norm(l.company);
        case "stage": return STAGES.findIndex((s) => s.id === l.stage);
        case "value": return Number(l.value ?? -1);
        case "owner": return norm(nameOf(l.owner_id));
        case "meetings": return Number(l.meetings_done);
        case "proposals": return Number(l.proposals_total);
        case "next": return l.next_action_date ?? "9999";
        default: return l.last_activity_at;
      }
    };
    return [...filtered].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [filtered, sort, nameOf]);

  const canMove = (l: LeadOverview) => canWrite && (!l.locked || l.locked_by === me.id || role === "admin");

  async function move(id: string, to: string) {
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === to) return;
    if (!canMove(lead)) return toast("Esta ficha está bloqueada.", "error");
    const prev = lead.stage;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage: to, last_activity_at: new Date().toISOString() } : l)));
    const r = await updateLead(id, { stage: to });
    if (!r.ok) {
      setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage: prev } : l)));
      return toast(r.error, "error");
    }
    toast(to === "confirmado" ? `${lead.company} confirmado. El equipo fue notificado.` : `${lead.company} → ${stageOf(to).label}`);
    router.refresh();
  }

  function exportCsv() {
    const cols: [string, (l: LeadOverview) => unknown][] = [
      ["Empresa", (l) => l.company], ["Contacto", (l) => l.contact_name], ["Cargo", (l) => l.contact_role],
      ["Correo", (l) => l.contact_email], ["Teléfono", (l) => l.contact_phone], ["Etapa", (l) => stageOf(l.stage).label],
      ["Prioridad", (l) => l.priority], ["Valor", (l) => l.value], ["Moneda", (l) => l.currency],
      ["Responsable", (l) => nameOf(l.owner_id)], ["Origen", (l) => sourceLabel(l.source)], ["Servicio", (l) => l.service],
      ["Industria", (l) => l.industry], ["Ciudad", (l) => l.city], ["Reuniones", (l) => l.meetings_done],
      ["Propuestas", (l) => l.proposals_total], ["Próxima acción", (l) => l.next_action], ["Fecha próxima acción", (l) => l.next_action_date],
      ["Etiquetas", (l) => (l.tags ?? []).join(", ")], ["Drive", (l) => l.drive_url], ["Creado", (l) => l.created_at?.slice(0, 10)],
      ["Última actividad", (l) => l.last_activity_at?.slice(0, 10)],
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.map((c) => esc(c[0])).join(","), ...sorted.map((l) => cols.map((c) => esc(c[1](l))).join(","))].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `kosma-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const th = (key: SortKey, label: string, cls = "") => (
    <th className={cls} onClick={() => setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }))}>
      {label} {sort.key === key ? (sort.dir === 1 ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <>
      <Topbar
        crumbs={[{ label: "Pipeline" }]}
        actions={
          <>
            <button className="btn ghost sm" onClick={exportCsv} title="Exportar lo filtrado a CSV"><IDownload /> CSV</button>
            {canWrite && <button className="btn sm" onClick={() => openNewLead()}><IPlus /> Nuevo lead</button>}
          </>
        }
      />
      <div className="content wide">
        <div className="page-head" style={{ marginBottom: 18 }}>
          <div>
            <div className="kicker">{filtered.length} de {leads.length} leads</div>
            <h1>Pipeline</h1>
          </div>
        </div>

        <div className="toolbar">
          <div className="seg">
            <button className={view === "board" ? "on" : ""} onClick={() => switchView("board")}><IBoard /> Tablero</button>
            <button className={view === "table" ? "on" : ""} onClick={() => switchView("table")}><ITable /> Tabla</button>
          </div>
          <div className="search">
            <ISearch />
            <input className="input" placeholder="Buscar empresa, contacto, etiqueta…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="select" style={{ width: "auto" }} value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Todos los responsables</option>
            <option value={me.id}>Mis leads</option>
            {team.filter((t) => t.id !== me.id).map((t) => <option key={t.id} value={t.id}>{nameOf(t.id)}</option>)}
            <option value="none">Sin asignar</option>
          </select>
          <select className="select" style={{ width: "auto" }} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Todos los orígenes</option>
            {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <select className="select" style={{ width: "auto" }} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Cualquier prioridad</option>
            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          {view === "table" && (
            <select className="select" style={{ width: "auto" }} value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">Todas las etapas</option>
              {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          )}
          {(q || owner || source || priority || stage) && (
            <button className="btn ghost sm" onClick={() => { setQ(""); setOwner(""); setSource(""); setPriority(""); setStage(""); }}>Limpiar</button>
          )}
        </div>

        {leads.length === 0 ? (
          <div className="card">
            <div className="empty" style={{ padding: "70px 20px" }}>
              <div className="display">Empecemos.</div>
              Crea el primer lead y el sistema arranca a contar reuniones, propuestas y cierres.
              {canWrite && <div className="mt16"><button className="btn primary" onClick={() => openNewLead()}><IPlus /> Nuevo lead</button></div>}
            </div>
          </div>
        ) : view === "board" ? (
          <div className="board">
            {STAGES.map((s) => {
              const col = sorted.filter((l) => l.stage === s.id);
              const total: Record<string, number> = {};
              col.forEach((l) => { if (l.value) total[l.currency] = (total[l.currency] ?? 0) + Number(l.value); });
              return (
                <div
                  key={s.id}
                  className={`col ${overCol === s.id ? "over" : ""}`}
                  onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverCol(s.id); } }}
                  onDragLeave={() => setOverCol((c) => (c === s.id ? null : c))}
                  onDrop={(e) => { e.preventDefault(); setOverCol(null); if (dragId) move(dragId, s.id); setDragId(null); }}
                >
                  <div className="col-head">
                    <span className="dot" style={{ background: s.color }} />
                    <span className="name">{s.label}</span>
                    <span className="n">{col.length}</span>
                    <span className="sum">{Object.entries(total).map(([c, v]) => compactMoney(v, c)).join(" · ")}</span>
                  </div>
                  <div className="col-body">
                    {col.map((l) => (
                      <Link
                        key={l.id}
                        href={`/leads/${l.id}`}
                        className={`lcard ${dragId === l.id ? "dragging" : ""} ${l.priority === "alta" ? "prio-alta" : ""}`}
                        draggable={canMove(l)}
                        onDragStart={(e) => { setDragId(l.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", l.id); }}
                        onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      >
                        <div className="row between" style={{ alignItems: "flex-start" }}>
                          <div className="co">{l.company}</div>
                          {l.locked && <ILock width={13} height={13} style={{ color: "var(--warn)", flex: "none", marginTop: 2 }} />}
                        </div>
                        {l.contact_name && <div className="who ellipsis">{l.contact_name}{l.contact_role ? ` · ${l.contact_role}` : ""}</div>}
                        {(l.next_action || (l.tags?.length ?? 0) > 0) && (
                          <div className="flags">
                            {l.next_action && (
                              <span className="tiny muted ellipsis" style={{ maxWidth: "100%" }}>
                                → {l.next_action}{l.next_action_date ? ` · ${date(l.next_action_date, { year: undefined })}` : ""}
                              </span>
                            )}
                            {(l.tags ?? []).slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}
                          </div>
                        )}
                        <div className="foot">
                          <Avatar name={nameOf(l.owner_id)} size="sm" />
                          {l.value ? <span className="val">{compactMoney(Number(l.value), l.currency)}</span> : null}
                          <span className="meta-icons">
                            <span title="Reuniones realizadas"><IVideo /> {l.meetings_done}</span>
                            <span title="Propuestas"><IPresent /> {l.proposals_total}</span>
                            <span title="Última actividad" style={daysSince(l.last_activity_at) >= 14 && s.id !== "confirmado" && s.id !== "perdido" ? { color: "var(--warn)" } : undefined}>
                              <IClock /> {daysSince(l.last_activity_at)}d
                            </span>
                          </span>
                        </div>
                      </Link>
                    ))}
                    {col.length === 0 && <div className="tiny faint" style={{ padding: "18px 6px", textAlign: "center" }}>Arrastra aquí</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead>
                <tr>
                  {th("company", "Empresa")}
                  {th("stage", "Etapa")}
                  {th("value", "Valor", "num")}
                  {th("owner", "Responsable")}
                  {th("meetings", "Reuniones", "num")}
                  {th("proposals", "Propuestas", "num")}
                  {th("next", "Próxima acción")}
                  {th("activity", "Actividad")}
                </tr>
              </thead>
              <tbody>
                {sorted.map((l) => (
                  <tr key={l.id} onClick={() => router.push(`/leads/${l.id}`)}>
                    <td>
                      <div className="row gap6">
                        <b style={{ fontWeight: 500 }}>{l.company}</b>
                        {l.locked && <ILock width={12} height={12} style={{ color: "var(--warn)" }} />}
                      </div>
                      <div className="tiny faint">{[l.contact_name, sourceLabel(l.source)].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td><StageBadge stage={l.stage} /></td>
                    <td className="num">{money(l.value, l.currency)}</td>
                    <td><span className="row gap6"><Avatar name={nameOf(l.owner_id)} size="sm" /> {nameOf(l.owner_id)}</span></td>
                    <td className="num">{l.meetings_done}{l.next_meeting_at ? <span className="faint"> +1</span> : null}</td>
                    <td className="num">{l.proposals_total}</td>
                    <td className="ellipsis" style={{ maxWidth: 260 }}>
                      {l.next_action ?? <span className="faint">—</span>}
                      {l.next_action_date && <span className="tiny muted"> · {date(l.next_action_date, { year: undefined })}</span>}
                    </td>
                    <td className="muted small">{relative(l.last_activity_at)}</td>
                  </tr>
                ))}
                {sorted.length === 0 && <tr><td colSpan={8}><div className="empty">Ningún lead con esos filtros.</div></td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
