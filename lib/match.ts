export type LeadEmails = { id: string; company: string; emails: string[] };

const GENERIC = new Set([
  "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com", "live.com", "me.com", "proton.me",
  "wearekosma.com", "meroestudio.tv",
]);

/** Sugiere a qué lead pertenece un evento según los correos de los invitados. */
export function suggestLead(attendees: string[], leads: LeadEmails[]): LeadEmails | null {
  const att = attendees.map((a) => a.toLowerCase());
  for (const l of leads) if (l.emails.some((e) => att.includes(e))) return l;
  const domains = new Set(att.map((a) => a.split("@")[1]).filter((d) => d && !GENERIC.has(d)));
  if (!domains.size) return null;
  for (const l of leads) if (l.emails.some((e) => domains.has(e.split("@")[1]))) return l;
  return null;
}
