BG-47 · Tokens, tipografía Inter y favicon de Llave 15

## Contexto y autorización (Andrés, 18-nov)

Paso 47 de la fase Llave 15 (decisión 57; nombre en BG-D31) y segundo del sub-bloque de identidad visual (BG-D32…BG-D40). Desde este paso, todo lo que carga `AppLayout` (por ahora: `TallerLayout`, `/admin/login`, `PublicLayout` y las páginas por token) lleva la clase `l15` en `<html>` y toma los valores de Llave 15 de `:root.l15` en `tokens.css`, con la tipografía Inter. La portada heredada (`Base.astro`, sin la clase) no cambia. El paso completo, con sus criterios EARS, los valores exactos de la paleta y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-47 — Tokens, tipografía Inter y favicon de Llave 15 (E2-T14)"**, y en `tasks.json` (tarea `E2-T14`). Ese texto manda.

**Dependencia ya instalada por Claude** (BG-D34; el sandbox no tiene red): `pnpm add -w --save-exact @fontsource-variable/inter@5.3.0`. `package.json` y `pnpm-lock.yaml` ya están cambiados en el árbol: **no los toques**. Comprueba que existe `node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2` y usa ese nombre de archivo en el `?url` del preload.

## Lee antes

`AGENTS.md` ("Diseño por paso"); `.claude/rules/ui-design.md` (tokens desde BG-47, `:root.l15` solo claro, bloques oscuros con `:not(.l15)`, Inter); el encabezado del sub-bloque de identidad visual y el bloque de BG-47 del blueprint; BG-D32, BG-D33, BG-D34 y BG-D37 en §20.3; `src/styles/tokens.css`, `src/layouts/AppLayout.astro`, `src/lib/platform.ts`; `public/brand/llave15-distintivo.svg` (BG-46, patrón del favicon); `tests/unit/llave15-brand.test.ts` (patrón de prueba de SVG con `sharp`); `tests/integration/layouts.test.ts` (prueba de esta fase, BG-22).

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-46`) más la instalación de Inter en el árbol. Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (`pnpm test:build` incluido), `pnpm gate` y el Checkpoint con el tag `bg-47`.

## Qué hacer

Cinco archivos escritos a mano, según el "Hacer" del blueprint:

1. `src/styles/tokens.css`: los tres bloques de BG-22 conservan sus valores; los dos selectores oscuros pasan a `:root:not([data-theme="light"]):not(.l15)` (dentro del `@media (prefers-color-scheme: dark)`) y `:root[data-theme="dark"]:not(.l15)`; bloque nuevo `:root.l15` con **exactamente** los valores del blueprint (hex en minúsculas).
2. `src/layouts/AppLayout.astro`: `<html lang="es-CL" class="l15">`; importa `@fontsource-variable/inter/index.css` y precarga su `inter-latin-wght-normal.woff2?url` (mismo patrón que `Base.astro` usa con Archivo) **en lugar de** Michroma, Archivo e IBM Plex Mono (sus paquetes se quedan: los usa la portada heredada); íconos `/brand/llave15-distintivo.svg` y `/brand/llave15-favicon-16.svg` (`sizes="16x16"`), en lugar de `/favicon.svg`.
3. `public/brand/llave15-favicon-16.svg` (nuevo): el distintivo simplificado para 16 px (`viewBox="0 0 16 16"`, corte más simple, "15" en trazos gruesos), con las mismas marcas de accesibilidad y prohibiciones de BG-46, hex solo `#ae3718` y `#ffffff`.
4. `src/lib/platform.ts`: `PLATFORM` gana `descriptor: "Software de gestión para talleres de bicicletas"`.
5. `tests/integration/llave15-tokens.test.ts` (nuevo): los criterios del blueprint (mapa exacto de `:root.l15`, selectores oscuros con `:not(.l15)`, `AppLayout` con `class="l15"`, Inter y los íconos y sin las fuentes del monocromo, favicon a 16 px con `sharp`, `PLATFORM.descriptor`).

**Valor esperado que cambia (declarado):** `tests/integration/layouts.test.ts` (BG-22, de esta fase). Sus pruebas de `tokens.css` comparan el archivo completo contra los bloques de `8bca898` y su prueba de `AppLayout` busca `<html lang="es-CL">` y las fuentes Archivo y Michroma. Ajusta **solo** esas expectativas para aceptar el bloque `:root.l15`, los selectores con `:not(.l15)`, `class="l15"` e Inter; las de `PublicLayout` y las de "sin elementos de la portada" no cambian.

## No cambiar

- `global.css`, `Base.astro`, la portada heredada (`pnpm test:build` sin cambios), `web/vector-bikes/`, ningún componente ni ninguna página, `PublicLayout.astro`, `package.json` y `pnpm-lock.yaml` (ya instalados), los SVG de BG-46, `public/favicon.svg`.
- Ninguna otra prueba existente, `tests/helpers/**`, `e2e/`, `drizzle/`. No leer ni escribir archivos de entorno.
- Diseño por paso: en este paso solo entran tokens, tipografía y favicon. Botones, foco, radios en uso y colores de estado son de BG-48; menú, firma y pie, de BG-49. No uses las variables nuevas en ningún estilo todavía.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; las líneas `test`/`node -e`/`grep` del Verify del bloque BG-47 → como indica cada una; `node scripts/bg-expect-parity.ts --allow 'Software de gestión para talleres de bicicletas' --skip tests/integration/layouts.test.ts` → 0.
2. Claude: el Verify completo del bloque BG-47 y `pnpm gate` → exit 0.

## Reporte

Los cinco archivos con sus líneas, los cambios en `layouts.test.ts` línea por línea, la salida de la línea de hex del Verify, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué.
