# BT-08 · Documents access by license

## Contexto y autorización (Andrés, 15-11-2026, fase Biblioteca)

Paso BT-08 de la fase Biblioteca (`blueprints/vector-biblioteca/BIBLIOTECA.md`, decisiones BT-D1 a BT-D15; arquitectura en `blueprints/vector-biblioteca/blueprint.md`). Los pasos anteriores ya están en `main` y commiteados (tags `bt-NN`).

Es la tarea `E2-T4` de `blueprints/vector-biblioteca/tasks.json`. La especificación exacta —firmas, reglas, textos de pantalla y pruebas— es el bloque `E2-T4` de `blueprints/vector-biblioteca/epics/02-biblioteca-base.md`: **léelo completo**, junto con las secciones comunes del inicio de esa épica (stack, reglas transversales, interfaz del taller).

## Lee antes

`AGENTS.md`; `.claude/rules/taller-domain.md` (aplica por analogía a `src/server/library/**`: `db`, `actor`, `now`; permiso primero; auditoría en la transacción; error centinela) y `.claude/rules/server-api.md`; `.claude/rules/server-api.md`, `.claude/rules/taller-ui.md` y `.claude/rules/ui-design.md`; y como patrón y contrato: `src/server/taller/photos.ts` (`handleMediaRequest`), `src/pages/taller/biblioteca/componentes/[id].astro`. Relee cada archivo que vas a tocar (otros pasos pudieron cambiarlo).

## Rama y reparto

En `main`, desde el commit actual. **Pruebas primero** (verlas fallar), luego el código. Sin commit, tag ni push: los hace la coordinadora. Tu sandbox no tiene Postgres ni red: corre `pnpm format`, `pnpm check`, las pruebas del Verify, `pnpm test` y `pnpm build`. `db:migrate`, `db:check`, `test:tablet`, `smoke` y `gate` los corre la coordinadora.

## Archivos (máximo estos)

- `src/server/library/documents.ts`
- `src/pages/taller/biblioteca/documentos/[id].astro`
- `tests/integration/library-documents.test.ts`
- `tests/integration/biblioteca-documento-page.test.ts`

## Criterios de aceptación

1. WHEN `documentAccess` recibe un documento `enlace` THE SYSTEM SHALL devolver `mode: 'enlace'` con la URL canónica; `extracto_permitido` → `mode: 'extracto'` con los trozos; `copia_autorizada` con `storage_key` → `mode: 'visor'` con ruta `/taller/media/<key>`; nunca una URL del almacenamiento
2. WHEN se abre `/taller/biblioteca/documentos/[id]` THE SYSTEM SHALL mostrar título, fabricante, tipo, idioma, revisión, checksum, estado, licencia y la acción según el modo
3. WHEN el documento está `retirado` THE SYSTEM SHALL mostrarlo con etiqueta y sin enlace al original

## No cambiar

- Nada en `drizzle/` a mano; nunca `--custom`. `.claude/settings.json`, `.env`, secretos.
- Ninguna prueba existente, salvo la edición que el bloque de la épica declare autorizada (BT-D7).
- Firmas exportadas existentes, rutas existentes, tokens de diseño, `src/styles/global.css`. Ninguna isla nueva. Ningún hex nuevo.
- `src/server/library/**` nunca escribe en `work_orders`, líneas, pagos, aprobaciones, stock ni estados (BT-D10).
- Ningún texto con el nombre del taller escrito a mano (`SITE.name`). Importaciones relativas con `.ts`, `import type`, sin `enum`, archivos < 400 líneas, funciones < 50, nunca `new Date()` en `src/server/**`, nunca `db.query.*`.

## Verificación (la corre completa la coordinadora)

```bash
pnpm test tests/integration/library-documents.test.ts tests/integration/biblioteca-documento-page.test.ts   # expect: exit 0, 0 failed
pnpm format && pnpm gate   # expect: exit 0
```

## Reporte

Resumen archivo por archivo con líneas de cada archivo tocado, resultado de `format`, `check`, `test` y `build`, y cualquier desviación del bloque de la épica con su motivo.
