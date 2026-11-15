# BT-19 · Technical diagnoses and order technical context

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-19 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E6-T1` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E6-T1` de `blueprints/vector-biblioteca/epics/06-ordenes.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md` (aplica por analogía a `src/server/library/**`: `db`, `actor`, `now`; permiso primero; auditoría en la transacción; error centinela) y `.claude/rules/server-api.md`; `.claude/rules/database.md`; y como patrón y contrato: `src/server/db/schema-payments.ts`, `src/server/taller/components.ts`, `src/server/taller/status.ts`, `src/server/taller/rules.ts` (`TERMINAL_STATUSES`), `src/server/library/retrieval.ts`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build` (y `pnpm db:generate` una vez, que no necesita red). `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos, más lo que genere `pnpm db:generate`)

- `src/server/db/schema-payments.ts`
- `src/server/library/diagnoses.ts`
- `src/server/library/technical-context.ts`
- `src/server/taller/audit.ts`
- `tests/integration/library-diagnoses.test.ts`
- `tests/integration/library-technical-context.test.ts`

## Criterios de aceptación

1. WHEN se lee `schema-payments.ts` THE SYSTEM SHALL tener `bike_components.component_variant_id uuid` nullable con FK a `component_variants`; `pnpm db:generate` produce `0037_*.sql` aditiva
2. WHEN `saveDiagnosis` corre con una orden accesible THE SYSTEM SHALL guardar síntomas, inspecciones, hipótesis, referencias versionadas (ids de versión y variante existentes), `ai_interaction_id` opcional, `branch_id` y autor, y auditar `diagnosis.saved`
3. WHEN la orden es de otra sucursal o el mecánico no la puede ver THE SYSTEM SHALL devolver `not_found`/`forbidden` sin escribir
4. WHEN `confirmDiagnosis` corre THE SYSTEM SHALL fijar `confirmado`, `confirmed_by`, `confirmed_at`; nunca cambia `work_orders`
5. WHEN `orderTechnicalContext` corre THE SYSTEM SHALL devolver bici, componentes con su variante ligada y diagnósticos previos de esa orden; fuera de alcance, `forbidden`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/library-diagnoses.test.ts tests/integration/library-technical-context.test.ts   # expect: exit 0, 0 failed
test "$(ls drizzle/0037_*.sql | wc -l | tr -d ' ')" = 1   # expect: exit 0
pnpm db:migrate && pnpm db:check   # expect: exit 0 (coordinadora)
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
