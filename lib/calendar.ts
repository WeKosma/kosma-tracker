/** Utilidades de calendario (fechas "YYYY-MM-DD" en hora de Bogotá, semanas de lunes a domingo). */

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function shiftMonth(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

export const isMonth = (v: string | undefined | null): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** Días visibles del mes (semanas completas). `end` es exclusivo. */
export function monthGrid(month: string) {
  const first = `${month}-01`;
  const offset = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  const start = addDays(first, -offset);
  return { start, end: addDays(start, total), days: Array.from({ length: total }, (_, i) => addDays(start, i)) };
}

/** Medianoche de Bogotá (UTC-5, sin horario de verano) en ISO. */
export const bogotaMidnight = (iso: string) => `${iso}T00:00:00-05:00`;

export const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(iso));
