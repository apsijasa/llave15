BG-46 · Marca provisional de Llave 15: distintivo y firma

## Contexto y autorización (Andrés, 18-nov)

Paso 46 de la fase Llave 15 (decisión 57; nombre en BG-D31) y primero del sub-bloque de identidad visual (BG-46…BG-49, BG-D32…BG-D40). El dueño entregó el manual de marca (`docs/marca/Manual_de_marca_Llave_15.docx`) y aprobó **dibujar un SVG provisional** del logo (BG-D37) mientras llegan los archivos maestros. Este paso solo crea los cuatro SVG en `public/brand/` y su prueba; **ningún archivo de `src/` cambia** (nadie los usa todavía: BG-47 pone el favicon, BG-48 el ingreso y BG-49 el menú). El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-46 — Marca provisional de Llave 15: distintivo y firma (E2-T13)"**, y en `tasks.json` (tarea `E2-T13`). Ese texto manda: tiene las medidas, los `viewBox`, los colores exactos por variante y las marcas de accesibilidad.

## Lee antes

`AGENTS.md` ("Diseño por paso"); `.claude/rules/ui-design.md` (marca de Llave 15, BG-D37: nombre accesible `Llave 15`, firma ≥ 132 px, distintivo ≥ 24 px, espacio libre ¼ del lado; se escribe «Llave 15» y `LLAVE 15` solo dentro del logo); el bloque de BG-46 del blueprint, el encabezado del sub-bloque "identidad visual Llave 15" y BG-D37 en §20.3; las imágenes de referencia `docs/marca/llave15-portada.png` y `docs/marca/llave15-variantes.png` (míralas: son la fuente del dibujo); una prueba existente que use `sharp` (busca `from "sharp"` en `tests/`) como patrón.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-28`). Prueba nueva primero, en rojo; después los SVG. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-46`.

## Qué hacer

Exactamente estos cinco archivos nuevos:

1. `public/brand/llave15-distintivo.svg` (`viewBox="0 0 40 40"`): cuadrado de radio 6 con el corte oblicuo de la esquina superior derecha (el borde superior termina en x = 29 y baja en diagonal hasta (40, 11)), relleno `#ae3718`; "15" en cifras condensadas en negrita, **en trazos** (`<path>`), relleno `#ffffff`, centrado.
2. `public/brand/llave15-firma.svg` (`viewBox="0 0 176 40"`, principal, para fondos claros): el distintivo en x 0–40 (`#ae3718` con "15" `#ffffff`) y `LLAVE 15` en mayúsculas condensadas en negrita, **en trazos**, desde x = 50, alto de mayúscula 26, color `#171c22`.
3. `public/brand/llave15-firma-invertida.svg` (para grafito): distintivo `#ff774f` con "15" `#171c22`; letras `#ffffff`.
4. `public/brand/llave15-firma-mono.svg`: distintivo `#171c22` con "15" `#ffffff`; letras `#171c22`.
5. `tests/unit/llave15-brand.test.ts`: los criterios 1 a 4 (marcas obligatorias, ninguna de `<text`, `<image`, `<style`, `<script`, `font-family`; hex de cada archivo ⊆ los de su variante; `sharp` rasteriza cada firma a 132 px de ancho y el distintivo a 24 px y el PNG tiene ese ancho).

Cada SVG: `xmlns="http://www.w3.org/2000/svg"`, `viewBox`, `role="img"`, `aria-label="Llave 15"`, `<title>Llave 15</title>` como **primer hijo**, hex en minúsculas, sin referencias externas, sin `<text>`, `<image>`, `<style>`, `<script>` ni `font-family`. Las letras se dibujan como polígonos o trazos rectos de una condensada negrita (estilo DIN Condensed Bold, sin cargar la fuente); que se lean claramente a 132 px de ancho. Es provisional (BG-D37): prioriza que sea legible, proporcionado y fiel a las referencias sobre el detalle tipográfico.

## No cambiar

- **Ningún archivo de `src/`** (el Verify lo comprueba con `git diff HEAD --name-only -- src`), `public/favicon.svg`, ni los archivos de Vector Bikes de `public/brand/` (`vector-bikes-logo.png`, `favicon-32.png`, `apple-touch-icon.png`).
- Ninguna prueba existente, `tests/helpers/**`, `e2e/`, `drizzle/`, `package.json` ni el lockfile (`sharp` ya está instalado). No leer ni escribir archivos de entorno.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; los `test`/`grep` del Verify del bloque BG-46 → como indica cada línea; `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-46 y `pnpm gate` → exit 0; además mira los SVG renderizados.

## Reporte

Los cinco archivos con sus líneas, una descripción breve de cómo dibujaste las letras, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué.
