export const LIBRARY_CATEGORIES = [
  "transmision",
  "frenos",
  "suspension",
  "ruedas",
  "direccion",
  "pedalier",
  "electronica",
  "herramientas",
] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];
export const LIBRARY_CATEGORY_LABELS: Record<LibraryCategory, string> = {
  transmision: "Transmisión",
  frenos: "Frenos",
  suspension: "Suspensión",
  ruedas: "Ruedas",
  direccion: "Dirección",
  pedalier: "Pedalier",
  electronica: "Electrónica",
  herramientas: "Herramientas",
};

export const VALIDATION_STATUSES = [
  "verificado",
  "condicionado",
  "desactualizado",
  "en_revision",
  "sin_dato_verificado",
] as const;
export const VALIDATION_LABELS: Record<(typeof VALIDATION_STATUSES)[number], string> = {
  verificado: "Verificado",
  condicionado: "Condicionado",
  desactualizado: "Desactualizado",
  en_revision: "En revisión",
  sin_dato_verificado: "Sin dato verificado",
};

export const COMPATIBILITY_RELATIONS = [
  "oficial_confirmada",
  "condicionada",
  "incompatible",
  "no_verificada",
] as const;
export const COMPATIBILITY_LABELS: Record<(typeof COMPATIBILITY_RELATIONS)[number], string> = {
  oficial_confirmada: "Oficial confirmada",
  condicionada: "Condicionada",
  incompatible: "Incompatible",
  no_verificada: "No verificada",
};

export const COMPATIBILITY_ROLES = [
  "shifter",
  "cambio",
  "cassette",
  "cadena",
  "plato",
  "nucleo",
  "freno",
  "disco",
  "otro",
] as const;
export const COMPATIBILITY_ROLE_LABELS: Record<(typeof COMPATIBILITY_ROLES)[number], string> = {
  shifter: "Mando de cambios",
  cambio: "Cambio",
  cassette: "Cassette",
  cadena: "Cadena",
  plato: "Plato",
  nucleo: "Núcleo",
  freno: "Freno",
  disco: "Disco",
  otro: "Otro",
};

export const SPEC_KINDS = [
  "torque",
  "medida",
  "aceite",
  "volumen",
  "presion",
  "peso",
  "otro",
] as const;
export const SPEC_KIND_LABELS: Record<(typeof SPEC_KINDS)[number], string> = {
  torque: "Torque",
  medida: "Medida",
  aceite: "Aceite",
  volumen: "Volumen",
  presion: "Presión",
  peso: "Peso",
  otro: "Otro",
};

export const PROPOSAL_STATUSES = [
  "draft",
  "submitted",
  "needs_changes",
  "in_review",
  "approved",
  "rejected",
  "published",
  "withdrawn",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const PROPOSAL_LABELS: Record<ProposalStatus, string> = {
  draft: "Borrador",
  submitted: "Enviada",
  needs_changes: "Requiere cambios",
  in_review: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
  published: "Publicada",
  withdrawn: "Retirada",
};
export const PROPOSAL_TRANSITIONS = {
  draft: ["submitted", "withdrawn"],
  submitted: ["in_review", "needs_changes", "rejected", "withdrawn"],
  needs_changes: ["draft", "withdrawn"],
  in_review: ["needs_changes", "approved", "rejected"],
  approved: ["published", "rejected"],
  rejected: [],
  published: [],
  withdrawn: [],
} as const satisfies Record<ProposalStatus, readonly ProposalStatus[]>;

export function isProposalTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return (PROPOSAL_TRANSITIONS[from] as readonly ProposalStatus[]).includes(to);
}

export const PROPOSAL_KINDS = [
  "articulo",
  "procedimiento",
  "diagnostico",
  "compatibilidad",
  "especificacion",
  "correccion",
] as const;
export const PROPOSAL_KIND_LABELS: Record<(typeof PROPOSAL_KINDS)[number], string> = {
  articulo: "Artículo",
  procedimiento: "Procedimiento",
  diagnostico: "Diagnóstico",
  compatibilidad: "Compatibilidad",
  especificacion: "Especificación",
  correccion: "Corrección",
};

export const CONFIDENCE_LEVELS = ["alta", "media", "baja", "no_verificada"] as const;
export const CONFIDENCE_LABELS: Record<(typeof CONFIDENCE_LEVELS)[number], string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
  no_verificada: "No verificada",
};

export const ARTICLE_KINDS = [
  "articulo",
  "procedimiento",
  "diagnostico",
  "compatibilidad",
] as const;
export const ARTICLE_KIND_LABELS: Record<(typeof ARTICLE_KINDS)[number], string> = {
  articulo: "Artículo",
  procedimiento: "Procedimiento",
  diagnostico: "Diagnóstico",
  compatibilidad: "Compatibilidad",
};

export const PROCEDURE_KINDS = [
  "montaje",
  "ajuste",
  "mantenimiento",
  "diagnostico",
  "reparacion",
] as const;
export const PROCEDURE_KIND_LABELS: Record<(typeof PROCEDURE_KINDS)[number], string> = {
  montaje: "Montaje",
  ajuste: "Ajuste",
  mantenimiento: "Mantenimiento",
  diagnostico: "Diagnóstico",
  reparacion: "Reparación",
};

export const PROCEDURE_RISKS = ["bajo", "medio", "alto", "critico"] as const;
export const PROCEDURE_RISK_LABELS: Record<(typeof PROCEDURE_RISKS)[number], string> = {
  bajo: "Bajo",
  medio: "Medio",
  alto: "Alto",
  critico: "Crítico",
};

export const AI_DAILY_QUOTA_PER_BRANCH = 200;
export const AI_PER_USER_PER_MINUTE = 5;
export const PROMPT_VERSION = "bt-1";
export const CHUNK_MAX_CHARS = 1200;
