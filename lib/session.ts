import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

export type Session = {
  userId: string;
  email: string;
  role: Role;
  profile: Profile;
  team: Profile[];
};

/** Sesión del usuario + rol + equipo. Cacheado por request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims?.sub) return null;
  const email = String(claims.email ?? "").toLowerCase();

  const [{ data: member }, { data: team }] = await Promise.all([
    supabase.from("members").select("role").eq("email", email).maybeSingle(),
    supabase.from("profiles").select("id,email,full_name").order("full_name"),
  ]);
  if (!member) return null;

  const profile =
    (team ?? []).find((p) => p.id === claims.sub) ?? { id: claims.sub, email, full_name: null };

  return { userId: claims.sub, email, role: member.role as Role, profile, team: team ?? [] };
});

export async function requireSession() {
  const s = await getSession();
  if (!s) redirect("/sin-acceso");
  return s;
}

export const canWrite = (role: Role) => role === "admin" || role === "editor";
