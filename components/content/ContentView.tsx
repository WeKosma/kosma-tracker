"use client";
/* eslint-disable @next/next/no-img-element -- archivos privados con enlaces firmados; next/image no aplica */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMedia, announceBatch, createPost, driveInfo, movePost, syncMediaToDrive } from "@/app/content-actions";
import { CONTENT_STATUS, FORMATS, isVideo, platformOf, statusOf, thumbOf, type ContentComment, type ContentMedia, type ContentPost } from "@/lib/content";
import { dayKey, shiftMonth } from "@/lib/calendar";
import { date, todayISO } from "@/lib/format";
import { titleFromFile, uploadArt } from "@/lib/contentUpload";
import PageTopbar from "../PageTopbar";
import { useShell } from "../AppShell";
import { Modal, useUi } from "../ui";
import { IChat, IChevron, IFolder, IPlus, IStack, IUpload } from "../icons";
import PostModal from "./PostModal";
import ContentDashboard from "./ContentDashboard";

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MAX_TILES = 2;
const DEFAULT_TIME = "12:00";
const hm = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "America/Bogota" }).format(new Date(iso));

type Props = {
  month: string;
  days: string[];
  posts: ContentPost[];
  media: ContentMedia[];
  comments: ContentComment[];
  drive: { connected: boolean; ready: boolean };
  ig: { connected: boolean; username: string | null };
  readOnly: boolean;
};

export type Uploading = { id: string; name: string; pct: number; error?: string };

type View = "resumen" | "mes" | "feed" | "lista";
const VIEWS: { id: View; label: string }[] = [
  { id: "resumen", label: "Resumen" },
  { id: "mes", label: "Mes" },
  { id: "feed", label: "Feed" },
  { id: "lista", label: "Lista" },
];
const UPLOAD_KINDS = [
  { id: "post", label: "Post", hint: "Cada archivo es una publicación" },
  { id: "carrusel", label: "Carrusel", hint: "Todos los archivos son láminas de un mismo carrusel (máx. 10)" },
  { id: "reel", label: "Reel", hint: "Cada video es un reel" },
  { id: "historia", label: "Historia", hint: "Todos van como historias de ese día" },
] as const;

export default function ContentView({ month, days, posts, media, comments, drive, ig, readOnly }: Props) {
  const router = useRouter();
  const { toast } = useUi();
  const { team, nameOf } = useShell();
  const [pending, startTransition] = useTransition();
  const today = todayISO();
  const [view, setViewState] = useState<View>("mes");
  // Recordar la última vista (después de hidratar, para no chocar con el render del servidor)
  useEffect(() => {
    try {
      const v = localStorage.getItem("kosma:content-view") as View | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v && v !== "mes" && VIEWS.some((x) => x.id === v)) setViewState(v);
    } catch {}
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem("kosma:content-view", v);
    } catch {}
  };
  const [upKind, setUpKind] = useState<(typeof UPLOAD_KINDS)[number]["id"]>("post");
  const [status, setStatus] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const [dragPost, setDragPost] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Uploading[]>([]);
  const [askGroup, setAskGroup] = useState<{ day: string; files: File[] } | null>(null);
  const [pickDay, setPickDay] = useState<string | null>(null);
  const [selDay, setSelDay] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const go = (m: string | null) => startTransition(() => router.push(m ? `/contenido?m=${m}` : "/contenido", { scroll: false }));

  // Abrir una publicación desde el enlace (?p=id)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("p");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (id) setOpenId(id);
  }, []);
  const open = (id: string | null) => {
    setOpenId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("p", id);
    else url.searchParams.delete("p");
    window.history.replaceState(null, "", url);
  };

  const mediaByPost = useMemo(() => {
    const map = new Map<string, ContentMedia[]>();
    for (const m of media) map.set(m.post_id, [...(map.get(m.post_id) ?? []), m]);
    return map;
  }, [media]);
  const current = (id: string) => (mediaByPost.get(id) ?? []).filter((m) => m.is_current).sort((a, b) => a.position - b.position);
  const feedbackCount = (id: string) => comments.filter((c) => c.post_id === id && c.kind !== "system").length;

  const visible = posts.filter((p) => !status || p.status === status);
  const byDay = useMemo(() => {
    const map = new Map<string, ContentPost[]>();
    for (const p of visible) {
      const k = dayKey(p.publish_at);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return map;
  }, [visible]);
  const inMonth = posts.filter((p) => dayKey(p.publish_at).startsWith(month));
  const counts = CONTENT_STATUS.map((s) => ({ ...s, n: inMonth.filter((p) => p.status === s.id).length }));
  const title = date(`${month}-01`, { month: "long", year: "numeric", day: undefined });

  // ── Subidas ────────────────────────────────────────────────────────────
  async function uploadInto(post: { id: string }, files: File[], mode: "append" | "replace", version: number, startPos = 0, silent = false) {
    const batch = files.map((f, i) => ({ id: `${post.id}-${Date.now()}-${i}`, name: f.name, pct: 0 }));
    setUploads((u) => [...u, ...batch]);
    const set = (id: string, patch: Partial<Uploading>) => setUploads((u) => u.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    const done: Awaited<ReturnType<typeof uploadArt>>[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        done.push(await uploadArt(post.id, files[i], { version, position: startPos + i, onProgress: (pct) => set(batch[i].id, { pct }) }));
      } catch (e) {
        set(batch[i].id, { error: e instanceof Error ? e.message : String(e) });
        toast(e instanceof Error ? e.message : "No se pudo subir", "error");
      }
    }
    if (done.length) {
      const r = await addMedia(post.id, done, mode, { silent });
      if (!r.ok) toast(r.error, "error");
      else if (drive.ready) {
        // Copia a Drive en segundo plano (lo que ya subió directo a Drive no se repite)
        const ids = r.data!.ids.filter((_, i) => done[i].path);
        Promise.all(ids.map((id) => syncMediaToDrive(id))).then((rs) => {
          const bad = rs.find((x) => !x.ok);
          if (bad && !bad.ok) toast(`Drive: ${bad.error}`, "error");
          router.refresh();
        });
      }
    }
    setUploads((u) => u.filter((x) => !batch.some((b) => b.id === x.id) || x.error));
    router.refresh();
  }

  async function createWithFiles(day: string, files: File[], grouped: boolean, kind?: string) {
    if (grouped && kind !== "historia" && files.length > 10) toast("Instagram permite máximo 10 láminas por carrusel: revisa antes de publicar.", "error");
    files = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const groups = grouped ? [files] : files.map((f) => [f]);
    const created: string[] = [];
    for (const g of groups) {
      const allVideo = g.every((f) => f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(f.name));
      const format = kind === "historia" ? "historia" : g.length > 1 ? "carrusel" : allVideo ? "reel" : kind === "reel" ? "reel" : "post";
      const r = await createPost({
        title: titleFromFile(g[0].name),
        publish_at: new Date(`${day}T${DEFAULT_TIME}:00-05:00`).toISOString(),
        format,
        status: "diseno",
      });
      if (!r.ok) {
        toast(r.error, "error");
        continue;
      }
      await uploadInto({ id: r.data!.id }, g, "append", 1, 0, true);
      created.push(r.data!.id);
    }
    // Un solo aviso (Discord + WhatsApp) por tanda de subida
    if (created.length) announceBatch(created);
    toast(groups.length === 1 ? "Publicación creada en la parrilla" : `${groups.length} publicaciones creadas`);
  }

  function onFilesForDay(day: string, list: FileList | File[]) {
    if (readOnly) return;
    const files = [...list].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/") || /\.(png|jpe?g|gif|webp|mp4|mov|m4v|webm)$/i.test(f.name));
    if (!files.length) return toast("Solo imágenes o videos.", "error");
    if (files.length > 1) setAskGroup({ day, files });
    else createWithFiles(day, files, false);
  }

  function onPicked(day: string, list: FileList) {
    const files = [...list].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/") || /\.(png|jpe?g|gif|webp|mp4|mov|m4v|webm)$/i.test(f.name));
    if (!files.length) return toast("Solo imágenes o videos.", "error");
    createWithFiles(day, files, upKind === "carrusel" || upKind === "historia", upKind);
  }

  async function newBlank(day: string) {
    if (readOnly) return;
    const r = await createPost({ title: "Nueva publicación", publish_at: new Date(`${day}T${DEFAULT_TIME}:00-05:00`).toISOString(), status: "idea" });
    if (!r.ok) return toast(r.error, "error");
    router.refresh();
    open(r.data!.id);
  }

  async function onDropDay(e: React.DragEvent, day: string) {
    e.preventDefault();
    setOverDay(null);
    if (e.dataTransfer.files?.length) return onFilesForDay(day, e.dataTransfer.files);
    const id = dragPost ?? e.dataTransfer.getData("text/kosma-post");
    setDragPost(null);
    if (!id || readOnly) return;
    const post = posts.find((p) => p.id === id);
    if (!post || dayKey(post.publish_at) === day) return;
    const r = await movePost(id, day);
    if (!r.ok) return toast(r.error, "error");
    toast(`Movida al ${date(day, { day: "numeric", month: "long", year: undefined })}`);
    router.refresh();
  }

  async function openDrive() {
    const r = await driveInfo();
    if (!r.ok) return toast(r.error, "error");
    if (!r.data!.ready) return toast(`${r.data!.reason} Reconéctalo en la Agenda.`, "error");
    window.open(r.data!.folderUrl, "_blank", "noopener");
  }

  const openPost = posts.find((p) => p.id === openId) ?? null;

  // ── Piezas de la grilla ────────────────────────────────────────────────
  const renderTile = (p: ContentPost) => {
    const cur = current(p.id);
    const th = thumbOf(cur[0]);
    const st = statusOf(p.status);
    const fb = feedbackCount(p.id);
    return (
      <span
        key={p.id}
        role="button"
        tabIndex={0}
        className={`ct-tile${th ? "" : " noart"}`}
        style={{ "--st": st.color } as React.CSSProperties}
        draggable={!readOnly}
        onDragStart={(e) => {
          e.stopPropagation();
          setDragPost(p.id);
          e.dataTransfer.setData("text/kosma-post", p.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDragPost(null)}
        onClick={(e) => {
          e.stopPropagation();
          open(p.id);
        }}
        onKeyDown={(e) => e.key === "Enter" && open(p.id)}
        title={`${p.title} · ${st.label}`}
      >
        {th ? (
          th.video ? <video src={th.src} muted preload="metadata" className="ct-thumb" /> : <img src={th.src} alt="" className="ct-thumb" loading="lazy" />
        ) : null}
        <span className="ct-meta">
          <span className="ct-time">{hm(p.publish_at)}</span>
          <span className="ct-title ellipsis">{p.title}</span>
        </span>
        <span className="ct-badges">
          {cur.length > 1 && <span className="ct-pill" title={`${cur.length} láminas`}><IStack width={9} height={9} /> {cur.length}</span>}
          {cur[0] && isVideo(cur[0]) && <span className="ct-pill" title="Video">▶</span>}
          {fb > 0 && <span className="ct-pill" title={`${fb} comentarios`}><IChat width={9} height={9} /> {fb}</span>}
        </span>
      </span>
    );
  };

  return (
    <>
      <PageTopbar crumbs={[{ label: "Contenido" }]} />
      <div className="content">
        <div className="page-head">
          <div>
            <div className="kicker">Parrillas de contenido</div>
            <h1>Contenido</h1>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn" onClick={openDrive} title="Abrir la carpeta de parrillas en el Drive de KOSMA"><IFolder /> Drive</button>
            {!readOnly && (
              <>
                <button className="btn" onClick={() => { setPickDay(today.startsWith(month) ? today : `${month}-01`); }}><IUpload /> Subir artes</button>
                <button className="btn primary" onClick={() => newBlank(today.startsWith(month) ? today : `${month}-01`)}><IPlus /> Nueva publicación</button>
              </>
            )}
          </div>
        </div>

        {!drive.ready && (
          <div className="card row wrap" style={{ padding: "10px 16px", marginBottom: 16, gap: 12 }}>
            <IFolder />
            <span className="grow small">
              <b>Drive sin conectar a la parrilla.</b>
              <span className="muted"> Los artes se guardan en el tracker igual. Para que también queden en el Drive de KOSMA (y subir videos de más de 48 MB): en la Agenda, desconecta Google y vuelve a conectarlo con hello@ para aceptar el permiso de Drive.</span>
            </span>
          </div>
        )}

        <div className="ct-status">
          <button className={!status ? "on" : ""} onClick={() => setStatus("")}>Todo <b>{inMonth.length}</b></button>
          {counts.map((s) => (
            <button key={s.id} className={status === s.id ? "on" : ""} onClick={() => setStatus(status === s.id ? "" : s.id)} disabled={!s.n && status !== s.id}>
              <i style={{ background: s.color }} /> {s.label} <b>{s.n}</b>
            </button>
          ))}
        </div>

        <section className="card cal">
          <div className="cal-bar">
            <button className="btn sm" onClick={() => go(null)} disabled={today.startsWith(month)}>Hoy</button>
            <div className="row" style={{ gap: 2 }}>
              <button className="btn ghost sm icon" onClick={() => go(shiftMonth(month, -1))} aria-label="Mes anterior"><IChevron style={{ transform: "rotate(180deg)" }} /></button>
              <button className="btn ghost sm icon" onClick={() => go(shiftMonth(month, 1))} aria-label="Mes siguiente"><IChevron /></button>
            </div>
            <h2 className="cal-title">{title}</h2>
            <span className="grow" />
            {!readOnly && view === "mes" && <span className="tiny faint hide-sm">Arrastra imágenes o videos a un día para crear la publicación</span>}
            <div className="seg">
              {VIEWS.map((v) => <button key={v.id} className={view === v.id ? "on" : ""} onClick={() => setView(v.id)}>{v.label}</button>)}
            </div>
          </div>

          {uploads.length > 0 && (
            <div className="ct-uploads">
              {uploads.map((u) => (
                <div key={u.id} className={`ct-up${u.error ? " err" : ""}`}>
                  <span className="ellipsis grow">{u.name}</span>
                  {u.error ? <span className="tiny">{u.error}</span> : <span className="ct-bar"><i style={{ width: `${u.pct}%` }} /></span>}
                  {u.error && <button className="btn ghost sm" onClick={() => setUploads((x) => x.filter((y) => y.id !== u.id))}>Quitar</button>}
                </div>
              ))}
            </div>
          )}

          {view === "resumen" && (
            <ContentDashboard
              month={month}
              today={today}
              posts={posts}
              current={current}
              comments={comments}
              onOpen={open}
              onFilter={(s) => { setStatus(s); setView("lista"); }}
            />
          )}

          {view === "mes" && (
            <div className={`cal-grid ct-grid${pending ? " loading" : ""}`}>
              {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
              {days.map((d) => {
                const list = byDay.get(d) ?? [];
                const extra = list.length - MAX_TILES;
                return (
                  <div
                    key={d}
                    className={`cal-day ct-day${!d.startsWith(month) ? " out" : ""}${d === today ? " today" : ""}${overDay === d ? " drop" : ""}${selDay === d ? " sel" : ""}`}
                    onDragOver={(e) => {
                      if (readOnly) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files") ? "copy" : "move";
                      if (overDay !== d) setOverDay(d);
                    }}
                    onDragLeave={(e) => {
                      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setOverDay((o) => (o === d ? null : o));
                    }}
                    onDrop={(e) => onDropDay(e, d)}
                    onClick={() => setSelDay(selDay === d ? null : d)}
                    onDoubleClick={() => newBlank(d)}
                  >
                    <span className="row between">
                      <span className="num">{Number(d.slice(8))}</span>
                      {!readOnly && <button className="ct-add" onClick={(e) => { e.stopPropagation(); newBlank(d); }} aria-label="Nueva publicación este día" title="Nueva publicación"><IPlus width={12} /></button>}
                    </span>
                    <span className="chips">
                      {list.slice(0, extra > 0 ? MAX_TILES - 1 : MAX_TILES).map((p) => renderTile(p))}
                      {extra > 0 && <button className="cal-more" onClick={(e) => { e.stopPropagation(); setSelDay(d); }}>+{extra + 1} más</button>}
                    </span>
                    {overDay === d && <span className="ct-dropmsg">Soltar aquí</span>}
                    {list.length > 0 && (
                      <span className="dots" aria-hidden>
                        {list.slice(0, 4).map((p) => <i key={p.id} className="lg" style={{ background: statusOf(p.status).color }} />)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {view === "mes" && selDay && (
            <div className="ct-daypanel">
              <div className="row between wrap" style={{ gap: 8 }}>
                <div className="kicker">{date(selDay, { weekday: "long", day: "numeric", month: "long", year: undefined })}</div>
                {!readOnly && (
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn sm" onClick={() => setPickDay(selDay)}><IUpload /> Subir artes</button>
                    <button className="btn sm" onClick={() => newBlank(selDay)}><IPlus /> Nueva</button>
                  </div>
                )}
              </div>
              {(byDay.get(selDay) ?? []).length === 0 && <div className="tiny faint">Nada programado este día.</div>}
              {(byDay.get(selDay) ?? []).map((p) => {
                const th = thumbOf(current(p.id)[0]);
                const st = statusOf(p.status);
                return (
                  <button key={p.id} className="ct-dayrow" onClick={() => open(p.id)}>
                    {th ? (th.video ? <video src={th.src} muted preload="metadata" className="ct-list-thumb" /> : <img src={th.src} alt="" className="ct-list-thumb" loading="lazy" />) : <span className="ct-list-thumb" />}
                    <span className="grow" style={{ minWidth: 0, textAlign: "left" }}>
                      <span className="ellipsis" style={{ display: "block", fontWeight: 500 }}>{p.title}</span>
                      <span className="tiny faint">{hm(p.publish_at)} · {FORMATS.find((f) => f.id === p.format)?.label} · {p.platforms.map((x) => platformOf(x).short).join(" ")}</span>
                    </span>
                    <span className="ct-st" style={{ "--st": st.color } as React.CSSProperties}>{st.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {view === "feed" && (
            <div className="ct-feed-wrap">
              <div className="tiny faint" style={{ textAlign: "center", padding: "14px 0 4px" }}>Así se verá el perfil con lo planeado este mes (lo más reciente arriba)</div>
              <div className="ct-feed">
                {[...visible].filter((p) => dayKey(p.publish_at).startsWith(month)).sort((a, b) => b.publish_at.localeCompare(a.publish_at)).map((p) => {
                  const cur = current(p.id);
                  const th = thumbOf(cur[0]);
                  const st = statusOf(p.status);
                  return (
                    <button key={p.id} className="ct-cell" onClick={() => open(p.id)} title={p.title}>
                      {th ? (th.video ? <video src={th.src} muted preload="metadata" /> : <img src={th.src} alt="" loading="lazy" />) : <span className="ct-cell-empty">{p.title}</span>}
                      <span className="ct-cell-tag" style={{ "--st": st.color } as React.CSSProperties}>{st.label}</span>
                      <span className="ct-cell-date">{date(p.publish_at, { day: "numeric", month: "short", year: undefined })}</span>
                      {cur.length > 1 && <span className="ct-cell-multi">{cur.length}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {view === "lista" && (
            <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
              <table className="t">
                <thead>
                  <tr><th>Fecha</th><th>Arte</th><th>Publicación</th><th>Red</th><th>Formato</th><th>Estado</th><th>Responsable</th><th>Feedback</th></tr>
                </thead>
                <tbody>
                  {visible.filter((p) => dayKey(p.publish_at).startsWith(month)).map((p) => {
                    const th = thumbOf(current(p.id)[0]);
                    const st = statusOf(p.status);
                    return (
                      <tr key={p.id} onClick={() => open(p.id)}>
                        <td className="mono small">{date(p.publish_at, { weekday: "short", day: "numeric", month: "short", year: undefined })} · {hm(p.publish_at)}</td>
                        <td>{th ? (th.video ? <video src={th.src} muted preload="metadata" className="ct-list-thumb" /> : <img src={th.src} alt="" className="ct-list-thumb" loading="lazy" />) : <span className="ct-list-thumb empty" />}</td>
                        <td><b style={{ fontWeight: 500 }}>{p.title}</b>{current(p.id).length > 1 && <div className="tiny faint">{current(p.id).length} láminas</div>}</td>
                        <td className="tiny">{p.platforms.map((x) => platformOf(x).short).join(" · ")}</td>
                        <td className="small">{FORMATS.find((f) => f.id === p.format)?.label}</td>
                        <td><span className="ct-st" style={{ "--st": st.color } as React.CSSProperties}>{st.label}</span></td>
                        <td className="small">{nameOf(p.owner_id)}</td>
                        <td className="num">{feedbackCount(p.id) || "—"}</td>
                      </tr>
                    );
                  })}
                  {!visible.some((p) => dayKey(p.publish_at).startsWith(month)) && <tr><td colSpan={8}><div className="empty">No hay publicaciones este mes.</div></td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          if (pickDay && e.target.files?.length) onPicked(pickDay, e.target.files);
          setPickDay(null);
          e.target.value = "";
        }}
      />

      {pickDay && !askGroup && (
        <Modal
          title="Subir artes"
          size="sm"
          onClose={() => setPickDay(null)}
          footer={<><button className="btn" onClick={() => setPickDay(null)}>Cancelar</button><button className="btn primary" onClick={() => fileInput.current?.click()}><IUpload /> Escoger archivos</button></>}
        >
          <div className="stack">
            <div className="field">
              <span>¿Qué vas a subir?</span>
              <div className="ct-kinds">
                {UPLOAD_KINDS.map((k) => (
                  <button key={k.id} type="button" className={upKind === k.id ? "on" : ""} onClick={() => setUpKind(k.id)}>{k.label}</button>
                ))}
              </div>
              <span className="tiny faint" style={{ textTransform: "none", letterSpacing: 0 }}>{UPLOAD_KINDS.find((k) => k.id === upKind)?.hint}</span>
            </div>
            <label className="field">
              <span>¿Para qué día?</span>
              <input className="input" type="date" value={pickDay} onChange={(e) => setPickDay(e.target.value)} />
            </label>
            <p className="tiny muted" style={{ margin: 0 }}>También puedes arrastrar los archivos directo a un día del calendario. Puedes escoger varios a la vez.</p>
          </div>
        </Modal>
      )}

      {askGroup && (
        <Modal
          title={`${askGroup.files.length} archivos para el ${date(askGroup.day, { day: "numeric", month: "long", year: undefined })}`}
          size="sm"
          onClose={() => setAskGroup(null)}
          footer={
            <>
              <button className="btn" onClick={() => { const a = askGroup; setAskGroup(null); createWithFiles(a.day, a.files, false); }}>{askGroup.files.length} publicaciones</button>
              <button className="btn primary" onClick={() => { const a = askGroup; setAskGroup(null); createWithFiles(a.day, a.files, true, "carrusel"); }}><IStack /> Un carrusel</button>
            </>
          }
        >
          <div className="stack" style={{ gap: 10 }}>
            <p className="small muted" style={{ margin: 0 }}>¿Son las láminas de un mismo carrusel o publicaciones separadas?</p>
            <div className="ct-askthumbs">
              {[...askGroup.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).slice(0, 12).map((f, i) => (
                <span key={i} className="ellipsis"><b>{i + 1}</b> {f.name}</span>
              ))}
            </div>
            <p className="tiny faint" style={{ margin: 0 }}>En el carrusel quedan en este orden (por nombre de archivo). Después puedes reordenarlas arrastrando.</p>
          </div>
        </Modal>
      )}

      {openPost && (
        <PostModal
          key={openPost.id}
          post={openPost}
          media={mediaByPost.get(openPost.id) ?? []}
          comments={comments.filter((c) => c.post_id === openPost.id)}
          team={team}
          ig={ig}
          readOnly={readOnly}
          drive={drive}
          uploads={uploads.filter((u) => u.id.startsWith(openPost.id))}
          onUpload={(files, mode, version, startPos) => uploadInto(openPost, files, mode, version, startPos)}
          onClose={() => open(null)}
        />
      )}
    </>
  );
}
