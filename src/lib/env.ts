import { z } from "zod";

type EnvSource = Record<string, string | undefined>;

export class EnvError extends Error {
  readonly variables: string[];

  constructor(variables: string[]) {
    super(`Variable de entorno faltante o inválida: ${variables.join(", ")}`);
    this.name = "EnvError";
    this.variables = variables;
  }
}

function parseSource<T extends z.ZodType>(schema: T, source: EnvSource): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues.map((issue) => String(issue.path[0] ?? "desconocida"));
    throw new EnvError([...new Set(names)]);
  }
  return result.data;
}

const required = z.string().trim().min(1);
const secret = z.string().min(32);

const dbSchema = z.object({ DATABASE_URL: required });
const cancelSchema = z.object({ CANCEL_TOKEN_SECRET: secret });
const turnstileSchema = z.object({ TURNSTILE_SECRET_KEY: required });
const hashSchema = z.object({ SESSION_SECRET: secret });
const tasksSchema = z.object({ TASKS_SECRET: secret });
const cronSchema = z.object({ CRON_SECRET: z.string().optional() });
const siteSchema = z.object({ PUBLIC_SITE_URL: z.url() });
const absentIfEmpty = (value: unknown) => (value === "" ? undefined : value);
const trackingSchema = z.object({
  TRACKING_TOKEN_SECRET: z.preprocess(absentIfEmpty, secret.optional()),
});
const appSchema = z.object({ APP_URL: z.preprocess(absentIfEmpty, z.url().optional()) });
const storageSchema = z
  .object({
    STORAGE_DRIVER: z.preprocess(absentIfEmpty, z.enum(["local", "replit"]).default("local")),
    STORAGE_LOCAL_DIR: z.preprocess(absentIfEmpty, z.string().default(".storage")),
    STORAGE_BUCKET_ID: z.preprocess(absentIfEmpty, z.string().optional()),
    REPLIT_DEPLOYMENT: z.preprocess(absentIfEmpty, z.string().optional()),
  })
  .superRefine((value, ctx) => {
    if (value.REPLIT_DEPLOYMENT !== undefined && value.STORAGE_DRIVER !== "replit") {
      ctx.addIssue({
        code: "custom",
        path: ["STORAGE_DRIVER"],
        message: "debe ser replit en un despliegue de Replit",
      });
    }
  });
type StorageEnv = Omit<z.infer<typeof storageSchema>, "REPLIT_DEPLOYMENT">;
const emailSchema = z
  .object({
    EMAIL_TRANSPORT: z.enum(["resend", "console"]),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: required,
    EMAIL_REPLY_TO: z.email(),
    SHOP_NOTIFY_EMAIL: z.email(),
  })
  .superRefine((value, ctx) => {
    if (value.EMAIL_TRANSPORT === "resend" && !value.RESEND_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "requerida cuando EMAIL_TRANSPORT=resend",
      });
    }
  });
const adminSetupSchema = z.object({
  ADMIN_EMAIL: z.email(),
  ADMIN_PASSWORD: z.string().min(12),
});

const whatsappSchema = z
  .object({
    WHATSAPP_ENABLED: z.enum(["true", "false"]).default("false"),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().regex(/^\d+$/).optional(),
    WHATSAPP_GRAPH_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/)
      .default("v23.0"),
    WHATSAPP_REMINDER_TEMPLATE: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .optional(),
    WHATSAPP_READY_TEMPLATE: z
      .string()
      .regex(/^[a-z0-9_]+$/)
      .optional(),
    WHATSAPP_TEMPLATE_LANGUAGE: z
      .string()
      .regex(/^[a-z]{2}(?:_[A-Z]{2})?$/)
      .default("es_CL"),
  })
  .superRefine((value, ctx) => {
    if (value.WHATSAPP_ENABLED !== "true") return;
    for (const key of [
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_REMINDER_TEMPLATE",
      "WHATSAPP_READY_TEMPLATE",
    ] as const) {
      if (!value[key])
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "requerida cuando WhatsApp está habilitado",
        });
    }
  });

const aiSchema = z
  .object({
    AI_PROVIDER: z.preprocess(absentIfEmpty, z.enum(["none", "anthropic"]).default("none")),
    ANTHROPIC_API_KEY: z.preprocess(absentIfEmpty, z.string().min(20).optional()),
    AI_MODEL: z.preprocess(
      absentIfEmpty,
      z
        .string()
        .regex(/^[a-z0-9.-]+$/)
        .default("claude-opus-5-5"),
    ),
  })
  .superRefine((value, ctx) => {
    if (value.AI_PROVIDER === "anthropic" && !value.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["ANTHROPIC_API_KEY"],
        message: "requerida cuando AI_PROVIDER=anthropic",
      });
    }
  });

export type EmailEnv = z.infer<typeof emailSchema>;
export type AiEnv = z.infer<typeof aiSchema>;

/** Paso 2 en adelante. */
export function getDbEnv(source: EnvSource = process.env) {
  return parseSource(dbSchema, source);
}

/** Paso 4 en adelante. */
export function getCancelEnv(source: EnvSource = process.env) {
  return parseSource(cancelSchema, source);
}

/** Paso 5 en adelante. */
export function getTurnstileEnv(source: EnvSource = process.env) {
  return parseSource(turnstileSchema, source);
}

/** Paso 5 en adelante. */
export function getHashEnv(source: EnvSource = process.env) {
  return parseSource(hashSchema, source);
}

/** Paso 8 en adelante. */
export function getSiteEnv(source: EnvSource = process.env) {
  return parseSource(siteSchema, source);
}

/** Dominio del sistema; sin APP_URL conserva el dominio heredado. */
export function getAppEnv(source: EnvSource = process.env): { APP_URL: string } {
  const { APP_URL } = parseSource(appSchema, source);
  return { APP_URL: APP_URL ?? getSiteEnv(source).PUBLIC_SITE_URL };
}

/** Secreto del seguimiento (BG-35); sin él, el de cancelación, que firma los enlaces heredados. */
export function getTrackingEnv(source: EnvSource = process.env): {
  TRACKING_TOKEN_SECRET: string;
  LEGACY_SECRET: string;
} {
  const { TRACKING_TOKEN_SECRET } = parseSource(trackingSchema, source);
  const { CANCEL_TOKEN_SECRET } = getCancelEnv(source);
  return {
    TRACKING_TOKEN_SECRET: TRACKING_TOKEN_SECRET ?? CANCEL_TOKEN_SECRET,
    LEGACY_SECRET: CANCEL_TOKEN_SECRET,
  };
}

/**
 * Dominio de los `UID` de calendario: queda en el sitio heredado aunque exista `APP_URL`, para que
 * reprogramar una reserva ya enviada actualice el mismo evento y no cree uno nuevo (BG-34).
 */
export function getCalendarEnv(source: EnvSource = process.env): { CALENDAR_URL: string } {
  return { CALENDAR_URL: getSiteEnv(source).PUBLIC_SITE_URL };
}

/** Paso 8 en adelante. */
export function getEmailEnv(source: EnvSource = process.env): EmailEnv {
  return parseSource(emailSchema, source);
}

/** Solo scripts/admin-set-password.ts (paso 10). */
export function getAdminSetupEnv(source: EnvSource = process.env) {
  return parseSource(adminSetupSchema, source);
}

export function getWhatsAppEnv(source: EnvSource = process.env) {
  if (source.WHATSAPP_ENABLED !== "true") {
    return parseSource(whatsappSchema, { WHATSAPP_ENABLED: source.WHATSAPP_ENABLED });
  }
  return parseSource(whatsappSchema, source);
}

export function getTasksEnv(source: EnvSource = process.env) {
  return parseSource(tasksSchema, source);
}

export function getCronEnv(source: EnvSource = process.env) {
  return parseSource(cronSchema, source);
}

export function getStorageEnv(source: EnvSource = process.env): StorageEnv {
  const parsed = parseSource(storageSchema, source);
  return {
    STORAGE_DRIVER: parsed.STORAGE_DRIVER,
    STORAGE_LOCAL_DIR: parsed.STORAGE_LOCAL_DIR,
    STORAGE_BUCKET_ID: parsed.STORAGE_BUCKET_ID,
  };
}

/** Asistente de la biblioteca: `none` (solo fuentes) por defecto; `anthropic` exige la clave. */
export function getAiEnv(source: EnvSource = process.env): AiEnv {
  return parseSource(aiSchema, {
    AI_PROVIDER: source.AI_PROVIDER,
    ANTHROPIC_API_KEY: source.ANTHROPIC_API_KEY,
    AI_MODEL: source.AI_MODEL,
  });
}

/** Dominios para decidir la portada de `/` (convivencia hasta BG-DC1); vacíos si faltan. */
export function getHostEnv(source: EnvSource = process.env): {
  APP_URL: string | undefined;
  PUBLIC_SITE_URL: string;
} {
  const app = appSchema.safeParse(source);
  const site = siteSchema.safeParse(source);
  return {
    APP_URL: app.success ? app.data.APP_URL : undefined,
    PUBLIC_SITE_URL: site.success ? site.data.PUBLIC_SITE_URL : "",
  };
}
