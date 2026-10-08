import { Fragment } from "react";

const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"')\]]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:netlify\.app|vercel\.app|chatgpt\.site|surge\.sh|pages\.dev)(?:\/[^\s<>"')\]]*)?)/gi;

/** Texto con los enlaces convertidos en links clicables (se abren en otra pestaña). */
export default function Linkify({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        const clean = part.replace(/[.,;:!?]+$/, "");
        const tail = part.slice(clean.length);
        const href = /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
        return (
          <Fragment key={i}>
            <a className="inline-link" href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              {clean.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
            </a>
            {tail}
          </Fragment>
        );
      })}
    </>
  );
}
