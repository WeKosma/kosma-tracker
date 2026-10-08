"use client";
/* eslint-disable @next/next/no-img-element -- archivos privados con enlaces firmados; next/image no aplica */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { addMediaLink, deleteComment, deletePost, removeMedia, reorderMedia, reviewPost, syncMediaToDrive, updatePost } from "@/app/content-actions";
import { CONTENT_STATUS, FORMATS, PLATFORMS, mediaView, statusOf, type ContentComment, type ContentMedia, type ContentPost } from "@/lib/content";
import PublishKit from "./PublishKit";
import { bogotaLocalToISO, date, isoToBogotaLocal, profileName, relative } from "@/lib/format";
import type { Profile } from "@/lib/types";
import { useShell } from "../AppShell";
import { Avatar, useUi } from "../ui";
import { ICheck, IChevron, IExternal, ILink, IPlus, ITrash, IUpload, IX } from "../icons";
import Linkify from "../Linkify";
import type { Uploading } from "./ContentView";

type Props = {
  post: ContentPost;
  media: ContentMedia[];
  comments: ContentComment[];
  team: Profile[];
  readOnly: boolean;
  drive: { connected: boolean; ready: boolean };
  ig: { connected: boolean; username: string | null };
  uploads: Uploading[];
  onUpload: (files: File[], mode: "append" | "replace", version: number, startPos: number) => Promise<void>;
  onClose: () => void;
};

const KIND_LABEL: Record<string, string> = { approve: "Aprobó", changes: "Pidió cambios", comment: "Comentó", system: "" };

export default function PostModal({ post, media, comments, team, readOnly, drive, ig, uploads, onUpload, onClose }: Props) {
  const router = useRouter();
  const { toast, confirm } = useUi();
  const { me, nameOf } = useShell();

  const versions = useMemo(() => [...new Set(media.map((m) => m.version))].sort((a, b) => a - b), [media]);
  const currentVersion = media.find((m) => m.is_current)?.version ?? versions[versions.length - 1] ?? 0;
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const shownVersion = viewVersion ?? currentVersion;
  const shown = media.filter((m) => m.version === shownVersion).sort((a, b) => a.position - b.position);
  const isCurrent = shownVersion === currentVersion;
  const shownLen = shown.length;
  const [idx, setIdx] = useState(0);
  const at = Math.min(idx, Math.max(0, shown.length - 1));
  const active = shown[at];
  const view = active ? mediaView(active) : null;

  // Formulario
  const [f, setF] = useState(() => ({
    title: post.title,
    when: isoToBogotaLocal(post.publish_at),
    platforms: post.platforms,
    format: post.format,
    caption: post.caption ?? "",
    hashtags: post.hashtags ?? "",
    owner_id: post.owner_id ?? "",
    status: post.status,
    published_url: post.published_url ?? "",
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const dirty =
    f.title !== post.title || bogotaLocalToISO(f.when) !== new Date(post.publish_at).toISOString() ||
    f.platforms.join() !== post.platforms.join() || f.format !== post.format ||
    f.caption !== (post.caption ?? "") || f.hashtags !== (post.hashtags ?? "") || f.owner_id !== (post.owner_id ?? "") ||
    f.status !== post.status || f.published_url !== (post.published_url ?? "");
  const [saving, setSaving] = useState(false);

  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropping, setDropping] = useState(false);
  const appendInput = useRef<HTMLInputElement>(null);
  const swipe = useRef<number | null>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const st = statusOf(post.status);

  async function save() {
    setSaving(true);
    const r = await updatePost(post.id, {
      title: f.title, publish_at: bogotaLocalToISO(f.when), platforms: f.platforms, format: f.format,
      caption: f.caption, hashtags: f.hashtags, owner_id: f.owner_id || null, status: f.status, published_url: f.published_url,
    });
    setSaving(false);
    if (!r.ok) return toast(r.error, "error");
    toast("Publicación guardada");
    router.refresh();
  }

  async function review(kind: "comment" | "approve" | "changes") {
    setBusy(kind);
    const r = await reviewPost(post.id, kind, note);
    setBusy(null);
    if (!r.ok) return toast(r.error, "error");
    setNote("");
    toast(kind === "approve" ? "Aprobado" : kind === "changes" ? "Cambios pedidos. El equipo fue avisado." : "Comentario guardado");
    router.refresh();
  }

  async function remove() {
    if (!(await confirm(`¿Eliminar "${post.title}"?`, { danger: true, detail: "Se borran sus artes del tracker y el feedback. Las copias en Drive se quedan." }))) return;
    const r = await deletePost(post.id);
    if (!r.ok) return toast(r.error, "error");
    toast("Publicación eliminada");
    onClose();
    router.refresh();
  }

  async function removeOne(m: ContentMedia) {
    if (!(await confirm(`¿Quitar ${m.name ?? "este archivo"}?`, { danger: true }))) return;
    const r = await removeMedia(m.id);
    if (!r.ok) return toast(r.error, "error");
    setIdx(0);
    router.refresh();
  }

  async function reorder(from: number, to: number) {
    if (from === to) return;
    const ids = shown.map((m) => m.id);
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x);
    const r = await reorderMedia(post.id, ids);
    if (!r.ok) return toast(r.error, "error");
    setIdx(to);
    router.refresh();
  }

  async function addLink() {
    const r = await addMediaLink(post.id, link, "append");
    if (!r.ok) return toast(r.error, "error");
    setLink("");
    setLinkOpen(false);
    router.refresh();
  }

  async function toDrive(m: ContentMedia) {
    setBusy(`drive-${m.id}`);
    const r = await syncMediaToDrive(m.id);
    setBusy(null);
    if (!r.ok) return toast(r.error, "error");
    toast("Copiado al Drive de KOSMA");
    router.refresh();
  }

  const upload = (files: FileList | null, mode: "append" | "replace") => {
    if (!files?.length) return;
    const list = [...files];
    const nextVersion = mode === "replace" || currentVersion === 0 ? currentVersion + 1 : currentVersion;
    const start = mode === "replace" ? 0 : shown.length;
    onUpload(list, mode, nextVersion, start).then(() => {
      setViewVersion(null);
      if (mode === "replace") setIdx(0);
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target as HTMLElement).closest("input, textarea, select")) onClose();
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !(e.target as HTMLElement).closest("input, textarea, select") && shownLen > 1) {
        setIdx((i) => (e.key === "ArrowRight" ? i + 1 : i - 1 + shownLen) % shownLen);
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, shownLen]);

  const thread = comments.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
  const approvedBy = post.approved_by ? nameOf(post.approved_by) : null;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal xl cpost" role="dialog" aria-modal="true" aria-label={post.title}>
        <div className="modal-head">
          <div className="row" style={{ gap: 10, minWidth: 0 }}>
            <span className="ct-st" style={{ "--st": st.color } as React.CSSProperties}>{st.label}</span>
            <h2 className="ellipsis">{post.title}</h2>
            <span className="tiny faint nowrap hide-sm">{date(post.publish_at, { weekday: "long", day: "numeric", month: "long", year: undefined })}</span>
          </div>
          <button className="btn ghost sm icon" onClick={onClose} aria-label="Cerrar"><IX /></button>
        </div>

        <div className="cpost-body">
          {/* ───────── Arte ───────── */}
          <div className="cpost-media">
            <div
              className={`cpost-stage${dropping ? " drop" : ""}${["historia", "reel", "video"].includes(f.format) ? " tall" : ""}`}
              onPointerDown={(e) => { swipe.current = e.clientX; }}
              onPointerUp={(e) => {
                const dx = swipe.current === null ? 0 : e.clientX - swipe.current;
                swipe.current = null;
                if (shown.length > 1 && Math.abs(dx) > 50 && view?.kind === "image") setIdx(dx < 0 ? (at + 1) % shown.length : (at - 1 + shown.length) % shown.length);
              }}
              onDragOver={(e) => { if (!readOnly && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDropping(true); } }}
              onDragLeave={() => setDropping(false)}
              onDrop={(e) => { e.preventDefault(); setDropping(false); upload(e.dataTransfer.files, "append"); }}
            >
              {view ? (
                view.kind === "image" ? <img src={view.src} alt={active?.name ?? ""} /> :
                view.kind === "video" ? <video src={view.src} controls playsInline preload="metadata" /> :
                view.kind === "drive" ? <iframe src={view.src} allow="autoplay" title={active?.name ?? "Video"} /> :
                <a className="btn" href={view.src} target="_blank" rel="noreferrer"><IExternal /> Abrir enlace</a>
              ) : (
                <div className="cpost-empty">
                  <IUpload width={22} height={22} />
                  <div>{readOnly ? "Sin arte todavía" : "Arrastra aquí la imagen o el video"}</div>
                  {!readOnly && <button className="btn sm" onClick={() => appendInput.current?.click()}>Escoger archivos</button>}
                </div>
              )}
              {shown.length > 1 && (
                <>
                  <button className="cpost-nav prev" onClick={() => setIdx((at - 1 + shown.length) % shown.length)} aria-label="Anterior"><IChevron style={{ transform: "rotate(180deg)" }} /></button>
                  <button className="cpost-nav next" onClick={() => setIdx((at + 1) % shown.length)} aria-label="Siguiente"><IChevron /></button>
                  <span className="cpost-count">{at + 1} / {shown.length}</span>
                </>
              )}
              {shown.length > 1 && (
                <span className="cpost-dots" aria-hidden>
                  {shown.map((m, i) => <i key={m.id} className={i === at ? "on" : ""} />)}
                </span>
              )}
              {!isCurrent && <span className="cpost-old">Versión {shownVersion} (anterior)</span>}
              {dropping && <span className="cpost-dropmsg">Soltar para agregar</span>}
            </div>

            {shown.length > 0 && (
              <div className="cpost-strip">
                {shown.map((m, i) => {
                  const v = mediaView(m);
                  return (
                    <div
                      key={m.id}
                      className={`cpost-th${i === at ? " on" : ""}`}
                      draggable={!readOnly && isCurrent}
                      onDragStart={() => setDragIdx(i)}
                      onDragOver={(e) => { if (dragIdx !== null) e.preventDefault(); }}
                      onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) reorder(dragIdx, i); setDragIdx(null); }}
                      onClick={() => setIdx(i)}
                      title={m.name ?? ""}
                    >
                      {v?.kind === "image" ? <img src={v.src} alt="" loading="lazy" /> : v?.kind === "video" ? <video src={v.src} muted preload="metadata" /> : <span className="tiny">{v?.kind === "drive" ? "Video" : "Link"}</span>}
                      <span className="cpost-th-n">{i + 1}</span>
                    </div>
                  );
                })}
                {!readOnly && isCurrent && (
                  <button className="cpost-th add" onClick={() => appendInput.current?.click()} title="Agregar lámina" aria-label="Agregar lámina"><IPlus /></button>
                )}
              </div>
            )}
            {shown.length > 1 && !readOnly && isCurrent && <div className="tiny faint" style={{ marginTop: -4 }}>Carrusel de {shown.length} láminas · arrastra las miniaturas para cambiar el orden</div>}

            {active && (
              <div className="cpost-file row wrap">
                <span className="tiny muted ellipsis grow">{active.name}{active.size_bytes ? ` · ${(active.size_bytes / 1048576).toFixed(1)} MB` : ""}</span>
                {active.src && <a className="btn ghost sm" href={active.src} download={active.name ?? true} target="_blank" rel="noreferrer">Abrir</a>}
                {active.drive_url ? (
                  <a className="btn ghost sm" href={active.drive_url} target="_blank" rel="noreferrer"><IExternal /> Drive</a>
                ) : active.path && drive.ready && !readOnly ? (
                  <button className="btn ghost sm" onClick={() => toDrive(active)} disabled={busy !== null}>{busy === `drive-${active.id}` ? "Copiando…" : "Copiar a Drive"}</button>
                ) : null}
                {!readOnly && isCurrent && <button className="btn ghost sm icon" onClick={() => removeOne(active)} aria-label="Quitar archivo" title="Quitar este archivo"><ITrash /></button>}
              </div>
            )}

            {uploads.length > 0 && (
              <div className="ct-uploads" style={{ border: 0, padding: 0 }}>
                {uploads.map((u) => (
                  <div key={u.id} className={`ct-up${u.error ? " err" : ""}`}>
                    <span className="ellipsis grow">{u.name}</span>
                    {u.error ? <span className="tiny">{u.error}</span> : <span className="ct-bar"><i style={{ width: `${u.pct}%` }} /></span>}
                  </div>
                ))}
              </div>
            )}

            {!readOnly && (
              <div className="row wrap" style={{ gap: 6 }}>
                <button className="btn sm" onClick={() => appendInput.current?.click()}><IPlus /> {shown.length ? "Agregar láminas" : "Agregar archivos"}</button>
                {currentVersion > 0 && <button className="btn sm" onClick={() => replaceInput.current?.click()}><IUpload /> Subir nueva versión</button>}
                <button className="btn ghost sm" onClick={() => setLinkOpen((x) => !x)}><ILink /> Pegar enlace</button>
              </div>
            )}
            {linkOpen && (
              <div className="row" style={{ gap: 6 }}>
                <input className="input grow" placeholder="https://drive.google.com/… o enlace del video" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLink()} autoFocus />
                <button className="btn sm primary" onClick={addLink} disabled={!link.trim()}>Agregar</button>
              </div>
            )}

            {versions.length > 1 && (
              <div className="cpost-versions">
                <span className="kicker">Versiones</span>
                {versions.map((v) => {
                  const first = media.find((m) => m.version === v);
                  return (
                    <button key={v} className={v === shownVersion ? "on" : ""} onClick={() => { setViewVersion(v === currentVersion ? null : v); setIdx(0); }}>
                      v{v}{v === currentVersion ? " · actual" : ""} <span className="faint">{first ? date(first.created_at, { day: "numeric", month: "short", year: undefined }) : ""}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <input ref={appendInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { upload(e.target.files, "append"); e.target.value = ""; }} />
            <input ref={replaceInput} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { upload(e.target.files, "replace"); e.target.value = ""; }} />
          </div>

          {/* ───────── Datos + feedback ───────── */}
          <div className="cpost-side">
            {["aprobado", "programado", "publicado"].includes(post.status) ? (
              <PublishKit post={post} count={media.filter((m) => m.is_current).length} ig={ig} readOnly={readOnly} dirty={dirty} text={[f.caption.trim(), f.hashtags.trim()].filter(Boolean).join("\n\n")} />
            ) : (
              post.status !== "idea" && <div className="cpost-kit-hint tiny faint">Cuando se apruebe aparece aquí el kit para publicar: copiar texto, descargar los archivos y publicar en Instagram.</div>
            )}
            <div className="stack" style={{ gap: 12 }}>
              <label className="field"><span>Título interno</span><input className="input" value={f.title} onChange={(e) => set("title", e.target.value)} disabled={readOnly} /></label>
              <div className="grid g2" style={{ gap: 10 }}>
                <label className="field"><span>Fecha y hora</span><input className="input" type="datetime-local" value={f.when} onChange={(e) => set("when", e.target.value)} disabled={readOnly} /></label>
                <label className="field"><span>Estado</span>
                  <select className="select" value={f.status} onChange={(e) => set("status", e.target.value)} disabled={readOnly}>
                    {CONTENT_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <label className="field"><span>Formato</span>
                  <select className="select" value={f.format} onChange={(e) => set("format", e.target.value)} disabled={readOnly}>
                    {FORMATS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </label>
                <label className="field"><span>Responsable</span>
                  <select className="select" value={f.owner_id} onChange={(e) => set("owner_id", e.target.value)} disabled={readOnly}>
                    <option value="">Sin asignar</option>
                    {team.map((t) => <option key={t.id} value={t.id}>{profileName(t)}</option>)}
                  </select>
                </label>
              </div>
              <div className="field">
                <span>Redes</span>
                <div className="ct-platforms">
                  {PLATFORMS.map((p) => {
                    const on = f.platforms.includes(p.id);
                    return (
                      <button key={p.id} type="button" className={on ? "on" : ""} disabled={readOnly}
                        onClick={() => set("platforms", on ? f.platforms.filter((x) => x !== p.id) : [...f.platforms, p.id])}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="field">
                <span className="row between">Copy <span className={`tiny ${f.caption.length > 2200 ? "danger-text" : "faint"}`}>{f.caption.length} / 2200</span></span>
                <textarea className="input" rows={5} value={f.caption} onChange={(e) => set("caption", e.target.value)} placeholder="El texto que acompaña la publicación" disabled={readOnly} />
              </label>
              <label className="field"><span>Hashtags / CTA</span><input className="input" value={f.hashtags} onChange={(e) => set("hashtags", e.target.value)} placeholder="#IA #operaciones · Agenda tu diagnóstico" disabled={readOnly} /></label>
              {(f.status === "publicado" || f.published_url) && (
                <label className="field"><span>Link publicado</span><input className="input" value={f.published_url} onChange={(e) => set("published_url", e.target.value)} placeholder="https://instagram.com/p/…" disabled={readOnly} /></label>
              )}
              {!readOnly && dirty && (
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button>
                </div>
              )}
            </div>

            {/* Feedback */}
            <div className="cpost-review">
              <div className="row between">
                <div className="kicker">Feedback y aprobación</div>
                {post.status === "aprobado" && approvedBy && <span className="tiny" style={{ color: "var(--ok)" }}>Aprobado por {approvedBy.split(" ")[0]} · {relative(post.approved_at)}</span>}
              </div>
              <div className="cpost-thread">
                {thread.length === 0 && <div className="tiny faint">Sin comentarios todavía.</div>}
                {thread.map((c) =>
                  c.kind === "system" ? (
                    <div key={c.id} className="cpost-sys tiny faint">{nameOf(c.author_id).split(" ")[0]} · {c.body} · {relative(c.created_at)}</div>
                  ) : (
                    <div key={c.id} className={`cpost-msg ${c.kind}`}>
                      <Avatar name={nameOf(c.author_id)} size="sm" />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="tiny">
                          <b>{nameOf(c.author_id).split(" ")[0]}</b>{" "}
                          {c.kind !== "comment" && <span className={`cpost-kind ${c.kind}`}>{c.kind === "approve" ? <ICheck width={11} /> : null}{KIND_LABEL[c.kind]}</span>}
                          {c.media_version ? <span className="faint"> · sobre v{c.media_version}</span> : null}
                          <span className="faint"> · {relative(c.created_at)}</span>
                        </div>
                        {c.body && <div className="small pre" style={{ marginTop: 3 }}><Linkify text={c.body} /></div>}
                      </div>
                      {c.author_id === me.id && <button className="btn ghost sm icon" onClick={async () => { const r = await deleteComment(c.id); if (!r.ok) toast(r.error, "error"); else router.refresh(); }} aria-label="Borrar comentario"><IX width={12} /></button>}
                    </div>
                  )
                )}
              </div>
              {!readOnly && (
                <div className="stack" style={{ gap: 8 }}>
                  <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Escribe feedback: qué cambiar en el arte, el copy o la fecha…" />
                  <div className="row wrap" style={{ gap: 6, justifyContent: "flex-end" }}>
                    <button className="btn sm" onClick={() => review("comment")} disabled={busy !== null || !note.trim()}>Comentar</button>
                    <button className="btn sm danger" onClick={() => review("changes")} disabled={busy !== null || !note.trim()} title="Escribe arriba qué hay que cambiar">Pedir cambios</button>
                    <button className="btn sm primary" onClick={() => review("approve")} disabled={busy !== null || !shown.length || post.status === "aprobado"}><ICheck /> Aprobar</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-foot" style={{ justifyContent: "space-between" }}>
          {!readOnly ? <button className="btn ghost danger-text" onClick={remove}><ITrash /> Eliminar publicación</button> : <span />}
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
