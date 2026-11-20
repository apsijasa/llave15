BG-49 · Firma de Llave 15 en el menú, el pie del cliente y los correos

## Contexto y autorización (Andrés, 18-nov)

Paso 49 de la fase Llave 15 (decisión 57; nombre en BG-D31) y último del sub-bloque de identidad visual (BG-D32…BG-D40). BG-47 puso tokens e Inter, BG-48 botones, foco, radios y estados. Este paso cierra la identidad: menú del personal en grafito con la firma invertida, pie del cliente con el distintivo y `<Taller> · Gestionado con Llave 15`, y la misma línea al pie de los correos. El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-49 — Firma de Llave 15 en el menú, el pie del cliente y los correos (E2-T16)"**, y en `tasks.json` (tarea `E2-T16`). Ese texto manda.

## Lee antes

`AGENTS.md` ("Diseño por paso"); `.claude/rules/ui-design.md` y `.claude/rules/taller-ui.md` (desde BG-49: menú en grafito, firma invertida 132 px con `alt="Llave 15"` + `Taller`, objetivos de 48 px y opciones de 34 px con mouse); el bloque de BG-49 del blueprint, BG-D38 y BG-D39 en §20.3; `src/layouts/TallerLayout.astro`, `src/styles/taller-layout.css`, `src/layouts/PublicLayout.astro`, `src/server/email/templates.ts`, `src/server/email/brand.ts` (`EmailBrand.shopName`, `footerLine`), `src/lib/platform.ts`; `src/styles/llave15.css` (BG-48: `.on-dark` y foco); `tests/integration/layouts.test.ts`, `tests/integration/llave15-components.test.ts` y `tests/helpers/shops.ts` (Taller Demo) como patrón.

## Rama y reparto

Rama `feat/bike-garage`, sobre el último commit (tag `bg-48`). Prueba nueva primero, en rojo; después el código. Cierre: `pnpm format && pnpm check && pnpm test && pnpm build` en verde. Sin commits ni push. Claude corre el Verify completo (`pnpm test:build` y `pnpm test:tablet` incluidos), `pnpm gate` y el Checkpoint con el tag `bg-49`.

## Qué hacer

Cinco archivos escritos a mano, según el "Hacer" del blueprint:

1. `src/layouts/TallerLayout.astro`: `<p class="taller-brand">` → `<a class="taller-brand on-dark" href="/taller"><img src="/brand/llave15-firma-invertida.svg" alt="Llave 15" width="132" height="30" /><span class="taller-area">Taller</span></a>`. Línea del usuario, menú, grupos, enlaces, permisos y `Salir` sin cambios.
2. `src/styles/taller-layout.css`: lo del punto (2) del blueprint (grafito, enlaces, actual, hover, cajón de tablet en `--surface`, `.taller-user`, foco blanco salvo en el cajón abierto, radios, espacio libre ≥ 8 px). Sin hex; los objetivos de 48 px y la compactación con mouse quedan iguales.
3. `src/layouts/PublicLayout.astro`: el encabezado no cambia; el pie pasa a `<img src="/brand/llave15-distintivo.svg" alt="" width="24" height="24" />` + `{profile.name} · {PLATFORM.footerLine}`.
4. `src/server/email/templates.ts`: el pie compartido (hoy `paragraph(brand.footerLine)` en `html` y `lines.push(brand.footerLine)` en `text`) escribe `${brand.shopName} · ${brand.footerLine}`, sin imágenes nuevas. Si encuentras el pie armado en otro archivo además de este, **detente y repórtalo**.
5. `tests/integration/llave15-layouts.test.ts` (nuevo): los criterios del blueprint (render de `TallerLayout` por rol con la Container API, lectura de `taller-layout.css`, render de `PublicLayout` con el Taller Demo, confirmación de una reserva del Taller Demo en `text` y `html`).

## Valores esperados que cambian (declarados)

Solo las expectativas que contienen la marca del menú `Llave 15 · Taller` o la línea exacta `Gestionado con Llave 15` como pie (del cliente o de un correo) y que dejan de cumplirse, pasan al valor nuevo: la firma seguida de `Taller`, y `<nombre del taller> · Gestionado con Llave 15` (`Vector Bikes · Gestionado con Llave 15` para Vector Bikes, `Taller Demo · …` para el demo). Candidatas que vi, a confirmar corriendo la suite: `tests/unit/part-added-email.test.ts:52`, `tests/unit/tracking-in-emails.test.ts:94` (texto completo del correo), y, si esas páginas usan `PublicLayout`, `tests/integration/token-pages-isolation.test.ts:193` y `tests/integration/report-brand-isolation.test.ts:180`. Las que usan `toContain("Gestionado con Llave 15")` siguen pasando y no se tocan; `notices-isolation.test.ts:192` (`not.toContain`) tampoco. Cambia **solo la cola del matcher** al valor declarado, mantenla en una línea (la paridad compara colas de una línea) y **reporta cada cambio** (archivo y línea). Cualquier otra prueba que falle, **no la modifiques**: repórtala (archivo, línea, error) y termina el resto.

## No cambiar

- Rutas, permisos, textos del menú, asuntos y condiciones de envío de los correos, el encabezado del cliente.
- `global.css`, `tokens.css`, `llave15.css`, `taller-components.css`, `AppLayout.astro`, `Base.astro`, `web/vector-bikes/`, ningún componente ni página, los SVG de `public/brand/`.
- `tests/helpers/**`, `e2e/` (salvo una expectativa declarada de arriba, si la hubiera), `drizzle/`, `package.json` ni el lockfile. No leer ni escribir archivos de entorno. `templates.ts` bajo 400 líneas.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0; las líneas `pnpm test`/`grep`/`test` del Verify del bloque BG-49 → como indica cada una; `node scripts/bg-expect-parity.ts --allow 'Llave 15'` → 0.
2. Claude: el Verify completo del bloque BG-49 (`pnpm test:build`, `pnpm test:tablet`) y `pnpm gate` → exit 0; además mira el menú del personal y una página del cliente renderizados.

## Reporte

Los cinco archivos con sus líneas, cada cambio en pruebas existentes línea por línea, la salida de la línea de hex del Verify, la cola de `pnpm check`, `pnpm test` y `pnpm build`, la paridad, y cualquier prueba existente que haya fallado y por qué.
