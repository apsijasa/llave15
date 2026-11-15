# BT-06 · Library home, results page and menu group

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-06 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E2-T2` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E2-T2` de `blueprints/vector-biblioteca/epics/02-biblioteca-base.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`, `.claude/rules/taller-ui.md` y `.claude/rules/ui-design.md`; y como patrón y contrato: `src/pages/taller/buscar.astro`, `src/layouts/TallerLayout.astro`, `src/styles/taller-components.css`, `src/components/taller/Card.astro`, `PageHeader.astro`, `tests/integration/indicadores-page.test.ts` (Container API). Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/pages/taller/biblioteca/index.astro`
- `src/pages/taller/biblioteca/buscar.astro`
- `src/components/taller/library/CategoryIcon.astro`
- `src/components/taller/library/LibraryStatus.astro`
- `src/layouts/TallerLayout.astro`
- `src/styles/taller-components.css`
- `tests/integration/biblioteca-pages.test.ts`

## Criterios de aceptación

1. WHEN un usuario con sesión abre `/taller/biblioteca` THE SYSTEM SHALL mostrar un `h1` Biblioteca, el buscador con `label`, ocho tarjetas de categoría con enlace a `/taller/biblioteca/buscar?categoria=` y accesos rápidos filtrados por `can`
2. WHEN abre `/taller/biblioteca/buscar?q=RD-M8100-SGS` THE SYSTEM SHALL mostrar la coincidencia exacta arriba con estado, código, fabricante y revisión, y los filtros como formulario GET
3. WHEN no hay sesión THE SYSTEM SHALL responder 303 a `/admin/login?next=…`; sin `library.view`, 403
4. WHEN se lee `TallerLayout.astro` THE SYSTEM SHALL tener el grupo 'Conocimiento' con Biblioteca, Asistente, Propuestas y Revisión filtrados por acción (Revisión además por `canCurate`)
5. WHEN se leen los estilos nuevos THE SYSTEM SHALL usar solo tokens (`status--verificado`, `status--condicionado`, `status--desactualizado`, `status--en_revision`, `status--sin_dato_verificado`) con forma + texto

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/biblioteca-pages.test.ts   # expect: exit 0, 0 failed
grep -Eq '#[0-9a-fA-F]{3,6}' src/pages/taller/biblioteca/index.astro src/pages/taller/biblioteca/buscar.astro src/components/taller/library/*.astro; test $? -eq 1   # expect: exit 0 — ningún hex
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
