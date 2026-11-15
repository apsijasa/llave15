# BT-20 · Library tab inside the work order

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-20 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E6-T2` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E6-T2` de `blueprints/vector-biblioteca/epics/06-ordenes.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`, `.claude/rules/taller-ui.md` y `.claude/rules/ui-design.md`; y como patrón y contrato: `src/pages/taller/ordenes/[id]/componentes.astro`, `src/lib/taller-tabs.ts`, `src/server/library/diagnoses.ts`, `technical-context.ts`, `src/pages/taller/biblioteca/asistente.astro`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/pages/taller/ordenes/[id]/biblioteca.astro`
- `src/lib/taller-tabs.ts`
- `src/components/taller/library/DiagnosisChecklist.astro`
- `tests/integration/orden-biblioteca-page.test.ts`

## Criterios de aceptación

1. WHEN se abre `/taller/ordenes/[id]/biblioteca` THE SYSTEM SHALL mostrar la tarjeta de contexto (bici, componentes), el formulario de pregunta al asistente con alcance `orden`, la lista de diagnósticos de la orden y un formulario 'Agregar al diagnóstico' que solo guarda tras el POST explícito
2. WHEN se lee `src/lib/taller-tabs.ts` THE SYSTEM SHALL tener la pestaña Biblioteca con permiso `library.ai`
3. WHEN el mecánico no tiene acceso a la orden THE SYSTEM SHALL responder 403; sin sesión, 303
4. WHEN se guarda un diagnóstico desde la respuesta THE SYSTEM SHALL conservar las citas como referencias versionadas y redirigir con `?hecho=diagnostico`

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/orden-biblioteca-page.test.ts   # expect: exit 0, 0 failed
grep -q 'biblioteca' src/lib/taller-tabs.ts   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
