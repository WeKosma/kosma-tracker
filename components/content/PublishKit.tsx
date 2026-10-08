"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { downloadLinks, instagramStep, publishInstagram, resetInstagram, scheduleInstagram } from "@/app/content-actions";
import { IG_KIND, type ContentPost } from "@/lib/content";
import type { IgResult } from "@/lib/instagram";
import { date } from "@/lib/format";
import { useUi } from "../ui";
import { ICheck, IClock, ICopy, IDownload, IExternal, IInstagram } from "../icons";

type Props = {
  post: ContentPost;
  count: number;
  ig: { connected: boolean; username: string | null };
  readOnly: boolean;
  dirty: boolean;
  /** Copy + hashtags como están en el formulario (aunque no se hayan guardado) */
  text: string;
};

const RUNNING = ["preparando", "procesando", "publicando"];
const STEP_LABEL: Record<string, string> = {
  preparando: "Enviando archivos a Instagram",
  procesando: "Instagram está procesando",
  publicando: "Publicando",
};

/** Kit para publicar una pieza aprobada: copiar texto, descargar y publicar en Instagram. */
export default function PublishKit({ post, count, ig, readOnly, dirty, text }: Props) {
  const router = useRouter();
  const { toast, confirm } = useUi();
  const [busy, setBusy] = useState<string | null>(null);
  const [run, setRun] = useState<IgResult | null>(() =>
    post.ig_status ? { state: post.ig_status, error: post.ig_error ?? undefined, url: post.published_url ?? undefined } : null
  );
  const running = run && RUNNING.includes(run.state);
  const kind = count > 1 && post.format !== "historia" ? "Carrusel" : IG_KIND[post.format] ?? "Post";
  const published = post.status === "publicado" || run?.state === "publicado";

  // Mientras Instagram procesa, el navegador empuja el siguiente paso cada pocos segundos
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(async () => {
      const r = await instagramStep(post.id);
      if (!r.ok) return setRun({ state: "error", error: r.error });
      setRun(r.data!);
      if (r.data!.state === "publicado") {
        toast("Publicado en Instagram");
        router.refresh();
      }
      if (r.data!.state === "error") router.refresh();
    }, run.state === "preparando" ? 1200 : 4000);
    return () => clearTimeout(t);
  }, [run, running, post.id, router, toast]);

  async function copy() {
    if (!text) return toast("La pieza no tiene copy todavía.", "error");
    try {
      await navigator.clipboard.writeText(text);
      toast("Copy y hashtags copiados");
    } catch {
      toast("El navegador no dejó copiar. Selecciona el texto a mano.", "error");
    }
  }

  async function download() {
    setBusy("dl");
    const r = await downloadLinks(post.id);
    setBusy(null);
    if (!r.ok) return toast(r.error, "error");
    for (const [i, f] of r.data!.entries()) {
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = f.url;
        a.download = f.name;
        a.rel = "noopener";
        if (!f.url.includes("supabase")) a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 450);
    }
    toast(r.data!.length === 1 ? "Descargando el archivo" : `Descargando ${r.data!.length} archivos`);
  }

  async function publish() {
    if (dirty) return toast("Guarda los cambios antes de publicar.", "error");
    const ok = await confirm(`¿Publicar ya en Instagram${ig.username ? ` (@${ig.username})` : ""}?`, {
      detail: `${kind}${count > 1 ? ` · ${count} archivos` : ""}. Sale de una al perfil con el copy y los hashtags guardados.`,
    });
    if (!ok) return;
    setBusy("pub");
    const r = await publishInstagram(post.id);
    setBusy(null);
    if (!r.ok) return toast(r.error, "error");
    setRun(r.data!);
    if (r.data!.state === "error") toast(r.data!.error ?? "Instagram rechazó la publicación", "error");
  }

  async function schedule(on: boolean) {
    if (on && dirty) return toast("Guarda los cambios antes de programar.", "error");
    setBusy("sch");
    const r = await scheduleInstagram(post.id, on);
    setBusy(null);
    if (!r.ok) return toast(r.error, "error");
    toast(on ? `Se publicará sola el ${date(post.publish_at, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", year: undefined })}` : "Programación cancelada");
    router.refresh();
  }

  async function retry() {
    setBusy("retry");
    const r = await resetInstagram(post.id);
    setBusy(null);
    if (!r.ok) return toast(r.error, "error");
    setRun(null);
    router.refresh();
  }

  return (
    <div className={`cpost-kit${published ? " done" : ""}`}>
      <div className="row between">
        <div className="kicker">{published ? "Publicado" : "Listo para publicar"}</div>
        <span className="tiny faint">{kind}{count > 1 ? ` · ${count}` : ""}</span>
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn sm" onClick={copy}><ICopy /> Copiar copy + hashtags</button>
        <button className="btn sm" onClick={download} disabled={busy !== null || !count}><IDownload /> {busy === "dl" ? "Preparando…" : count > 1 ? `Descargar (${count})` : "Descargar"}</button>
      </div>

      <div className="cpost-ig">
        <div className="row" style={{ gap: 8, minWidth: 0 }}>
          <IInstagram />
          <span className="small grow ellipsis">{ig.connected ? `Instagram · @${ig.username ?? "cuenta de KOSMA"}` : "Instagram sin conectar"}</span>
        </div>

        {published ? (
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="small" style={{ color: "var(--ok)" }}><ICheck width={13} /> Ya está en el perfil</span>
            {(run?.url ?? post.published_url) && <a className="btn sm" href={run?.url ?? post.published_url!} target="_blank" rel="noreferrer"><IExternal /> Ver en Instagram</a>}
          </div>
        ) : running ? (
          <div className="stack" style={{ gap: 6 }}>
            <div className="small">{STEP_LABEL[run!.state]}{run!.progress ? ` · ${run!.progress}` : ""}…</div>
            <span className="cpost-ig-bar"><i /></span>
            <div className="tiny faint">Los videos pueden tardar unos minutos. Puedes cerrar esta ventana: el tracker termina solo.</div>
          </div>
        ) : run?.state === "error" ? (
          <div className="stack" style={{ gap: 8 }}>
            <div className="small danger-text">{run.error}</div>
            {!readOnly && <div><button className="btn sm" onClick={retry} disabled={busy !== null}>Reintentar</button></div>}
          </div>
        ) : !ig.connected ? (
          <div className="tiny faint">Un admin la conecta en Integraciones → Instagram. Mientras tanto: copia el texto y descarga los archivos.</div>
        ) : readOnly ? null : (
          <div className="stack" style={{ gap: 8 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              <button className="btn sm primary" onClick={publish} disabled={busy !== null}><IInstagram /> {busy === "pub" ? "Enviando…" : "Publicar ahora"}</button>
              {post.auto_publish ? (
                <button className="btn sm" onClick={() => schedule(false)} disabled={busy !== null}>Cancelar programación</button>
              ) : (
                <button className="btn sm" onClick={() => schedule(true)} disabled={busy !== null}><IClock /> Programar</button>
              )}
            </div>
            {post.auto_publish && (
              <div className="tiny" style={{ color: "#b9a7d6" }}>
                Se publica sola el {date(post.publish_at, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", year: undefined }).replace(/\.$/, "")}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
