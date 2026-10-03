import Link from "next/link";
import { labelOf, PROPOSAL_STATUS, stageOf } from "@/lib/constants";
import { relative } from "@/lib/format";
import type { Activity } from "@/lib/types";
import { ICheck, IFile, IFlag, ILock, INote, IPlus, IPresent, IUnlock, IUser, IVideo, IArrowRight } from "./icons";

const ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  created: IPlus, stage: IArrowRight, lock: ILock, unlock: IUnlock, owner: IUser, value: IFlag,
  meeting: IVideo, proposal: IPresent, proposal_status: IPresent, note: INote, file: IFile, contact: IUser, task_done: ICheck,
};

function detail(a: Activity, nameOf: (id?: string | null) => string) {
  const m = a.meta as Record<string, string | number | null>;
  switch (a.kind) {
    case "created":
      return <>creó el lead</>;
    case "stage":
      return <>movió a <b>{stageOf(String(m.to)).label}</b></>;
    case "owner":
      return <>asignó a <b>{nameOf(m.to as string)}</b></>;
    case "meeting":
      return <>registró reunión <b>{m.title}</b></>;
    case "proposal":
      return <>{a.message.toLowerCase()} <b>{m.title}</b>{m.version ? ` v${m.version}` : ""}</>;
    case "proposal_status":
      return <>marcó <b>{m.title}</b> como {labelOf(PROPOSAL_STATUS, String(m.to)).toLowerCase()}</>;
    case "note":
      return <>escribió: <span className="faint">“{String(m.preview ?? "").slice(0, 90)}”</span></>;
    case "file":
      return <>adjuntó <b>{m.name}</b></>;
    case "contact":
      return <>agregó a <b>{m.name}</b></>;
    case "task_done":
      return <>completó <b>{m.title}</b></>;
    case "lock":
      return <>bloqueó la ficha{m.reason ? <> · <span className="faint">{m.reason}</span></> : null}</>;
    default:
      return <>{a.message.charAt(0).toLowerCase() + a.message.slice(1)}</>;
  }
}

export default function ActivityItem({
  a, nameOf, company,
}: { a: Activity; nameOf: (id?: string | null) => string; company?: string | null }) {
  const Icon = ICONS[a.kind] ?? IFlag;
  const actor = a.actor_id ? nameOf(a.actor_id) : a.kind === "created" ? "Web" : "Sistema";
  return (
    <div className="tl">
      <span className="ic"><Icon /></span>
      <div className="txt">
        <b>{actor}</b> {detail(a, nameOf)}
        {company && a.lead_id && (
          <> en <Link href={`/leads/${a.lead_id}`} style={{ color: "var(--fg)" }}>{company}</Link></>
        )}
        <div className="when">{relative(a.created_at)}</div>
      </div>
    </div>
  );
}
