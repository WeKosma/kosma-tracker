import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { googleStatus } from "@/lib/google";
import { discordConfig } from "@/lib/discord";
import { appUrl } from "@/lib/mail";
import { igStatus } from "@/lib/instagram";
import { maskKey, waContacts } from "@/lib/whatsapp";
import IntegrationsView from "@/components/IntegrationsView";

export const metadata = { title: "Integraciones" };

export default async function IntegracionesPage() {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/");
  const g = await googleStatus().catch(() => ({ configured: false, connected: false, email: null }));
  const d = discordConfig();
  const [ig, wa] = await Promise.all([igStatus(), waContacts().catch(() => ({ contacts: [], saved: false }))]);
  return (
    <IntegrationsView
      base={appUrl()}
      google={{ configured: g.configured, connected: g.connected, email: g.email ?? null, drive: Boolean((g as { drive?: boolean }).drive) }}
      discord={{ webhook: d.webhook, appId: Boolean(d.appId), publicKey: d.publicKey, bot: d.bot, guild: Boolean(d.guild), listen: d.listen.length }}
      cron={Boolean(process.env.CRON_SECRET)}
      instagram={ig}
      whatsapp={{ saved: wa.saved, contacts: wa.contacts.map((c) => ({ ...c, apikey: maskKey(c.apikey) })) }}
    />
  );
}
