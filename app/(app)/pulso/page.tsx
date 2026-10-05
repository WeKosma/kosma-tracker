import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/session";
import { computePulse, headline } from "@/lib/pulse";
import PulseView from "@/components/PulseView";

export const metadata = { title: "Pulso" };

export default async function PulsoPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const pulse = await computePulse(supabase);
  return <PulseView pulse={pulse} headline={headline(pulse)} isAdmin={session.role === "admin"} />;
}
