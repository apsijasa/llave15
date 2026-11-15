# BT-22 · Isolation suite and library health

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-22 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E7-T1` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E7-T1` de `blueprints/vector-biblioteca/epics/07-cierre.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md` (aplica por analogía a `src/server/library/**`: `db`, `actor`, `now`; permiso primero; auditoría en la transacción; error centinela) y `.claude/rules/server-api.md`; `.claude/rules/database.md` (scripts) y el patrón de `scripts/f2-check.ts`; y como patrón y contrato: `scripts/f2-check.ts`, `src/server/taller/phase2-health.ts`, todos los módulos de `src/server/library/**`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/library/isolation-health.ts`
- `scripts/library-check.ts`
- `package.json`
- `tests/integration/library-isolation.test.ts`
- `tests/integration/library-health.test.ts`

## Criterios de aceptación

1. WHEN corre `tests/integration/library-isolation.test.ts` THE SYSTEM SHALL probar con dos sucursales que diagnósticos, notas, interacciones, propuestas, contexto de orden y recuperación nunca cruzan; que el curador no recibe filas privadas de otra sucursal; que una sesión revocada obtiene `null` en `requireAdmin` y 303 en las páginas
2. WHEN `libraryIsolationHealth` corre sobre una base sana THE SYSTEM SHALL devolver `ok: true`; con un diagnóstico cuya orden pertenece a otra sucursal, `ok: false` con el conteo
3. WHEN `node scripts/library-check.ts` corre con `DATABASE_URL` inalcanzable THE SYSTEM SHALL salir 2

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/library-isolation.test.ts tests/integration/library-health.test.ts   # expect: exit 0, 0 failed
out="$(DATABASE_URL=postgres://127.0.0.1:1/x node scripts/library-check.ts 2>&1)"; test $? -eq 2   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
