BG-22 · Tokens de diseño y layouts del sistema

## Contexto y autorización (Andrés, 18-nov)

Paso 22 de la fase Llave 15 (decisión 57; nombre en BG-D31). Hoy todo el sistema (ingreso, `/taller`, `/admin`, páginas del cliente) se arma sobre `src/layouts/Base.astro`, la portada de Vector Bikes, que trae el FAQ, el JSON-LD de `LocalBusiness`, el wordmark y los metadatos `og:` del sitio. Los tokens de color viven al inicio de `src/styles/global.css`. Este paso separa los tokens en `src/styles/tokens.css` (copiados literalmente, ningún valor cambia) y crea los dos layouts nuevos del sistema, `AppLayout` y `PublicLayout`, **sin usarlos todavía** desde ninguna página (las páginas pasan a ellos en BG-23 y BG-27). El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-22 — Tokens de diseño y layouts del sistema (E2-T6)"**, y en `tasks.json` (tarea `E2-T6`). Ese texto manda.

Diseño por paso (BG-D32…BG-D40): BG-22 está antes de BG-47, así que **rige el monocromo aprobado**. Ningún valor de Llave 15 (Inter, `--accent`, radios de 8/12px, `:root.l15`) entra en este paso.

## Lee antes

`AGENTS.md` (sección "Diseño por paso"); `.claude/rules/ui-design.md`; el bloque de BG-22 del blueprint y FASE §9 (`blueprints/bike-garage/FASE-BIKE-GARAGE.md`); `src/styles/global.css` (líneas 1–47: imports de Tailwind, `@source`, y los tres bloques `:root` claro, oscuro por `prefers-color-scheme` y `[data-theme="dark"]`; el bloque `:root` de `prefers-reduced-motion` cerca de la línea 992 **se queda** en `global.css`); `src/layouts/Base.astro` (fuentes, preloads, `<head>`); `src/lib/platform.ts` (`PLATFORM.footerLine`); `src/server/shops/profile.ts` (`ShopProfile`); y una prueba que renderiza componentes con `experimental_AstroContainer` (por ejemplo `tests/integration/reschedule-page.test.ts`) como patrón.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-21`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (`pnpm test:build` y `pnpm gate`) y el Checkpoint con el tag `bg-22`.

## Qué hacer

Exactamente estos cinco archivos:

1. `src/styles/tokens.css` (nuevo): los tres bloques `:root` de las líneas 6–47 de `global.css` (claro; `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) … }`; `:root[data-theme="dark"]`), **copiados carácter por carácter** (mismos nombres, mismos valores, mismo orden; incluye `--logo-filter`, las fuentes, `--ease`, `--field-border`, `--dur-fast` y `--dur`).
2. `src/styles/global.css`: borra esos tres bloques y agrega `@import "./tokens.css";` justo después de los dos `@import` de Tailwind (antes de los `@source`). Nada más cambia en este archivo; sigue siendo la excepción de la regla 7 de `AGENTS.md`.
3. `src/layouts/AppLayout.astro` (nuevo): la raíz del sistema. Props `{ title: string; description?: string; noindex?: boolean }`. `<!doctype html>`, `<html lang="es-CL">`, los mismos `meta` de `charset`, `viewport` y `color-scheme`, las mismas fuentes y preloads de `Base.astro` (Michroma, Archivo Variable, IBM Plex Mono), importa `../styles/global.css` (que ya trae `tokens.css`), `<title>`, `description` si viene, `<meta name="robots" content="noindex">` si `noindex`, y un `<slot />` en el `<body>`. **Sin** FAQ, sin JSON-LD, sin wordmark, sin `og:` de Vector Bikes, sin importar `src/lib/site.ts` ni `Base.astro`.
4. `src/layouts/PublicLayout.astro` (nuevo): páginas del cliente, sobre `AppLayout`. Props `{ title: string; description?: string; noindex?: boolean; profile: { name: string; logoPath: string | null; addressShort: string; email: string } }` (ya formateado; no importa `src/server/**`). `noindex` por defecto `true`. Encabezado con el logo (`<img src={profile.logoPath} alt={profile.name}>`) si hay `logoPath`, o el nombre del taller en texto si no; `<main>` con `<slot />`; pie con el nombre, la dirección y el correo del taller y la línea `PLATFORM.footerLine` (`Gestionado con Llave 15`). Usa solo clases y estilos que ya existen en `global.css` (sin colores, sombras ni radios nuevos; si necesitas un estilo, que sea con las variables de `tokens.css`, en un `<style>` scoped y sin hex).
5. `tests/integration/layouts.test.ts` (nuevo): los criterios 1 a 4. Para 1 y 2, lee los archivos con `node:fs` y compara con `git show 8bca898:src/styles/global.css` (o con los valores copiados en la prueba); para 3 y 4, renderiza con `experimental_AstroContainer` `PublicLayout` con el perfil del Taller Demo (`Taller Demo`, sin logo) y `AppLayout`, y afirma `Taller Demo`, `Gestionado con Llave 15`, `noindex`, la ausencia de `application/ld+json`, del FAQ y del wordmark.

## No cambiar

- Ningún valor de token, ningún hex nuevo ni perdido (lo comprueba el Verify contra `8bca898`); ningún estilo de `global.css` fuera de los tres bloques movidos.
- `Base.astro`, `TallerLayout.astro` y todas las páginas: **ninguna página usa todavía los layouts nuevos**. Ninguna prueba existente, `tests/helpers/**`, `e2e/`, `drizzle/`, `package.json` ni el lockfile (las fuentes ya están instaladas). No leer ni escribir archivos de entorno.
- Regla 14 (ningún dato de un taller en `src/`: nada de "Vector Bikes" en los layouts nuevos), regla 9 (elementos no-void cerrados), regla 10 (`set:html` solo en el JSON-LD de `Base.astro`: los layouts nuevos no lo usan).
- Monocromo hasta BG-46: nada de Inter, `--accent`, `.l15` ni radios nuevos.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; el `test` de los hex del Verify → exit 0; `grep -q 'tokens.css' src/styles/global.css` → 0; `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-22 (`pnpm test:build` incluido) y `pnpm gate` → exit 0.

## Reporte

Los cinco archivos con sus líneas, el resultado del `test` de hex, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
