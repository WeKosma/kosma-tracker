const TZ = "America/Bogota";

export function money(value: number | null | undefined, currency = "COP") {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "COP" ? 0 : 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("es-CO")}`;
  }
}

/** 12.500.000 → "12,5 M" */
export function compactMoney(value: number, currency = "COP") {
  const n = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  return currency === "COP" ? `$${n}` : `${currency} ${n}`;
}

export function date(d: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}) {
  if (!d) return "—";
  const dt = typeof d === "string" && d.length === 10 ? new Date(d + "T12:00:00") : new Date(d);
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: TZ, ...opts }).format(dt);
}

export function dateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ,
  }).format(new Date(d));
}

export function time(d: string | Date) {
  return new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(d));
}

export function relative(d: string | Date | null | undefined) {
  if (!d) return "—";
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (abs < 60) return "ahora";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diff / (86400 * 30)), "month");
  return rtf.format(Math.round(diff / (86400 * 365)), "year");
}

export function daysSince(d: string | Date | null | undefined) {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

/** Fecha de hoy en Bogotá como YYYY-MM-DD */
export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

/** "2026-10-02T15:30" (hora Bogotá) → ISO UTC */
export function bogotaLocalToISO(local: string) {
  if (!local) return null;
  return new Date(local + ":00-05:00").toISOString();
}

/** ISO → valor para <input type="datetime-local"> en hora Bogotá */
export function isoToBogotaLocal(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 5 * 3600000);
  return d.toISOString().slice(0, 16);
}

export function initials(name?: string | null) {
  if (!name) return "·";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || name[0].toUpperCase();
}

export function fileSize(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function profileName(p?: { full_name: string | null; email: string } | null) {
  if (!p) return "—";
  return p.full_name || p.email.split("@")[0];
}
