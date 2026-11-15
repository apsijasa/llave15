# BT-18 · Assistant screen and environment variables

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-18 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E5-T3` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E5-T3` de `blueprints/vector-biblioteca/epics/05-ia.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`, `.claude/rules/taller-ui.md` y `.claude/rules/ui-design.md`; y como patrón y contrato: `src/server/library/assistant.ts`, `src/server/library/ai-provider.ts`, `src/pages/taller/biblioteca/compatibilidad.astro`, `.env.example`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/pages/taller/biblioteca/asistente.astro`
- `src/components/taller/library/ConfidenceCard.astro`
- `.env.example`
- `tests/integration/biblioteca-asistente-page.test.ts`

## Criterios de aceptación

1. WHEN se abre `/taller/biblioteca/asistente` THE SYSTEM SHALL mostrar el formulario de pregunta, el historial reciente de la sucursal (solo preguntas y confianza) y, tras el POST, la respuesta con tarjeta de confianza, panel de fuentes enlazadas a fichas/versiones y el supuesto/siguiente verificación
2. WHEN el proveedor devuelve `quota` THE SYSTEM SHALL mostrar un aviso `role="alert"` sin llamar al proveedor
3. WHEN se lee `.env.example` THE SYSTEM SHALL tener `AI_PROVIDER=none`, `ANTHROPIC_API_KEY=` y `AI_MODEL=claude-sonnet-5-5` comentadas
4. WHEN no hay `library.ai` THE SYSTEM SHALL responder 403

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/biblioteca-asistente-page.test.ts   # expect: exit 0, 0 failed
grep -q 'AI_PROVIDER=none' .env.example && grep -q 'ANTHROPIC_API_KEY=' .env.example   # expect: exit 0
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
