import { emailPattern, phonePattern, rutPattern } from "../taller/audit.ts";

export type PiiKind = "telefono" | "rut" | "correo" | "patente";
export type PiiFinding = { kind: PiiKind; match: string };

/** Patente chilena: formato nuevo (cuatro consonantes + dos dígitos) y antiguo (dos letras + cuatro dígitos). */
const newPlatePattern = /(?<![\w-])[B-DF-HJ-LP-TV-Z]{4}[ -]?\d{2}(?![\w-])/i;
const oldPlatePattern = /(?<![\w-])[A-Z]{2}[ -]?\d{4}(?![\w-])/i;

const DETECTORS: readonly { kind: PiiKind; pattern: RegExp }[] = [
  { kind: "correo", pattern: emailPattern },
  { kind: "rut", pattern: rutPattern },
  { kind: "telefono", pattern: phonePattern },
  { kind: "patente", pattern: newPlatePattern },
  { kind: "patente", pattern: oldPlatePattern },
];

/** Datos personales que una propuesta no debe llevar a la biblioteca global. */
export function detectPii(text: string): PiiFinding[] {
  const findings: PiiFinding[] = [];
  for (const { kind, pattern } of DETECTORS) {
    const global = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
    for (const match of text.matchAll(global)) {
      const value = match[0];
      if (!findings.some((finding) => finding.kind === kind && finding.match === value))
        findings.push({ kind, match: value });
    }
  }
  return findings;
}
