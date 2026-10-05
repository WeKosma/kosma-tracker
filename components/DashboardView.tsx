import Link from "next/link";
import { COLD_DAYS, OPEN_STAGES, STAGES, labelOf, MEETING_KINDS } from "@/lib/constants";
import { compactMoney, date, daysSince, time, todayISO } from "@/lib/format";
import type { Activity, LeadOverview, Meeting, Task } from "@/lib/types";
import type { CalendarEvent } from "@/lib/google";
import PageTopbar from "@/components/PageTopbar";
import TaskCheck from "@/components/TaskCheck";
import { ActivityList, TeamName } from "@/components/TeamName";
import { StageDot } from "@/components/ui";
import { ICalendar, ISnow } from "@/components/icons";

function sumByCurrency(leads: LeadOverview[]) {
  const out: Record<string, number> = {};
  for (const l of leads) if (l.value) out[l.currency] = (out[l.currency] ?? 0) + Number(l.value);
  return out;
}
function moneyLine(m: Record<string, number>) {
  const parts = Object.entries(m).sort((a, b) => (a[0] === "COP" ? -1 : b[0] === "COP" ? 1 : 0)).map(([c, v]) => compactMoney(v, c));
  return parts.length ? parts.join(" · ") : "Sin valores";
}

export default function DashboardView({
  leadsData, meetingsData, tasksData, actData, meetingsMonth, firstName, readOnly, calendarEvents = [],
}: {
  calendarEvents?: CalendarEvent[];
  leadsData: LeadOverview[]; meetingsData: Meeting[]; tasksData: Task[]; actData: Activity[];
  meetingsMonth: number; firstName: string; readOnly: boolean;
}) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const leads = leadsData;
  const meetings = meetingsData;
  const tasks = tasksData;
  const activity = actData;
  const linked = new Set(meetings.map((m) => m.gcal_event_id).filter(Boolean));
  const upcomingItems: { at: string; m?: Meeting; e?: CalendarEvent }[] = [
    ...meetings.map((m) => ({ at: m.starts_at, m })),
    ...calendarEvents.filter((e) => !linked.has(e.id)).map((e) => ({ at: e.start, e })),
  ]
    .sort((x, y) => x.at.localeCompare(y.at))
    .slice(0, 8);
  const company: Record<string, string> = Object.fromEntries(leads.map((l) => [l.id, l.company]));

  const open = leads.filter((l) => OPEN_STAGES.includes(l.stage as never));
  const confirmed = leads.filter((l) => l.stage === "confirmado");
  const lost = leads.filter((l) => l.stage === "perdido");
  const confirmedMonth = confirmed.filter((l) => l.confirmed_at && l.confirmed_at >= monthStart);
  const winRate = confirmed.length + lost.length ? Math.round((confirmed.length / (confirmed.length + lost.length)) * 100) : null;
  const cold = open
    .filter((l) => daysSince(l.last_activity_at) >= COLD_DAYS)
    .sort((a, b) => a.last_activity_at.localeCompare(b.last_activity_at))
    .slice(0, 6);
  const nextWeek = upcomingItems.filter((it) => new Date(it.at).getTime() < Date.now() + 7 * 86400000).length;
  const proposalsInPlay = leads.filter((l) => l.stage === "propuesta" || l.stage === "negociacion").length;

  const byStage = STAGES.map((s) => {
    const ls = leads.filter((l) => l.stage === s.id);
    return { ...s, n: ls.length, money: sumByCurrency(ls) };
  });
  const maxN = Math.max(1, ...byStage.map((s) => s.n));
  const today = todayISO();
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Bogota" }).format(now));
  const greet = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <>
      <PageTopbar crumbs={[{ label: "Inicio" }]} />
      <div className="content">
        <div className="page-head">
          <div>
            <div className="kicker">{greet}, {firstName}</div>
            <h1>El sistema, hoy.</h1>
          </div>
          <div className="kicker">{date(now, { weekday: "long", day: "numeric", month: "long" })}</div>
        </div>

        <div className="kpis">
          <div className="kpi">
            <div className="kicker">Pipeline activo</div>
            <div className="value">{open.length}</div>
            <div className="sub">{moneyLine(sumByCurrency(open))}</div>
          </div>
          <div className="kpi">
            <div className="kicker">Confirmados · mes</div>
            <div className="value">{confirmedMonth.length}</div>
            <div className="sub">{moneyLine(sumByCurrency(confirmedMonth))}</div>
          </div>
          <div className="kpi">
            <div className="kicker">Reuniones · mes</div>
            <div className="value">{meetingsMonth ?? 0}</div>
            <div className="sub">{nextWeek} en los próximos 7 días</div>
          </div>
          <div className="kpi">
            <div className="kicker">Tasa de cierre</div>
            <div className="value">{winRate == null ? "—" : `${winRate}%`}</div>
            <div className="sub">{proposalsInPlay} en propuesta o negociación</div>
          </div>
        </div>

        <div className="dash">
          <div className="stack gap16">
            <section className="card">
              <div className="card-head">
                <h2>Embudo</h2>
                <Link href="/leads" className="btn ghost sm">Ver pipeline →</Link>
              </div>
              <div className="card-body funnel">
                {byStage.map((s) => (
                  <Link key={s.id} href={`/leads?vista=tabla&etapa=${s.id}`} className="funnel-row">
                    <span className="row gap6"><StageDot stage={s.id} /> {s.label}</span>
                    <div className="bar"><div className="bar-fill" style={{ width: `${(s.n / maxN) * 100}%`, background: s.color }} /></div>
                    <span className="tiny muted mono" style={{ textAlign: "right" }}>
                      {s.n} · {Object.keys(s.money).length ? moneyLine(s.money) : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2>Próximas reuniones</h2>
                <Link href="/agenda" className="btn ghost sm">Agenda →</Link>
              </div>
              <div className="card-list">
                {upcomingItems.length === 0 && <div className="empty">No hay reuniones en los próximos 14 días.</div>}
                {upcomingItems.map((it) =>
                  it.m ? (
                    <Link key={it.m.id} href={`/leads/${it.m.lead_id}?tab=reuniones`} className="list-item">
                      <span className="when">{date(it.m.starts_at, { weekday: "short", day: "numeric", month: "short", year: undefined })}<br />{time(it.m.starts_at)}</span>
                      <span className="grow ellipsis">
                        <b style={{ fontWeight: 500 }}>{company[it.m.lead_id] ?? "—"}</b> <span className="muted">· {it.m.title}</span>
                      </span>
                      <span className="badge">{labelOf(MEETING_KINDS, it.m.kind)}</span>
                    </Link>
                  ) : (
                    <a key={it.e!.id} href={it.e!.htmlLink ?? "#"} target="_blank" rel="noreferrer" className="list-item">
                      <span className="when">{date(it.e!.start, { weekday: "short", day: "numeric", month: "short", year: undefined })}<br />{it.e!.allDay ? "Todo el día" : time(it.e!.start)}</span>
                      <span className="grow ellipsis muted">{it.e!.title}</span>
                      <span className="badge"><ICalendar width={11} /> Calendar</span>
                    </a>
                  )
                )}
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h2 className="row gap6"><ISnow width={14} height={14} /> Se están enfriando</h2>
                <span className="tiny faint">Sin movimiento hace {COLD_DAYS}+ días</span>
              </div>
              <div className="card-list">
                {cold.length === 0 && <div className="empty">Todo el pipeline está caliente. Bien ahí.</div>}
                {cold.map((l) => (
                  <Link key={l.id} href={`/leads/${l.id}`} className="list-item">
                    <StageDot stage={l.stage} />
                    <span className="grow ellipsis"><b style={{ fontWeight: 500 }}>{l.company}</b> <span className="muted">· {l.next_action ?? "sin próxima acción"}</span></span>
                    <span className="tiny mono" style={{ color: "var(--warn)" }}>{daysSince(l.last_activity_at)} días</span>
                  </Link>
                ))}
              </div>
            </section>
          </div>

          <div className="stack gap16">
            <section className="card">
              <div className="card-head">
                <h2>Tareas abiertas</h2>
                <Link href="/agenda" className="btn ghost sm">Todas →</Link>
              </div>
              <div>
                {tasks.length === 0 && <div className="empty">Nada pendiente.</div>}
                {tasks.map((t) => (
                  <div key={t.id} className="taskrow">
                    <TaskCheck id={t.id} done={t.done} disabled={readOnly} />
                    <div className="grow">
                      <div className="tt ellipsis">{t.title}</div>
                      <div className="tiny faint ellipsis">
                        {t.lead_id ? <Link href={`/leads/${t.lead_id}?tab=tareas`}>{company[t.lead_id]}</Link> : "General"}
                        {t.assignee_id && <> · <TeamName id={t.assignee_id} /></>}
                      </div>
                    </div>
                    {t.due_date && <span className={`due ${t.due_date < today ? "late" : ""}`}>{date(t.due_date, { year: undefined })}</span>}
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="card-head"><h2>Actividad del equipo</h2></div>
              <ActivityList items={activity} companies={company} />
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
