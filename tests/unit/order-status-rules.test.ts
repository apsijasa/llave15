import { expect, it } from "vitest";
import * as rules from "../../src/server/taller/rules.ts";

const statuses = [
  "creado",
  "diagnostico",
  "esperando_aprobacion",
  "en_progreso",
  "esperando_repuesto",
  "en_pausa",
  "lista_para_retirar",
  "pagado",
  "entregada",
  "cancelada",
] as const;
const labels = [
  "Creado",
  "Diagnóstico",
  "Esperando aprobación",
  "En progreso",
  "Esperando repuestos",
  "En pausa",
  "Lista para retirar",
  "Pagado",
  "Retirada",
  "Cancelada",
];

it("define los estados, etiquetas y grupos exactos de FX-04", () => {
  expect(rules.ORDER_STATUSES).toEqual(statuses);
  expect(rules.STATUS_LABELS).toEqual(
    Object.fromEntries(statuses.map((status, i) => [status, labels[i]])),
  );
  expect(rules.TERMINAL_STATUSES).toEqual(["entregada", "cancelada"]);
  expect(rules.MECHANIC_UNASSIGNED_ACCESS_STATUSES).toEqual(["creado", "diagnostico"]);
  expect(rules.LOAD_EXCLUDED_STATUSES).toEqual([
    "lista_para_retirar",
    "pagado",
    "entregada",
    "cancelada",
  ]);
});
it("todo salto manual pertenece a las transiciones permitidas", () => {
  for (const from of rules.ORDER_STATUSES) {
    for (const to of rules.MANUAL_TRANSITIONS[from])
      expect(rules.isAllowedTransition(from, to)).toBe(true);
  }
});
it.each([
  ["reservada", "creado"],
  ["recibida", "creado"],
  ["en_reparacion", "en_progreso"],
  ["control_calidad", "en_progreso"],
  ["trabajo_rechazado", "cancelada"],
])("normaliza %s a %s", (raw, target) => {
  expect(rules.normalizeOrderStatus(raw)).toBe(target);
});
it("preserva estados actuales y rechaza desconocidos", () => {
  for (const status of statuses) expect(rules.normalizeOrderStatus(status)).toBe(status);
  expect(() => rules.normalizeOrderStatus("desconocido")).toThrow();
});
it("conserva etiquetas históricas y amplía filtros sin duplicados", () => {
  expect(rules.statusLabel("en_reparacion")).toBe("En reparación");
  expect(rules.statusLabel("entregada")).toBe("Retirada");
  expect(rules.statusLabel("desconocido")).toBe("desconocido");
  expect(rules.withLegacyStatuses(["creado"])).toEqual(["creado", "reservada", "recibida"]);
  expect(rules.withLegacyStatuses(["creado", "creado"])).toEqual([
    "creado",
    "reservada",
    "recibida",
  ]);
});
