export const STAGES = [
  { id: "nuevo", label: "Nuevo", color: "#9b9b96" },
  { id: "contactado", label: "Contactado", color: "#c4c4bd" },
  { id: "discovery", label: "Discovery", color: "#8ea7c4" },
  { id: "propuesta", label: "Propuesta enviada", color: "#c9b88f" },
  { id: "negociacion", label: "Negociación", color: "#c99b85" },
  { id: "confirmado", label: "Confirmado", color: "#8fc49f" },
  { id: "perdido", label: "Perdido", color: "#5f5f5b" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];
export const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];
export const OPEN_STAGES: StageId[] = ["nuevo", "contactado", "discovery", "propuesta", "negociacion"];
/** Probabilidad de cierre por etapa (para el pipeline ponderado / forecast). */
export const STAGE_PROB: Record<string, number> = {
  nuevo: 0.05, contactado: 0.1, discovery: 0.2, propuesta: 0.4, negociacion: 0.65, confirmado: 1, perdido: 0,
};
export const stageOf = (id: string) => STAGES.find((s) => s.id === id) ?? STAGES[0];

export const SOURCES = [
  { id: "web", label: "Web / agente KOSMA" },
  { id: "referido", label: "Referido" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "prospeccion", label: "Prospección (Apollo, Lusha…)" },
  { id: "evento", label: "Evento / charla" },
  { id: "red", label: "Red personal" },
  { id: "otro", label: "Otro" },
] as const;
export const sourceLabel = (id?: string | null) => SOURCES.find((s) => s.id === id)?.label ?? id ?? "—";

export const PRIORITIES = [
  { id: "alta", label: "Alta" },
  { id: "media", label: "Media" },
  { id: "baja", label: "Baja" },
] as const;

export const CURRENCIES = ["COP", "USD", "EUR", "AUD"] as const;

export const SERVICES = [
  "Operación + automatización",
  "Sistemas conectados",
  "IA aplicada",
  "White-label",
  "Capacitación",
  "Otro",
];

export const MEETING_KINDS = [
  { id: "discovery", label: "Discovery" },
  { id: "seguimiento", label: "Seguimiento" },
  { id: "presentacion", label: "Presentación" },
  { id: "negociacion", label: "Negociación" },
  { id: "cierre", label: "Cierre" },
  { id: "kickoff", label: "Kickoff" },
  { id: "otro", label: "Otro" },
] as const;
export const MEETING_MODES = [
  { id: "virtual", label: "Virtual" },
  { id: "presencial", label: "Presencial" },
  { id: "llamada", label: "Llamada" },
] as const;

export const PROPOSAL_KINDS = [
  { id: "propuesta", label: "Propuesta" },
  { id: "presentacion", label: "Presentación" },
  { id: "cotizacion", label: "Cotización" },
  { id: "contrato", label: "Contrato" },
  { id: "otro", label: "Otro" },
] as const;
export const PROPOSAL_STATUS = [
  { id: "borrador", label: "Borrador" },
  { id: "enviada", label: "Enviada" },
  { id: "en_revision", label: "En revisión" },
  { id: "aprobada", label: "Aprobada" },
  { id: "rechazada", label: "Rechazada" },
] as const;

export const labelOf = (list: readonly { id: string; label: string }[], id?: string | null) =>
  list.find((x) => x.id === id)?.label ?? id ?? "—";

export const ROLES = [
  { id: "admin", label: "Admin", hint: "Todo, incluido equipo y borrar leads" },
  { id: "editor", label: "Editor", hint: "Crea y edita leads, reuniones y propuestas" },
  { id: "viewer", label: "Lector", hint: "Solo ve" },
] as const;

/** Días sin actividad para considerar que un lead se está enfriando */
export const COLD_DAYS = 14;
