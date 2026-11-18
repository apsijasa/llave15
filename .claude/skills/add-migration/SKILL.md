---
name: add-migration
description: Cambiar el esquema de Postgres de llave15 (agregar tabla, columna, índice o check). Usar cuando se pide "agregar un campo", "nueva tabla", "cambiar el esquema" o "migración".
---

# Agregar una migración

## Cuándo usar
- Cualquier cambio en `src/server/db/schema*.ts`.
- Un campo nuevo en una tabla de `blueprint.md` §4 (fase 1, fase 2 o llave15).

## Pasos
1. Elegir el archivo de la cadena donde vive la tabla: `schema-shops.ts` ← `schema.ts` ← `schema-taller.ts` ← `schema-inventory.ts` ← `schema-orders.ts` ← `schema-reports.ts` ← `schema-cash.ts` ← `schema-sales.ts` ← `schema-payments.ts` ← `schema-library-catalog.ts` ← `schema-library-knowledge.ts` ← `schema-library-procedures.ts` ← `schema-library-private.ts` (cada uno importa solo de los anteriores; < 400 líneas). Una tabla nueva va al arreglo de su archivo.
2. Toda tabla de operación nueva lleva `branch_id uuid not null` con FK a `branches`; toda consulta filtra por el alcance del taller (`BookingScope` o `actor.branchId`). Nunca un valor de un taller (comunas, tarifas, nombres) en un CHECK: eso va en `shops` y se valida con zod.
3. Cambios solo aditivos. Destructivos (renombrar, borrar, NOT NULL nuevo, reemplazar un índice o un CHECK): primero la parte aditiva y publicar; migrar los datos con un script TypeScript idempotente (`scripts/bg-backfill.ts` es el modelo, con `--dry-run` y salida 0/1/2); el cambio destructivo en su propio paso y su propia generación, en una ventana posterior. Excepciones declaradas: `payments_method_check` (F2-20) y el contract BG-09, BG-10 y BG-11.
4. Escribir primero la prueba en `tests/integration/` con `createTestDb()` (siembra el taller Vector Bikes) o `seedTwoShops()` (dos talleres) que ejercite la columna o restricción nueva.
5. Ejecutar `pnpm db:generate` y leer el SQL que emite (no editarlo a mano). Si pregunta algo, detenerse: el cambio no es el declarado.
6. Ejecutar `pnpm db:migrate` (solo contra la base del workspace) y `pnpm db:check`.
7. Publicar desde Replit en la ventana que corresponda (`docs/ventanas/`), con el taller cerrado y respaldo del día: la plataforma propaga el esquema a producción; confirmarlo en el panel *Database*.

## Verify
```bash
pnpm check        # expect: exit 0
pnpm test         # expect: exit 0, 0 failed
pnpm db:migrate   # expect: exit 0
pnpm db:check     # expect: exit 0
```

## No hacer
- Ejecutar `drizzle-kit push` o migrar contra la base de producción.
- Editar archivos dentro de `drizzle/` o usar `drizzle-kit generate --custom`.
- Borrar filas de `bookings`, de `shops` o de cualquier tabla de operación.
- Importar de un archivo de esquema posterior en la cadena.
- Escribir a mano el `branch_id` de una fila con el valor por defecto de compatibilidad (`onlyBranchId`): el código de producción siempre lo pasa explícito.
