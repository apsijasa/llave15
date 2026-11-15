# BT-21 · Tablet spec: assistant in the order and diagnosis

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-21 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E6-T3` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E6-T3` de `blueprints/vector-biblioteca/epics/06-ordenes.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/e2e.md` (con la excepción BT-D7: esta fase autoriza editar `e2e/fixtures.ts` y `e2e/global-setup.ts`); y como patrón y contrato: `e2e/fixtures.ts`, `e2e/biblioteca-busqueda.spec.ts`, `e2e/orden-mecanico.spec.ts`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `e2e/orden-biblioteca.spec.ts`

## Criterios de aceptación

1. WHEN el mecánico abre su orden `recibida` en tablet y la pestaña Biblioteca THE SYSTEM SHALL mostrar el contexto, aceptar una pregunta (modo `none`), mostrar la tarjeta de confianza y permitir 'Agregar al diagnóstico' con un toque; el diagnóstico aparece en la lista
2. WHEN el mecánico abre la pestaña de una orden que no es suya THE SYSTEM SHALL responder 403

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm build && pnpm test:tablet e2e/orden-biblioteca.spec.ts   # expect: exit 0 (coordinadora)
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
