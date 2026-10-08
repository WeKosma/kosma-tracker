"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { connectInstagram, disconnectInstagram } from "@/lib/instagram";
import { resolveKeys, saveWaContacts, sendWhatsApp } from "@/lib/whatsapp";
import type { WaContact } from "@/lib/content";
import type { ActionResult } from "@/lib/types";

async function admin() {
  const s = await getSession();
  if (!s) throw new Error("Tu sesión expiró. Vuelve a entrar.");
  if (s.role !== "admin") throw new Error("Solo un admin puede cambiar las integraciones.");
  return s;
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/integraciones");
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveInstagramToken(token: string): Promise<ActionResult<{ username: string | null }>> {
  return run(async () => {
    const s = await admin();
    return connectInstagram(token, s.userId);
  });
}

export async function disconnectInstagramAction(): Promise<ActionResult> {
  return run(async () => {
    await admin();
    await disconnectInstagram();
    return undefined;
  });
}

export async function saveWhatsAppContacts(contacts: WaContact[]): Promise<ActionResult<{ count: number }>> {
  return run(async () => {
    const s = await admin();
    const saved = await saveWaContacts(contacts, s.userId);
    return { count: saved.length };
  });
}

export async function testWhatsApp(contact: Pick<WaContact, "name" | "phone" | "apikey">): Promise<ActionResult> {
  return run(async () => {
    await admin();
    const [c] = await resolveKeys([contact]);
    const r = await sendWhatsApp(c, `*KOSMA Tracker*\nHola ${contact.name.split(" ")[0]}, así te llegarán los avisos de la parrilla de contenido.`);
    if (!r.ok) throw new Error(r.error ?? "No se pudo enviar");
    return undefined;
  });
}
