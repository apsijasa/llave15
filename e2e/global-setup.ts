import { randomBytes } from "node:crypto";
import { rmSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { hashPassword } from "../src/server/auth/admin-auth.ts";
import { E2E_DATABASE_URL, E2E_STORAGE_DIR, SEED, USERS } from "./fixtures.ts";

type Sql = ReturnType<typeof postgres>;

const TIMEZONE = "America/Santiago";
const DAY_MS = 24 * 60 * 60 * 1000;
const BIKE_TYPES = ["mtb", "ruta", "gravel", "urbana", "ebike"] as const;

/** Fecha local `YYYY-MM-DD` de hoy más `offsetDays`, en la zona del taller. */
function localDate(offsetDays: number): string {
  const instant = new Date(Date.now() + offsetDays * DAY_MS);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(instant);
}

/** Crea la base E2E si falta. Se niega con cualquier base cuyo nombre no termine en `_e2e`. */
async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  if (!/^[a-z0-9_]+_e2e$/.test(name)) {
    throw new Error(`La base E2E debe terminar en _e2e (es "${name}")`);
  }
  target.pathname = "/postgres";
  const admin = postgres(target.toString(), { max: 1 });
  try {
    const rows = await admin`select 1 from pg_database where datname = ${name}`;
    if (rows.length === 0) {
      await admin.unsafe(`create database "${name}"`);
    }
  } finally {
    await admin.end();
  }
}

/** `true` si la tabla ya existe: la siembra crece a medida que los pasos agregan tablas. */
async function hasTable(sql: Sql, name: string): Promise<boolean> {
  const rows = await sql`select to_regclass(${`public.${name}`}) is not null as present`;
  return rows[0]?.present === true;
}

async function truncateAll(sql: Sql): Promise<void> {
  const rows = await sql`select tablename from pg_tables where schemaname = 'public'`;
  const names = rows.map((row) => `"public"."${String(row.tablename)}"`);
  if (names.length > 0) {
    await sql.unsafe(`truncate table ${names.join(", ")} restart identity cascade`);
  }
}

async function seedUsers(sql: Sql): Promise<boolean> {
  if (!(await hasTable(sql, "branches")) || !(await hasTable(sql, "users"))) {
    return false;
  }
  const ownerHash = await hashPassword(USERS.owner.password);
  const mechanicHash = await hashPassword(USERS.mechanic.password);
  await sql`
    insert into branches (id, name, next_order_number)
    values (${SEED.branchId}, 'Vitacura', 1)
  `;
  await sql`
    insert into users (id, branch_id, email, password_hash, name, role) values
      (${SEED.ownerId}, ${SEED.branchId}, ${USERS.owner.email}, ${ownerHash}, ${USERS.owner.name}, 'owner'),
      (${SEED.mechanicId}, ${SEED.branchId}, ${USERS.mechanic.email}, ${mechanicHash}, ${USERS.mechanic.name}, 'mechanic')
  `;
  return true;
}

async function seedBookings(sql: Sql): Promise<void> {
  const serviceDate = localDate(1);
  const startsAt = new Date(Date.now() + DAY_MS);
  const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
  const rows = [
    {
      id: SEED.bookingInicioId,
      code: "VB-E2E-0001",
      name: "Carla Reserva",
      phone: "+56911112222",
      email: "carla@e2e.vectorbikes.cl",
      bike: "Trek Marlin 7",
    },
    {
      id: SEED.bookingCompletaId,
      code: "VB-E2E-0002",
      name: "Pedro Reserva",
      phone: "+56922223333",
      email: "pedro@e2e.vectorbikes.cl",
      bike: "Specialized Allez",
    },
  ];
  for (const row of rows) {
    await sql`
      insert into bookings (
        id, code, service_date, mode, status, starts_at, ends_at, customer_name, phone_e164,
        email, bike, description, consent_at, cancel_token_hash
      ) values (
        ${row.id}, ${row.code}, ${serviceDate}, 'taller', 'confirmed', ${startsAt}, ${endsAt},
        ${row.name}, ${row.phone}, ${row.email}, ${row.bike}, 'Mantención general y frenos',
        ${new Date()}, ${randomBytes(32).toString("hex")}
      )
    `;
  }
}

async function seedCatalog(sql: Sql): Promise<void> {
  if (!(await hasTable(sql, "services")) || !(await hasTable(sql, "service_prices"))) {
    return;
  }
  await sql`
    insert into services (id, branch_id, name, description, estimated_minutes, usual_materials, aftercare)
    values
      (${SEED.serviceMantencionId}, ${SEED.branchId}, 'Mantención general', 'Limpieza, ajuste de cambios y frenos, revisión general', 90, 'Lubricante de cadena y desengrasante', 'Revisar la presión de los neumáticos cada semana'),
      (${SEED.serviceFrenosId}, ${SEED.branchId}, 'Ajuste de frenos', 'Ajuste y centrado de frenos', 30, null, null)
  `;
  for (const bikeType of BIKE_TYPES) {
    await sql`
      insert into service_prices (branch_id, service_id, bike_type, price_clp) values
        (${SEED.branchId}, ${SEED.serviceMantencionId}, ${bikeType}, 35000),
        (${SEED.branchId}, ${SEED.serviceFrenosId}, ${bikeType}, 12000)
    `;
  }
}

async function seedOrders(sql: Sql): Promise<void> {
  for (const table of ["customers", "bikes", "work_orders"]) {
    if (!(await hasTable(sql, table))) {
      return;
    }
  }
  await sql`
    insert into customers (id, branch_id, name, phone_e164, email)
    values (${SEED.customerId}, ${SEED.branchId}, 'Cliente Taller E2E', '+56933334444', 'cliente@e2e.vectorbikes.cl')
  `;
  await sql`
    insert into bikes (id, branch_id, customer_id, brand, model, bike_type)
    values (${SEED.bikeId}, ${SEED.branchId}, ${SEED.customerId}, 'Specialized', 'Rockhopper', 'mtb')
  `;
  const hasItems = await hasTable(sql, "work_order_items");
  const listaTotal = hasItems ? 25000 : 0;
  const now = new Date();
  await sql`
    insert into work_orders (
      id, branch_id, number, customer_id, bike_id, status, requested_service, assigned_mechanic_id,
      estimated_delivery_date, received_at, created_by, qc_approved_at, qc_approved_by, total_clp
    ) values
      (${SEED.orderRecibidaId}, ${SEED.branchId}, 1, ${SEED.customerId}, ${SEED.bikeId}, 'recibida', 'Mantención general', ${SEED.mechanicId}, ${localDate(2)}, ${now}, ${SEED.ownerId}, null, null, 0),
      (${SEED.orderControlId}, ${SEED.branchId}, 2, ${SEED.customerId}, ${SEED.bikeId}, 'control_calidad', 'Ajuste de frenos', ${SEED.mechanicId}, ${localDate(1)}, ${now}, ${SEED.ownerId}, null, null, 0),
      (${SEED.orderListaId}, ${SEED.branchId}, 3, ${SEED.customerId}, ${SEED.bikeId}, 'lista_para_retirar', 'Mantención general', ${SEED.mechanicId}, ${localDate(0)}, ${now}, ${SEED.ownerId}, ${now}, ${SEED.ownerId}, ${listaTotal})
  `;
  if (hasItems) {
    await sql`
      insert into work_order_items (
        id, branch_id, work_order_id, kind, origin, service_id, description, quantity,
        unit_price_clp, estimated_minutes, created_by
      ) values (
        ${SEED.itemListaId}, ${SEED.branchId}, ${SEED.orderListaId}, 'servicio', 'inicial', null,
        'Mantención general', 1, 25000, 90, ${SEED.ownerId}
      )
    `;
  }
  await sql`update branches set next_order_number = 4 where id = ${SEED.branchId}`;
}

async function seedLibraryArticle(sql: Sql): Promise<void> {
  await sql`
    insert into knowledge_articles (id, slug, title, category, kind, status, created_by)
    values (${SEED.libraryArticleId}, 'transmision-12v-identificacion',
      'Identificación de transmisión de 12 velocidades', 'transmision', 'articulo', 'publicado', ${SEED.ownerId})
  `;
  await sql`
    insert into article_versions (id, article_id, number, content_md, summary, content_hash, published_at, reviewed_by)
    values (${SEED.libraryVersionId}, ${SEED.libraryArticleId}, 1,
      'Identificación del cambio trasero RD-M8100-SGS de la transmisión Deore XT de 12 velocidades.',
      'Identificación del cambio trasero Deore XT de 12 velocidades.',
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', now(), ${SEED.ownerId})
  `;
  await sql`
    update knowledge_articles set current_version_id = ${SEED.libraryVersionId}
    where id = ${SEED.libraryArticleId}
  `;
  await sql`
    insert into article_variant_links (version_id, variant_id)
    values (${SEED.libraryVersionId}, ${SEED.libraryVariantId})
  `;
}

async function seedLibrary(sql: Sql): Promise<void> {
  if (!(await hasTable(sql, "manufacturers")) || !(await hasTable(sql, "knowledge_articles"))) {
    return;
  }
  await sql`
    insert into manufacturers (id, slug, name)
    values (${SEED.libraryManufacturerId}, 'shimano', 'Shimano')
  `;
  await sql`
    insert into component_families (id, manufacturer_id, slug, name, category)
    values (${SEED.libraryFamilyId}, ${SEED.libraryManufacturerId}, 'deore-xt', 'Deore XT', 'transmision')
  `;
  await sql`
    insert into component_models (id, family_id, code, name, component_type, generation, speeds)
    values (${SEED.libraryModelId}, ${SEED.libraryFamilyId}, 'RD-M8100-SGS',
      'Cambio trasero Deore XT 12 velocidades', 'cambio_trasero', 'M8100', 12)
  `;
  await sql`
    insert into component_variants (id, model_id, code, revision)
    values (${SEED.libraryVariantId}, ${SEED.libraryModelId}, 'RD-M8100-SGS', '')
  `;
  await sql`
    insert into technical_specifications (id, variant_id, kind, label, value_text, unit, validation_status)
    values (${SEED.librarySpecId}, ${SEED.libraryVariantId}, 'torque',
      'Tornillo de fijación al cuadro', '', 'Nm', 'sin_dato_verificado')
  `;
  await sql`
    insert into technical_documents (id, manufacturer_id, variant_id, title, canonical_url, license, doc_type, language)
    values (${SEED.libraryDocumentId}, ${SEED.libraryManufacturerId}, ${SEED.libraryVariantId},
      'Manual Deore XT M8100', 'https://si.shimano.com/#/es/search/Series?name=DEORE%20XT%20M8100', 'enlace', 'manual', 'en')
  `;
  await seedLibraryArticle(sql);
}

/** Base E2E limpia y sembrada antes de cada corrida de `pnpm test:tablet`. */
export default async function globalSetup(): Promise<void> {
  rmSync(E2E_STORAGE_DIR, { recursive: true, force: true });
  await ensureDatabase(E2E_DATABASE_URL);
  // drizzle() reemplaza los serializadores de fecha del cliente que recibe: migrar con uno propio
  // deja el de la siembra con los de postgres-js, que aceptan Date.
  const migrator = postgres(E2E_DATABASE_URL, { max: 1 });
  try {
    await migrate(drizzle({ client: migrator }), { migrationsFolder: "drizzle" });
  } finally {
    await migrator.end();
  }
  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  try {
    await truncateAll(sql);
    if (await seedUsers(sql)) {
      await seedBookings(sql);
      await seedCatalog(sql);
      await seedOrders(sql);
      await seedLibrary(sql);
    }
  } finally {
    await sql.end();
  }
}
