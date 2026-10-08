"use client";
/* eslint-disable @next/next/no-img-element -- archivos privados con enlaces firmados; next/image no aplica */

import { useMemo, useState } from "react";
import { CONTENT_STATUS, FORMATS, platformOf, statusOf, thumbOf, type ContentComment, type ContentMedia, type ContentPost } from "@/lib/content";
import { addDays, dayKey } from "@/lib/calendar";
import { date, relative } from "@/lib/format";

type Props = {
  month: string;
  today: string;
  posts: ContentPost[]; // todo lo cargado (el mes + bordes de la grilla)
  current: (id: string) => ContentMedia[];
  comments: ContentComment[];
  onOpen: (id: string) => void;
  onFilter: (status: string) => void;
};

type Tip = { x: number; y: number; lines: string[] } | null;

const H = 3600 * 1000;
const hm = (iso: string) => new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Bogota" }).format(new Date(iso));

/** Resumen de la parrilla del mes: qué está listo, qué se trabó y qué viene. */
export default function ContentDashboard({ month, today, posts, current, comments, onOpen, onFilter }: Props) {
  const [tip, setTip] = useState<Tip>(null);
  const [now] = useState(() => Date.now());
  const showTip = (e: React.MouseEvent, lines: string[]) => {
    const box = (e.currentTarget.closest(".cd") as HTMLElement).getBoundingClientRect();
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, lines });
  };

  const d = useMemo(() => {
    const inMonth = posts.filter((p) => dayKey(p.publish_at).startsWith(month));
    const n = (s: string) => inMonth.filter((p) => p.status === s).length;
    const published = n("publicado");

    // Tiempo de aprobación: desde la última subida de arte hasta el "Aprobar"
    const waits: number[] = [];
    for (const p of inMonth) {
      if (!p.approved_at) continue;
      const ups = comments.filter((c) => c.post_id === p.id && c.kind === "system" && c.created_at <= p.approved_at!).map((c) => c.created_at).sort();
      if (ups.length) waits.push((new Date(p.approved_at).getTime() - new Date(ups[ups.length - 1]).getTime()) / H);
    }
    const avgWait = waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null;

    const waiting = inMonth.filter((p) => p.status === "revision");
    const waitingSince = (p: ContentPost) => {
      const ups = comments.filter((c) => c.post_id === p.id && c.kind === "system").map((c) => c.created_at).sort();
      return ups[ups.length - 1] ?? p.updated_at;
    };

    // Lo que necesita atención, en orden de urgencia
    const soon = (p: ContentPost, hours: number) => new Date(p.publish_at).getTime() - now < hours * H;
    const attention: { p: ContentPost; why: string; tone: "danger" | "warn" | "muted" }[] = [];
    for (const p of posts.filter((x) => x.status !== "publicado").sort((a, b) => a.publish_at.localeCompare(b.publish_at))) {
      const late = new Date(p.publish_at).getTime() < now;
      if (p.ig_status === "error") attention.push({ p, why: "Instagram rechazó la publicación", tone: "danger" });
      else if (late && dayKey(p.publish_at) >= addDays(today, -14)) attention.push({ p, why: `Debía salir ${relative(p.publish_at)}`, tone: "danger" });
      else if (p.status === "cambios") attention.push({ p, why: "Cambios pedidos: falta subir la nueva versión", tone: "danger" });
      else if (p.status === "revision") attention.push({ p, why: `Esperando aprobación desde ${relative(waitingSince(p))}`, tone: "warn" });
      else if (!current(p.id).length && soon(p, 72) && !late) attention.push({ p, why: "Sale pronto y no tiene arte", tone: "warn" });
      else if (p.status === "aprobado" && soon(p, 48) && !late) attention.push({ p, why: "Aprobada: falta publicar o programar", tone: "muted" });
    }

    // Semanas del mes (lunes a domingo)
    const weeks: { label: string; done: number; todo: number; from: string }[] = [];
    const first = new Date(`${month}-01T12:00:00Z`);
    let start = addDays(`${month}-01`, -((first.getUTCDay() + 6) % 7));
    while (start.slice(0, 7) <= month) {
      const end = addDays(start, 6);
      const list = inMonth.filter((p) => dayKey(p.publish_at) >= start && dayKey(p.publish_at) <= end);
      weeks.push({ label: `${Number(start.slice(8))}–${Number(end.slice(8))}`, from: start, done: list.filter((p) => p.status === "publicado").length, todo: list.filter((p) => p.status !== "publicado").length });
      start = addDays(start, 7);
    }

    const next7 = Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((day) => ({ day, list: posts.filter((p) => dayKey(p.publish_at) === day) }));
    const formats = FORMATS.map((f) => ({ label: f.label, n: inMonth.filter((p) => p.format === f.id).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
    const nets = new Map<string, number>();
    for (const p of inMonth) for (const x of p.platforms) nets.set(x, (nets.get(x) ?? 0) + 1);
    const networks = [...nets].map(([id, n]) => ({ label: platformOf(id).label, n })).sort((a, b) => b.n - a.n);

    return {
      total: inMonth.length, published, n, avgWait, waits: waits.length, waiting,
      oldestWait: waiting.map(waitingSince).sort()[0] ?? null,
      next7Count: next7.reduce((a, x) => a + x.list.length, 0),
      attention: attention.slice(0, 8), attentionMore: Math.max(0, attention.length - 8),
      weeks, next7, formats, networks,
      byStatus: CONTENT_STATUS.map((s) => ({ ...s, n: n(s.id) })),
    };
  }, [posts, month, today, comments, current, now]);

  const pct = d.total ? Math.round((d.published / d.total) * 100) : 0;
  const maxStatus = Math.max(1, ...d.byStatus.map((s) => s.n));
  const maxWeek = Math.max(1, ...d.weeks.map((w) => w.done + w.todo));
  const fmtWait = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h < 10 ? h.toFixed(1) : Math.round(h)} h` : `${Math.round(h / 24)} días`);

  const renderBars = (rows: { label: string; n: number }[], total: number) => {
    const max = Math.max(1, ...rows.map((r) => r.n));
    return (
      <div className="cd-bars">
        {rows.length === 0 && <div className="tiny faint">Sin datos este mes.</div>}
        {rows.map((r) => (
          <div key={r.label} className="cd-bar" onMouseMove={(e) => showTip(e, [r.label, `${r.n} ${r.n === 1 ? "pieza" : "piezas"} · ${Math.round((r.n / Math.max(1, total)) * 100)} %`])} onMouseLeave={() => setTip(null)}>
            <span className="cd-bar-l">{r.label}</span>
            <span className="cd-bar-track"><i style={{ width: `${(r.n / max) * 100}%` }} /></span>
            <span className="cd-bar-n">{r.n}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="cd">
      {/* KPIs */}
      <div className="cd-kpis">
        <div className="cd-kpi">
          <span className="kicker">Planeadas</span>
          <b>{d.total}</b>
          <span className="tiny faint">{date(`${month}-01`, { month: "long", day: undefined, year: undefined })}</span>
        </div>
        <div className="cd-kpi">
          <span className="kicker">Publicadas</span>
          <b>{d.published}<small> / {d.total}</small></b>
          <span className="cd-progress" title={`${pct} % publicado`}><i style={{ width: `${pct}%` }} /></span>
        </div>
        <button className={`cd-kpi${d.n("revision") ? " warn" : ""}`} onClick={() => onFilter("revision")}>
          <span className="kicker">Por aprobar</span>
          <b>{d.n("revision")}</b>
          <span className="tiny faint">{d.oldestWait ? `La más antigua ${relative(d.oldestWait)}` : "Nada pendiente"}</span>
        </button>
        <button className={`cd-kpi${d.n("cambios") ? " danger" : ""}`} onClick={() => onFilter("cambios")}>
          <span className="kicker">Cambios pedidos</span>
          <b>{d.n("cambios")}</b>
          <span className="tiny faint">{d.n("cambios") ? "Falta subir versión nueva" : "Todo al día"}</span>
        </button>
        <div className="cd-kpi">
          <span className="kicker">Aprobación promedio</span>
          <b>{d.avgWait === null ? "—" : fmtWait(d.avgWait)}</b>
          <span className="tiny faint">{d.waits ? `De subir el arte a aprobarlo · ${d.waits} ${d.waits === 1 ? "pieza" : "piezas"}` : "Sin aprobaciones aún"}</span>
        </div>
      </div>

      <div className="cd-row">
        {/* Estado */}
        <section className="cd-card">
          <div className="cd-head"><h3>Estado del mes</h3><span className="tiny faint">Clic para ver la lista</span></div>
          <div className="cd-bars">
            {d.byStatus.map((s) => (
              <button
                key={s.id}
                className="cd-bar"
                disabled={!s.n}
                onClick={() => onFilter(s.id)}
                onMouseMove={(e) => showTip(e, [s.label, `${s.n} de ${d.total} · ${d.total ? Math.round((s.n / d.total) * 100) : 0} %`])}
                onMouseLeave={() => setTip(null)}
              >
                <span className="cd-bar-l"><i className="cd-dot" style={{ background: s.color }} />{s.label}</span>
                <span className="cd-bar-track"><i style={{ width: `${(s.n / maxStatus) * 100}%` }} /></span>
                <span className="cd-bar-n">{s.n}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Atención */}
        <section className="cd-card">
          <div className="cd-head"><h3>Necesita atención</h3><span className="tiny faint">{d.attention.length ? `${d.attention.length + d.attentionMore}` : ""}</span></div>
          {d.attention.length === 0 ? (
            <div className="cd-empty"><b>Todo en orden.</b><span className="tiny faint">Nada trabado ni atrasado.</span></div>
          ) : (
            <div className="cd-att">
              {d.attention.map(({ p, why, tone }) => {
                const th = thumbOf(current(p.id)[0]);
                return (
                  <button key={p.id} className="cd-att-row" onClick={() => onOpen(p.id)}>
                    {th ? (th.video ? <video src={th.src} muted preload="metadata" className="cd-th" /> : <img src={th.src} alt="" className="cd-th" loading="lazy" />) : <span className="cd-th" />}
                    <span className="grow" style={{ minWidth: 0 }}>
                      <span className="ellipsis" style={{ display: "block", fontWeight: 500 }}>{p.title}</span>
                      <span className={`tiny cd-why ${tone}`}>{why}</span>
                    </span>
                    <span className="tiny faint nowrap">{date(p.publish_at, { day: "numeric", month: "short", year: undefined })}</span>
                  </button>
                );
              })}
              {d.attentionMore > 0 && <div className="tiny faint">y {d.attentionMore} más</div>}
            </div>
          )}
        </section>
      </div>

      {/* Próximos 7 días (solo en el mes actual) */}
      {today.startsWith(month) && <section className="cd-card">
        <div className="cd-head"><h3>Próximos 7 días</h3><span className="tiny faint">{d.next7Count} {d.next7Count === 1 ? "publicación" : "publicaciones"}</span></div>
        <div className="cd-week">
          {d.next7.map(({ day, list }) => (
            <div key={day} className={`cd-day${day === today ? " today" : ""}`}>
              <div className="cd-day-h"><span>{date(day, { weekday: "short", day: undefined, month: undefined, year: undefined })}</span><b>{Number(day.slice(8))}</b></div>
              {list.length === 0 && <span className="cd-day-none">—</span>}
              {list.map((p) => {
                const th = thumbOf(current(p.id)[0]);
                const st = statusOf(p.status);
                return (
                  <button key={p.id} className="cd-day-post" onClick={() => onOpen(p.id)} title={`${p.title} · ${st.label}`} style={{ "--st": st.color } as React.CSSProperties}>
                    {th ? (th.video ? <video src={th.src} muted preload="metadata" /> : <img src={th.src} alt="" loading="lazy" />) : <span className="cd-day-noart">{p.title}</span>}
                    <span className="cd-day-meta"><i />{hm(p.publish_at)} · {st.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>}

      <div className="cd-row three">
        {/* Ritmo semanal */}
        <section className="cd-card">
          <div className="cd-head">
            <h3>Ritmo por semana</h3>
            <span className="cd-legend"><span><i className="done" />Publicadas</span><span><i className="todo" />Por publicar</span></span>
          </div>
          <div className="cd-cols">
            {d.weeks.map((w) => {
              const t = w.done + w.todo;
              return (
                <div key={w.from} className="cd-col" onMouseMove={(e) => showTip(e, [`Semana ${w.label}`, `${w.done} publicadas · ${w.todo} por publicar`])} onMouseLeave={() => setTip(null)}>
                  <span className="cd-col-n">{t || ""}</span>
                  <span className="cd-col-stack" style={{ height: `${(t / maxWeek) * 100}%` }}>
                    {w.todo > 0 && <i className="todo" style={{ flex: w.todo }} />}
                    {w.done > 0 && <i className="done" style={{ flex: w.done }} />}
                  </span>
                  <span className="cd-col-l">{w.label}</span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="cd-card">
          <div className="cd-head"><h3>Formatos</h3></div>
          {renderBars(d.formats, d.total)}
        </section>
        <section className="cd-card">
          <div className="cd-head"><h3>Redes</h3></div>
          {renderBars(d.networks, d.total)}
        </section>
      </div>

      {tip && (
        <div className="cd-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.lines.map((l, i) => (i === 0 ? <b key={i}>{l}</b> : <span key={i}>{l}</span>))}
        </div>
      )}
    </div>
  );
}
