import "server-only";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { canSendWithGmailApi, gmailSend } from "@/lib/google";

export function appUrl(fallbackOrigin?: string) {
  const base = (process.env.APP_URL || fallbackOrigin || "").replace(/\/$/, "");
  return base + (process.env.NEXT_PUBLIC_BASE_PATH || "");
}

function transport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

/** Cabecera de los correos con el logo oficial (PNG servido por el tracker). */
export function brandHeader(label: string) {
  const base = appUrl();
  const logo = base.startsWith("http")
    ? `<img src="${base}/brand/kosma-logo-white.png" width="120" height="31" alt="KOSMA" style="display:inline-block;vertical-align:middle;border:0;width:120px;height:auto">`
    : `<span style="font:300 18px/1 Helvetica,Arial,sans-serif;letter-spacing:.32em;color:#f3f3ef">KOSMA</span>`;
  return `${logo}<span style="display:inline-block;vertical-align:middle;margin-left:14px;font:500 10px/1 Menlo,monospace;letter-spacing:.16em;color:#9b9b96">${label}</span>`;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function layout(opts: { kicker: string; title: string; rows: [string, string][]; body?: string; cta?: { label: string; href: string } }) {
  const rows = opts.rows
    .filter(([, v]) => v && v !== "—")
    .map(
      ([k, v]) => `<tr>
        <td style="padding:10px 0;border-top:1px solid #e3e3de;font:500 11px/1.4 Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:#7a7a75;width:38%;vertical-align:top">${esc(k)}</td>
        <td style="padding:10px 0;border-top:1px solid #e3e3de;font:400 14px/1.5 Helvetica,Arial,sans-serif;color:#0b0b0b">${esc(v)}</td>
      </tr>`
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#eeeeea;padding:32px 12px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
  <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #dcdcd6">
    <tr><td style="padding:22px 28px;background:#050505">${brandHeader("TRACKER")}</td></tr>
    <tr><td style="padding:30px 28px 8px">
      <div style="font:500 11px/1 Menlo,Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:#7a7a75">${esc(opts.kicker)}</div>
      <div style="margin-top:12px;font:300 26px/1.15 Helvetica,Arial,sans-serif;color:#050505">${esc(opts.title)}</div>
      ${opts.body ? `<p style="margin:16px 0 0;font:400 14px/1.6 Helvetica,Arial,sans-serif;color:#3a3a37;white-space:pre-line">${esc(opts.body)}</p>` : ""}
    </td></tr>
    <tr><td style="padding:12px 28px 4px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></td></tr>
    ${opts.cta ? `<tr><td style="padding:22px 28px 30px"><a href="${esc(opts.cta.href)}" style="display:inline-block;padding:13px 18px;background:#050505;color:#f3f3ef;text-decoration:none;font:600 11px/1 Menlo,Consolas,monospace;letter-spacing:.1em;text-transform:uppercase">${esc(opts.cta.label)} &nbsp;↗</a></td></tr>` : ""}
    <tr><td style="padding:16px 28px;border-top:1px solid #e3e3de;font:400 11px/1.5 Helvetica,Arial,sans-serif;color:#9b9b96">Notificación automática del tracker interno de KOSMA. Complejidad, en orden.</td></tr>
  </table></td></tr></table></body></html>`;
}

export async function sendMail(to: string[], subject: string, html: string, text: string) {
  if (!to.length) return { sent: false };
  const from = `"KOSMA Tracker" <${process.env.GMAIL_USER || "hello@wearekosma.com"}>`;
  try {
    // 1) Contraseña de aplicación de Gmail (SMTP), si está configurada
    const t = transport();
    if (t) {
      await t.sendMail({ from, to: to.join(", "), subject, html, text });
      return { sent: true };
    }
    // 2) Si no, la cuenta de Google conectada en el tracker (Gmail API)
    if (await canSendWithGmailApi()) {
      const mime = await new MailComposer({ from, to: to.join(", "), subject, html, text }).compile().build();
      await gmailSend(mime);
      return { sent: true };
    }
    console.warn("[mail] Sin Gmail configurado (ni contraseña de aplicación ni Google conectado). Correo omitido:", subject);
    return { sent: false };
  } catch (err) {
    console.error("[mail] Error enviando correo:", err);
    return { sent: false };
  }
}

type LeadLite = {
  id: string;
  company: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  source?: string | null;
  service?: string | null;
  value?: number | null;
  currency?: string | null;
  summary?: string | null;
};

function money(v?: number | null, c?: string | null) {
  if (v == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: c || "COP", maximumFractionDigits: 0 }).format(v);
}

export async function notifyNewLead(to: string[], lead: LeadLite, by: string, origin?: string) {
  const href = `${appUrl(origin)}/leads/${lead.id}`;
  const html = layout({
    kicker: "Nuevo lead",
    title: lead.company,
    body: lead.summary ?? undefined,
    rows: [
      ["Contacto", lead.contact_name ?? "—"],
      ["Correo", lead.contact_email ?? "—"],
      ["Teléfono", lead.contact_phone ?? "—"],
      ["Servicio", lead.service ?? "—"],
      ["Valor estimado", money(lead.value, lead.currency)],
      ["Origen", lead.source ?? "—"],
      ["Registrado por", by],
    ],
    cta: { label: "Abrir en el tracker", href },
  });
  return sendMail(to, `Nuevo lead · ${lead.company}`, html, `Nuevo lead: ${lead.company}\nRegistrado por ${by}\n${href}`);
}

export async function notifyConfirmed(
  to: string[],
  lead: LeadLite,
  by: string,
  stats: { meetings: number; proposals: number },
  origin?: string
) {
  const href = `${appUrl(origin)}/leads/${lead.id}`;
  const html = layout({
    kicker: "Lead confirmado",
    title: `${lead.company} está confirmado`,
    rows: [
      ["Valor", money(lead.value, lead.currency)],
      ["Contacto", lead.contact_name ?? "—"],
      ["Servicio", lead.service ?? "—"],
      ["Reuniones", String(stats.meetings)],
      ["Propuestas", String(stats.proposals)],
      ["Confirmado por", by],
    ],
    cta: { label: "Ver la ficha", href },
  });
  return sendMail(to, `Confirmado · ${lead.company}`, html, `${lead.company} quedó confirmado por ${by}\n${href}`);
}
