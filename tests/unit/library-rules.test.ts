import { describe, expect, it } from "vitest";
import {
  AI_DAILY_QUOTA_PER_BRANCH,
  AI_PER_USER_PER_MINUTE,
  ARTICLE_KINDS,
  ARTICLE_KIND_LABELS,
  CHUNK_MAX_CHARS,
  COMPATIBILITY_LABELS,
  COMPATIBILITY_RELATIONS,
  COMPATIBILITY_ROLES,
  COMPATIBILITY_ROLE_LABELS,
  CONFIDENCE_LABELS,
  CONFIDENCE_LEVELS,
  isProposalTransition,
  LIBRARY_CATEGORIES,
  LIBRARY_CATEGORY_LABELS,
  PROCEDURE_KINDS,
  PROCEDURE_KIND_LABELS,
  PROCEDURE_RISKS,
  PROCEDURE_RISK_LABELS,
  PROMPT_VERSION,
  PROPOSAL_KINDS,
  PROPOSAL_KIND_LABELS,
  PROPOSAL_LABELS,
  PROPOSAL_STATUSES,
  PROPOSAL_TRANSITIONS,
  SPEC_KINDS,
  SPEC_KIND_LABELS,
  VALIDATION_LABELS,
  VALIDATION_STATUSES,
} from "../../src/server/library/rules.ts";
import type { LibraryCategory, ProposalStatus } from "../../src/server/library/rules.ts";

const labelCases = [
  {
    name: "categorías",
    values: LIBRARY_CATEGORIES,
    labels: LIBRARY_CATEGORY_LABELS,
    expected: {
      transmision: "Transmisión",
      frenos: "Frenos",
      suspension: "Suspensión",
      ruedas: "Ruedas",
      direccion: "Dirección",
      pedalier: "Pedalier",
      electronica: "Electrónica",
      herramientas: "Herramientas",
    } satisfies Record<LibraryCategory, string>,
  },
  {
    name: "validación",
    values: VALIDATION_STATUSES,
    labels: VALIDATION_LABELS,
    expected: {
      verificado: "Verificado",
      condicionado: "Condicionado",
      desactualizado: "Desactualizado",
      en_revision: "En revisión",
      sin_dato_verificado: "Sin dato verificado",
    },
  },
  {
    name: "relaciones de compatibilidad",
    values: COMPATIBILITY_RELATIONS,
    labels: COMPATIBILITY_LABELS,
    expected: {
      oficial_confirmada: "Oficial confirmada",
      condicionada: "Condicionada",
      incompatible: "Incompatible",
      no_verificada: "No verificada",
    },
  },
  {
    name: "roles de compatibilidad",
    values: COMPATIBILITY_ROLES,
    labels: COMPATIBILITY_ROLE_LABELS,
    expected: {
      shifter: "Mando de cambios",
      cambio: "Cambio",
      cassette: "Cassette",
      cadena: "Cadena",
      plato: "Plato",
      nucleo: "Núcleo",
      freno: "Freno",
      disco: "Disco",
      otro: "Otro",
    },
  },
  {
    name: "especificaciones",
    values: SPEC_KINDS,
    labels: SPEC_KIND_LABELS,
    expected: {
      torque: "Torque",
      medida: "Medida",
      aceite: "Aceite",
      volumen: "Volumen",
      presion: "Presión",
      peso: "Peso",
      otro: "Otro",
    },
  },
  {
    name: "estados de propuesta",
    values: PROPOSAL_STATUSES,
    labels: PROPOSAL_LABELS,
    expected: {
      draft: "Borrador",
      submitted: "Enviada",
      needs_changes: "Requiere cambios",
      in_review: "En revisión",
      approved: "Aprobada",
      rejected: "Rechazada",
      published: "Publicada",
      withdrawn: "Retirada",
    },
  },
  {
    name: "tipos de propuesta",
    values: PROPOSAL_KINDS,
    labels: PROPOSAL_KIND_LABELS,
    expected: {
      articulo: "Artículo",
      procedimiento: "Procedimiento",
      diagnostico: "Diagnóstico",
      compatibilidad: "Compatibilidad",
      especificacion: "Especificación",
      correccion: "Corrección",
    },
  },
  {
    name: "confianza",
    values: CONFIDENCE_LEVELS,
    labels: CONFIDENCE_LABELS,
    expected: { alta: "Alta", media: "Media", baja: "Baja", no_verificada: "No verificada" },
  },
  {
    name: "artículos",
    values: ARTICLE_KINDS,
    labels: ARTICLE_KIND_LABELS,
    expected: {
      articulo: "Artículo",
      procedimiento: "Procedimiento",
      diagnostico: "Diagnóstico",
      compatibilidad: "Compatibilidad",
    },
  },
  {
    name: "procedimientos",
    values: PROCEDURE_KINDS,
    labels: PROCEDURE_KIND_LABELS,
    expected: {
      montaje: "Montaje",
      ajuste: "Ajuste",
      mantenimiento: "Mantenimiento",
      diagnostico: "Diagnóstico",
      reparacion: "Reparación",
    },
  },
  {
    name: "riesgos",
    values: PROCEDURE_RISKS,
    labels: PROCEDURE_RISK_LABELS,
    expected: { bajo: "Bajo", medio: "Medio", alto: "Alto", critico: "Crítico" },
  },
];

describe("constantes y etiquetas de biblioteca", () => {
  it.each(labelCases)(
    "cubre exactamente $name con etiquetas en español",
    ({ values, labels, expected }) => {
      expect(values).toEqual(Object.keys(expected));
      expect(Object.keys(labels)).toEqual(values);
      expect(labels).toEqual(expected);
      expect(new Set(values).size).toBe(values.length);
    },
  );
});

const expectedTransitions = {
  draft: ["submitted", "withdrawn"],
  submitted: ["in_review", "needs_changes", "rejected", "withdrawn"],
  needs_changes: ["draft", "withdrawn"],
  in_review: ["needs_changes", "approved", "rejected"],
  approved: ["published", "rejected"],
  rejected: [],
  published: [],
  withdrawn: [],
} satisfies Record<ProposalStatus, readonly ProposalStatus[]>;

describe("transiciones de propuestas", () => {
  it("expone el grafo completo de los ocho estados", () => {
    expect(PROPOSAL_TRANSITIONS).toEqual(expectedTransitions);
    expect(Object.keys(PROPOSAL_TRANSITIONS)).toEqual(PROPOSAL_STATUSES);
  });

  it.each(PROPOSAL_STATUSES)("permite solo los destinos autorizados desde %s", (from) => {
    const allowed: readonly ProposalStatus[] = expectedTransitions[from];
    for (const to of PROPOSAL_STATUSES) {
      expect(isProposalTransition(from, to), `${from} → ${to}`).toBe(allowed.includes(to));
    }
  });
});

describe("cuotas y versión de IA", () => {
  it.each([
    [AI_DAILY_QUOTA_PER_BRANCH, 200],
    [AI_PER_USER_PER_MINUTE, 5],
    [CHUNK_MAX_CHARS, 1200],
  ])("fija el límite %i en %i como entero positivo", (value, expected) => {
    expect(value).toBe(expected);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  });

  it("identifica la primera versión del prompt", () => {
    expect(PROMPT_VERSION).toBe("bt-1");
  });
});
