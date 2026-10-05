import type { NextRequest } from "next/server";

/** Las tareas programadas de Netlify llaman con Authorization: Bearer <CRON_SECRET>. */
export function cronAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}
