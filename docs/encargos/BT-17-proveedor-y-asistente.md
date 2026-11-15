# BT-17 · AI provider and assistant with citations and quotas

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-17 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E5-T2` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E5-T2` de `blueprints/vector-biblioteca/epics/05-ia.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md` (aplica por analogía a `src/server/library/**`: `db`, `actor`, `now`; permiso primero; auditoría en la transacción; error centinela) y `.claude/rules/server-api.md`; y como patrón y contrato: `src/lib/env.ts`, `src/server/library/retrieval.ts`, `src/server/taller/audit.ts#redactDetails`, `src/server/library/rules.ts`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/lib/env.ts`
- `src/server/library/ai-provider.ts`
- `src/server/library/assistant.ts`
- `tests/unit/library-ai-env.test.ts`
- `tests/unit/library-ai-provider.test.ts`
- `tests/integration/library-assistant.test.ts`

## Criterios de aceptación

1. WHEN `getAiEnv` corre sin variables THE SYSTEM SHALL devolver `AI_PROVIDER: 'none'`; con `anthropic` sin clave SHALL lanzar `EnvError` que nombra `ANTHROPIC_API_KEY`
2. WHEN el proveedor es `none` THE SYSTEM SHALL responder en modo solo fuentes: resumen extractivo de los trozos, citas y confianza `media` con evidencia o `no_verificada` sin ella
3. WHEN el proveedor es `anthropic` (con `fetch` falso) THE SYSTEM SHALL enviar el bloque de política como `system`, las fuentes delimitadas como datos y pedir JSON; una fuente con 'ignora las reglas' no altera el bloque de política
4. WHEN la respuesta del proveedor contiene un número con unidad (Nm, mm, bar, psi) ausente de las fuentes citadas THE SYSTEM SHALL bajar la confianza a `no_verificada` y marcar el supuesto
5. WHEN la sucursal supera `AI_DAILY_QUOTA_PER_BRANCH` o el usuario `AI_PER_USER_PER_MINUTE` THE SYSTEM SHALL devolver `quota` sin llamar al proveedor; toda interacción se guarda en `ai_interactions` con pregunta y respuesta redactadas

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/unit/library-ai-env.test.ts tests/unit/library-ai-provider.test.ts tests/integration/library-assistant.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
