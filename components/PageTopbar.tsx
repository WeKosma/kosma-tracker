"use client";

import { Topbar } from "./AppShell";
import { useShell } from "./AppShell";
import { IPlus, ISearch } from "./icons";

/** Topbar estándar con buscar + nuevo lead */
export default function PageTopbar({ crumbs }: { crumbs: { label: string; href?: string }[] }) {
  const { openPalette, openNewLead, canWrite } = useShell();
  return (
    <Topbar
      crumbs={crumbs}
      actions={
        <>
          <button className="btn ghost sm" onClick={openPalette}><ISearch /> <span className="tiny faint">⌘K</span></button>
          {canWrite && <button className="btn sm" onClick={() => openNewLead()}><IPlus /> Nuevo lead</button>}
        </>
      }
    />
  );
}
