BG-48 · Controles, foco, estados e ingreso de Llave 15

## Contexto y autorización (Andrés, 18-nov)

Paso 48 de la fase Llave 15 (decisión 57; nombre en BG-D31) y tercero del sub-bloque de identidad visual (BG-D32…BG-D40). BG-47 dejó la clase `l15` en `<html>` de `AppLayout` y los tokens de Llave 15 en `:root.l15` (`tokens.css`), sin usarlos todavía. Este paso los usa por primera vez: botones, controles, foco, radios y colores de estado, más la firma y el descriptor en `/admin/login`. El paso completo, con sus criterios EARS, la lista exacta de estados por grupo y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-48 — Controles, foco, estados e ingreso de Llave 15 (E2-T15)"**, y en `tasks.json` (tarea `E2-T15`). Ese texto manda.

## Lee antes

`AGENTS.md` ("Diseño por paso"); `.claude/rules/ui-design.md` y `.claude/rules/taller-ui.md` (desde BG-48: botón primario `--accent`, foco `--focus` 2px a 2px, radios `--radius-control`/`--radius-card`, estados con forma + texto + color de su grupo); el bloque de BG-48 del blueprint, BG-D35 y BG-D36 en §20.3; `src/styles/tokens.css` (`:root.l15`, BG-47), `src/styles/global.css` (solo para leer qué selectores tienen radio 2px y cómo se llaman botones, tarjetas, ticket y avisos), `src/styles/taller-components.css`, `src/layouts/AppLayout.astro`, `src/pages/admin/login.astro`, `src/lib/platform.ts` (`PLATFORM.descriptor`), `src/server/taller/rules.ts` (`STATUS_LABELS`); `tests/integration/llave15-tokens.test.ts` y `tests/integration/layouts.test.ts` (patrón de lectura de CSS y de la Container API).

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-47`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (`pnpm test:build` y `pnpm test:tablet` incluidos), `pnpm gate` y el Checkpoint con el tag `bg-48`.

## Qué hacer

Cinco archivos escritos a mano, según el "Hacer" del blueprint:

1. `src/styles/llave15.css` (nuevo): todo bajo `.l15`, sin hex, sin sombras, sin `!important`, menos de 400 líneas. Tipos, botones (`.btn`, `.btn:hover`, `.btn.ghost`), controles, radio de las superficies de `global.css` que hoy tienen 2px, foco `:focus-visible` (y `.on-dark`), y `.status` + cada `.status--<clase>` con `--status-bg`/`--status-ink` de su grupo, **cada clase en exactamente un grupo**, con la lista literal del blueprint.
2. `src/styles/taller-components.css`: lo del punto (2) del blueprint. Cada `border-style` y cada `::before` de los estados quedan iguales; solo cambian fondo, color, borde a `currentColor`, rayados con `var(--status-bg, var(--surface))` y radios. Sigue bajo 400 líneas (hoy 329: si te acercas, compacta selectores, no partas el archivo).
3. `src/layouts/AppLayout.astro`: `import "../styles/llave15.css";` justo después de `global.css`.
4. `src/pages/admin/login.astro`: la firma principal sobre el formulario (`<img src="/brand/llave15-firma.svg" alt="Llave 15" width="176" height="40" />`, espacio libre ≥ 10 px) y un `<p>` con `PLATFORM.descriptor`. Ningún otro texto ni comportamiento del ingreso cambia (origen, errores, `next`).
5. `tests/integration/llave15-components.test.ts` (nuevo): los criterios del blueprint (parsear bloques de selectores y declaraciones de ambos CSS; grupos de estado exactos; `.taller .status` con el fondo; `::before` de cada estado de `STATUS_LABELS`; botones y foco; sin hex ni `box-shadow`; render de `/admin/login` con la Container API y `vi.mock` de lo que haga falta, como en las pruebas de páginas existentes).

**Ningún valor esperado cambia:** la paridad corre **sin** `--allow` ni `--skip`. Si una prueba existente falla (por ejemplo una que lea `taller-components.css` o renderice `/admin/login`), **no la modifiques**: repórtala (archivo, línea, error) y termina el resto.

## No cambiar

- `global.css` (excepción de la regla 7, intacto), `tokens.css`, `Base.astro`, `PublicLayout.astro`, `TallerLayout.astro`, `taller-layout.css`, `web/vector-bikes/`, ningún componente ni otra página, los SVG de `public/brand/`.
- Las formas (`border-style`, `::before`) y las etiquetas de los estados; ningún texto visible salvo el descriptor del ingreso. Menú en grafito, firma del menú y pie son de BG-49.
- Ninguna prueba existente, `tests/helpers/**`, `e2e/`, `drizzle/`, `package.json` ni el lockfile. No leer ni escribir archivos de entorno.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; las líneas `pnpm test`/`grep`/`for`/`git diff` del Verify del bloque BG-48 → como indica cada una; `node scripts/bg-expect-parity.ts` → 0.
2. Claude: el Verify completo del bloque BG-48 (`pnpm test:build`, `pnpm test:tablet`) y `pnpm gate` → exit 0; además mira `/admin/login` y una orden con estados renderizados.

## Reporte

Los cinco archivos con sus líneas, la tabla de estados por grupo tal como quedó, qué selectores de `global.css` recibieron `var(--radius-card)` o `var(--radius-control)`, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué.
