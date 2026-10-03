// Valores públicos (seguros de exponer). Se pueden sobreescribir con variables de entorno.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ekricybrubtjpdjkgjct.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_inaxcl8EICZ8P31sItZrFQ_mNKm09s_";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
