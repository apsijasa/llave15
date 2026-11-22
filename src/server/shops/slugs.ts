import { z } from "zod";

export const RESERVED_SLUGS = [
  "taller",
  "admin",
  "api",
  "seguimiento",
  "informe",
  "aprobacion",
  "reservas",
  "privacidad",
  "plataforma",
  "brand",
  "_astro",
  "_image",
  "_server-islands",
  "favicon",
  "robots",
  "sitemap-index",
  "sitemap-0",
  "404",
  "500",
  "index",
  "www",
  "app",
  "send",
  "mail",
  "logo",
  "ingresar",
  "demo",
  "aviso-de-privacidad",
] as const;

const reservedSlugs: ReadonlySet<string> = new Set(RESERVED_SLUGS);

export const slugSchema = z
  .string()
  .refine((slug) => !reservedSlugs.has(slug), "Ese nombre está reservado.")
  .min(3, "El nombre debe tener al menos 3 caracteres.")
  .max(40, "El nombre debe tener como máximo 40 caracteres.")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Usa solo letras minúsculas sin tildes, números y guiones entre palabras.",
  );
