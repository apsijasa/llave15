# BT-13 · Proposals: draft, submit, PII detection

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-13 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E4-T1` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E4-T1` de `blueprints/vector-biblioteca/epics/04-contribuciones.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md` (aplica por analogía a `src/server/library/**`: `db`, `actor`, `now`; permiso primero; auditoría en la transacción; error centinela) y `.claude/rules/server-api.md`; y como patrón y contrato: `src/server/taller/audit.ts`, `src/server/taller/components.ts` (patrón de escritura con transacción, auditoría y error centinela), `src/server/library/rules.ts`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/library/pii.ts`
- `src/server/library/proposals.ts`
- `src/server/taller/audit.ts`
- `tests/unit/library-pii.test.ts`
- `tests/integration/library-proposals.test.ts`

## Criterios de aceptación

1. WHEN `detectPii` recibe un texto con teléfono, RUT, correo o patente chilena THE SYSTEM SHALL devolver un hallazgo por cada uno con su tipo
2. WHEN un usuario crea una propuesta THE SYSTEM SHALL guardarla `draft` con su `branch_id` y autor; `submitProposal` la pasa a `submitted`, guarda `pii_flags` y audita `proposal.submitted`
3. WHEN el autor edita una propuesta `in_review` o `approved` THE SYSTEM SHALL devolver `invalid_transition`; en `needs_changes` SHALL permitirlo y volver a `draft`
4. WHEN un usuario de otra sucursal consulta la propuesta THE SYSTEM SHALL devolver `not_found`
5. WHEN una propuesta está `submitted` THE SYSTEM SHALL no aparecer en `searchLibrary`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/unit/library-pii.test.ts tests/integration/library-proposals.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
