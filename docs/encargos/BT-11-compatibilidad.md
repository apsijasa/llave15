# BT-11 · Compatibility by component set

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-11 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E3-T2` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E3-T2` de `blueprints/vector-biblioteca/epics/03-procedimientos-compatibilidad.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md` (aplica por analogía a `src/server/library/**`: `db`, `actor`, `now`; permiso primero; auditoría en la transacción; error centinela) y `.claude/rules/server-api.md`; `.claude/rules/server-api.md`, `.claude/rules/taller-ui.md` y `.claude/rules/ui-design.md`; y como patrón y contrato: `src/server/library/catalog.ts`, `src/pages/taller/ventas/nueva.astro` (formulario POST que vuelve a renderizar), `src/server/api/handlers.ts#isAllowedOrigin`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/library/compatibility.ts`
- `src/pages/taller/biblioteca/compatibilidad.astro`
- `src/data/library/pack.json`
- `tests/integration/library-compatibility.test.ts`
- `tests/integration/biblioteca-compatibilidad-page.test.ts`

## Criterios de aceptación

1. WHEN `checkCompatibility` recibe un conjunto cubierto por una regla `oficial_confirmada` THE SYSTEM SHALL devolver ese veredicto con evidencia y documento; cubierto por `condicionada`, las condiciones; por `incompatible`, las restricciones
2. WHEN no hay regla que cubra el conjunto THE SYSTEM SHALL devolver `no_verificada` aunque todas las variantes compartan `speeds`
3. WHEN una regla está `archivada` THE SYSTEM SHALL ignorarla
4. WHEN se abre `/taller/biblioteca/compatibilidad` THE SYSTEM SHALL ofrecer selects por rol (shifter, cambio, cassette, cadena, plato, núcleo) y el POST vuelve a renderizar el veredicto con su etiqueta y justificación

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/library-compatibility.test.ts tests/integration/biblioteca-compatibilidad-page.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
