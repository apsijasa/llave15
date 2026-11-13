---
name: add-migration
description: Cambiar el esquema de Postgres de Vector Bikes (agregar tabla, columna, índice o check). Usar cuando se pide "agregar un campo", "nueva tabla", "cambiar el esquema" o "migración".
---

# Agregar una migración

## Cuándo usar
- Cualquier cambio en `src/server/db/schema*.ts`.
- Un campo nuevo en una tabla de `blueprint.md` §4 (fase 1 o fase 2).

## Pasos
1. Elegir el archivo de la cadena donde vive la tabla: `schema.ts` ← `schema-taller.ts` ← `schema-inventory.ts` ← `schema-orders.ts` ← `schema-reports.ts` ← `schema-cash.ts` ← `schema-sales.ts` ← `schema-payments.ts` (cada uno importa solo de los anteriores; < 400 líneas). Una tabla nueva va al arreglo de su archivo.
2. Cambios solo aditivos. Destructivos (renombrar, borrar, NOT NULL nuevo): primero la parte aditiva y publicar; quitar lo viejo en una publicación posterior. Única excepción de la fase 2: el CHECK `payments_method_check` (paso F2-20).
3. Escribir primero la prueba en `tests/integration/` con `createTestDb()` que ejercite la columna o restricción nueva.
4. Ejecutar `pnpm db:generate` y leer el SQL que emite (no editarlo a mano). Si pregunta algo, detenerse: el cambio no es aditivo.
5. Ejecutar `pnpm db:migrate` (solo contra la base del workspace) y `pnpm db:check`.
6. Publicar desde Replit en la ventana que corresponda (`docs/ventanas/`), con el taller cerrado y respaldo del día: la plataforma propaga el esquema a producción; confirmarlo en el panel *Database*.

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
- Borrar filas de `bookings` o de cualquier tabla de operación.
- Importar de un archivo de esquema posterior en la cadena.
