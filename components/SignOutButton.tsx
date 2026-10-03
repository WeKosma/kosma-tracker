"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ILogout } from "./icons";

export default function SignOutButton({ className, compact }: { className?: string; compact?: boolean }) {
  const router = useRouter();
  return (
    <button
      className={className ?? "btn ghost sm"}
      onClick={async () => {
        await createClient().auth.signOut();
        router.replace("/login");
        router.refresh();
      }}
      title="Salir"
    >
      <ILogout /> {!compact && "Salir"}
    </button>
  );
}
