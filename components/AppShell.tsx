"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Role } from "@/lib/types";
import { profileName } from "@/lib/format";
import { IBoard, ICalendar, IHome, IMenu, IMoon, IPlus, ISearch, ISun, IUser, IUsers, IPulse, IPlug } from "./icons";
import KosmaLogo from "./KosmaLogo";
import Intro from "./Intro";
import { Avatar } from "./ui";
import SignOutButton from "./SignOutButton";
import CommandPalette from "./CommandPalette";
import LeadFormModal from "./LeadFormModal";

type ShellCtx = {
  me: Profile;
  role: Role;
  team: Profile[];
  canWrite: boolean;
  openMenu: () => void;
  openPalette: () => void;
  openNewLead: (preset?: Record<string, unknown>) => void;
  nameOf: (id?: string | null) => string;
};

const Ctx = createContext<ShellCtx | null>(null);
export const useShell = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useShell fuera del AppShell");
  return c;
};

const NAV = [
  { href: "/", label: "Inicio", icon: IHome },
  { href: "/leads", label: "Pipeline", icon: IBoard },
  { href: "/agenda", label: "Agenda", icon: ICalendar },
  { href: "/pulso", label: "Pulso", icon: IPulse },
];

export default function AppShell({
  me, role, team, openCount, children,
}: { me: Profile; role: Role; team: Profile[]; openCount: number; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [newLead, setNewLead] = useState<Record<string, unknown> | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const canWrite = role !== "viewer";

  useEffect(() => {
    // Sincroniza con el tema que el script inicial puso antes de pintar
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);
  // Cerrar el menú móvil al navegar
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenu(false);
  }

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("kosma-theme", next); } catch { /* sin storage */ }
  }, [theme]);

  // Atajos: ⌘K / Ctrl+K paleta, "N" nuevo lead
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (!typing && !e.metaKey && !e.ctrlKey && e.key.toLowerCase() === "n" && canWrite) {
        e.preventDefault();
        setNewLead({});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canWrite]);

  // Tiempo real: si alguien del equipo cambia algo, la vista se refresca sola
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("kosma-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, () => schedule())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity" }, () => schedule())
      .subscribe();
    function schedule() {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => router.refresh(), 700);
    }
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  const nameOf = useCallback(
    (id?: string | null) => {
      if (!id) return "Sin asignar";
      return profileName(team.find((t) => t.id === id));
    },
    [team]
  );

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const value: ShellCtx = {
    me, role, team, canWrite, nameOf,
    openMenu: () => setMenu(true),
    openPalette: () => setPalette(true),
    openNewLead: (preset) => setNewLead(preset ?? {}),
  };

  return (
    <Ctx.Provider value={value}>
      <Intro name={(me.full_name ?? me.email).split(/[ @]/)[0]} />
      <div className="shell">
        <aside className={`sidebar ${menu ? "open" : ""}`}>
          <Link href="/" className="brandrow">
            <KosmaLogo className="brandlogo" />
            <div className="brandtag">TRACKER</div>
          </Link>

          <button className="searchbtn" onClick={() => setPalette(true)}>
            <ISearch width={14} height={14} /> Buscar…
            <kbd>⌘K</kbd>
          </button>

          {canWrite && (
            <button className="btn primary" style={{ width: "100%", marginBottom: 14 }} onClick={() => setNewLead({})}>
              <IPlus /> Nuevo lead
            </button>
          )}

          <nav className="nav">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={isActive(n.href) ? "active" : ""}>
                <n.icon /> {n.label}
                {n.href === "/leads" && openCount > 0 && <span className="count">{openCount}</span>}
              </Link>
            ))}
            <div className="nav-label kicker">Sistema</div>
            <Link href="/equipo" className={isActive("/equipo") ? "active" : ""}>
              <IUsers /> Equipo
            </Link>
            {role === "admin" && (
              <Link href="/integraciones" className={isActive("/integraciones") ? "active" : ""}>
                <IPlug /> Integraciones
              </Link>
            )}
            <Link href="/cuenta" className={isActive("/cuenta") ? "active" : ""}>
              <IUser /> Mi cuenta
            </Link>
          </nav>

          <div className="sidebar-foot">
            <div className="userchip">
              <Avatar name={profileName(me)} />
              <div className="meta grow">
                <div className="ellipsis">{profileName(me)}</div>
                <div className="tiny faint ellipsis">{role === "admin" ? "Admin" : role === "editor" ? "Editor" : "Lector"}</div>
              </div>
              <button className="btn ghost sm icon" onClick={toggleTheme} title="Cambiar tema" aria-label="Cambiar tema">
                {theme === "dark" ? <ISun /> : <IMoon />}
              </button>
            </div>
            <SignOutButton />
          </div>
        </aside>
        <div className={`scrim ${menu ? "show" : ""}`} onClick={() => setMenu(false)} />

        <div className="main">{children}</div>
      </div>

      {palette && <CommandPalette onClose={() => setPalette(false)} onToggleTheme={toggleTheme} />}
      {newLead && (
        <LeadFormModal
          preset={newLead}
          onClose={() => setNewLead(null)}
          onSaved={(id) => {
            setNewLead(null);
            if (id) router.push(`/leads/${id}`);
          }}
        />
      )}
    </Ctx.Provider>
  );
}

export function Topbar({ crumbs, actions }: { crumbs: { label: string; href?: string }[]; actions?: ReactNode }) {
  const { openMenu } = useShell();
  return (
    <header className="topbar">
      <button className="btn ghost sm icon menubtn" onClick={openMenu} aria-label="Menú"><IMenu /></button>
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <span key={i} className="row gap6" style={{ minWidth: 0 }}>
            {i > 0 && <span className="faint">/</span>}
            {c.href ? <Link href={c.href}>{c.label}</Link> : <span className="here ellipsis">{c.label}</span>}
          </span>
        ))}
      </div>
      <div className="spacer" />
      {actions}
    </header>
  );
}
