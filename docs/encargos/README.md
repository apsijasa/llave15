# Encargos a Codex

Un encargo es el documento con el que la sesión coordinadora (Claude) le pide a Codex una tarea acotada. Codex lee `AGENTS.md`, no `CLAUDE.md` ni `.claude/rules/`, así que cada encargo trae todo lo que necesita: la decisión ya redactada, los archivos exactos, las reglas por ruta, los no negociables que tocan y el cierre con `pnpm gate`.

Reparto (`docs/BITACORA.md` §2): Claude escribe el encargo y revisa lo que vuelve; Codex implementa con TDD en la rama indicada, con `pnpm gate` en verde y sin push. El dueño decide cuándo sube a `main` y publica en Replit.

## Reglas de todo encargo

- Chico: un área de archivos, una decisión, "escribe primero y verifica una vez al final".
- Pruebas primero, en rojo. Ninguna prueba existente se modifica sin autorización escrita del dueño citada en la decisión; si una falla, Codex se detiene y reporta con el diff.
- Fotos por orden sin tope (decisión del dueño, 12-11-2026): ningún encargo agrega un máximo de fotos.
- `drizzle/` solo por `pnpm db:generate`; `pnpm db:migrate` y `pnpm db:check` solo contra la base dev.
- Correos y WhatsApp después del commit; nunca dentro de una transacción.
- Nada se borra: `voided_at`. Tokens solo como hash. Sin PII en logs.
- Archivos < 400 líneas, funciones < 50. Ninguna isla nueva en `/taller`. Ningún hex nuevo.
- Páginas públicas por token: el token es la credencial, sin chequeo de `Origin`, rate limit, `no-store`, `noindex`, `no-referrer`, solo primer nombre.
- Cierre de Codex: `pnpm format && pnpm check && pnpm test && pnpm build` en verde, sin commits ni push, resumen archivo por archivo. El sandbox de Codex no tiene red, ni siquiera a `127.0.0.1`: **no corre** `pnpm db:migrate`, `pnpm db:check`, `pnpm test:tablet`, `pnpm smoke` ni `pnpm gate`. Esos los corre Claude al revisar, junto con el commit. Si Codex necesita una migración aplicada, la genera con `pnpm db:generate` y lo anota en el reporte.

## Plantilla

1. Título en una línea.
2. **Contexto y autorización (Andrés, fecha):** qué pasa hoy (archivo y función), qué se quiere, y "Regístralo como decisión NN en `blueprints/vector-taller-f1/blueprint.md` §20.3" con el texto de la decisión.
3. **Lee antes:** `AGENTS.md` y las reglas de `.claude/rules/` por ruta.
4. **Rama y reparto:** rama, base, pruebas primero, gate en verde, sin push, commits sugeridos.
5. **Reglas de negocio decididas** (tabla).
6. **Esquema** (si aplica).
7. **Qué hacer**, archivo por archivo, con firmas.
8. **No cambiar.**
9. **Pruebas (primero, verlas fallar).**
10. **Documentación.**
11. **Verificación.**
12. **Reporte.**

## Lista de revisión de Claude por cada pase

- [ ] `git diff --stat` toca solo los archivos listados, más `drizzle/NNNN_*.sql` y `drizzle/meta/` generados si hubo esquema (generados, no editados).
- [ ] Las pruebas nuevas existen en los archivos nombrados; `git diff -- tests/ e2e/` solo agrega archivos, nunca modifica existentes.
- [ ] Claude corre `pnpm db:migrate` y `pnpm db:check` (base dev) si hubo esquema, y `pnpm format && pnpm gate` en verde antes de commitear.
- [ ] Ningún archivo > 400 líneas; ninguna isla nueva en `/taller`; ningún hex nuevo; `requireAdmin → can → zod → src/server/taller/**` en páginas nuevas; correos post-commit; sin `new Date()` en `src/server/**`; sin PII en logs.
- [ ] Tokens solo como hash; páginas públicas con `no-store`, `noindex`, `no-referrer`, rate limit y solo primer nombre.
- [ ] Decisión NN registrada en §20.3 con el texto acordado; README actualizado; `.env.example` sin cambios salvo variable autorizada.
- [ ] Capturas 820×1180 y 1280×800, claro y oscuro, de cada pantalla tocada (las toma Claude con el build local).
- [ ] Reporte con los pasos exactos de Replit si hubo esquema.

## Etapa A (noviembre 2026)

| Id | Encargo | Decisión | Esquema | Tag |
|---|---|---|---|---|
| A-01 | Enlace público de seguimiento `/seguimiento/[token]` | 49 | `order_tracking_tokens` | `a-01` |
| A-02 | Enlace de seguimiento en los correos de la orden | 49 | — | `a-02` |
| A-03 | Cotización por correo desde la orden | 50 | — | `a-03` |
| A-04 | Logo e identidad en correos e informe; certificaciones | 51 | — | `a-04` |
| A-05a | Próxima mantención planificada en el informe | 52 | columnas en `service_reports` | `a-05a` |
| A-05b | Tarea diaria `/api/tareas/mantenciones` | 52 | — | `a-05b` |
| A-07 | Indicadores: consultas del servidor | 54 | — | `a-07` |
| A-08 | Pantalla `/taller/indicadores` | 54 | — | `a-08` |
| A-06 | WhatsApp "lista para retirar" para órdenes | 53 | `order_whatsapp_notices` | `a-06` |
| A-09 | Cierre documental (Claude, sin Codex) | — | — | `a-09` |


## Etapa C (noviembre 2026)

| Id | Encargo | Decisión | Esquema | Tag |
|---|---|---|---|---|
| C-01 | [Panel: consultas del servidor](C-01-panel-servidor.md) | BG-D55 | — | `c-01` |
| C-02 | [Panel: pantalla y gráficos SVG](C-02-panel-pantalla.md) | BG-D55 | — | `c-02` |
