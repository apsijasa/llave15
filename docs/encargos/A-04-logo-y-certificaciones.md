Logo e identidad del taller en correos e informe; certificaciones

## Contexto y autorización (Andrés, 12-nov)

El logo (`public/brand/vector-bikes-logo.png`) solo aparece en la portada pública y como `og:image` en `src/layouts/Base.astro`. Los correos (`renderHtml` en `src/server/email/templates.ts`) llevan el nombre del taller como texto, y el informe público (`src/components/taller/ReportView.astro`, servido por `src/pages/informe/[token].astro` con `chrome="none"`) no tiene logo ni datos de contacto. Tampoco existe un lugar donde mostrar las certificaciones del taller. Andrés quiere que todo lo que recibe el cliente lleve la marca, y una lista de certificaciones que él llena cuando las tenga.

Regístralo como **decisión 51** en `blueprints/vector-taller-f1/blueprint.md` §20.3, con este texto:

> **Logo e identidad en lo que recibe el cliente; certificaciones** (decisión del dueño, 2026-11-12, rama `feat/etapa-a`, encargo `docs/encargos/A-04-logo-y-certificaciones.md`): `SITE` (`src/lib/site.ts`) gana `url` (`https://vectorbikes.cl`), `logoPath` (`/brand/vector-bikes-logo.png`) y `certifications: readonly string[]`, vacía hasta que el dueño la llene. `renderHtml` antepone a la línea de marca `<img src="${SITE.url}${SITE.logoPath}" alt="Vector Bikes" width="160" height="auto">` y, cuando hay certificaciones, las lista en el pie; `renderText` no cambia. Esto toca el HTML de los correos de reservas que el blueprint §1 fija como constante: la constante se levanta solo para la cabecera y el pie de marca; asuntos, filas, notas y enlaces siguen iguales. La imagen es alojada, no adjunta: un cliente que bloquea imágenes ve el `alt`. `ReportView` muestra el logo arriba, los datos de contacto y las certificaciones abajo; la portada muestra las certificaciones en la sección del taller solo si la lista no está vacía, así las pruebas del build siguen iguales mientras lo esté.

## Lee antes

`AGENTS.md`; `.claude/rules/ui-design.md`; `.claude/rules/taller-ui.md`; `.claude/rules/server-api.md`.

## Rama y reparto

Rama `feat/etapa-a`, sobre el último commit. Pruebas primero; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate` y commitea). Commits que hará Claude: `feat: show the shop logo and certifications in emails and the report` y `docs: record the shop identity in emails as decision 51`.

## Reglas de negocio decididas

| Tema | Regla |
|---|---|
| `SITE` | `url: "https://vectorbikes.cl"`, `logoPath: "/brand/vector-bikes-logo.png"`, `certifications: [] as const` tipado como `readonly string[]`. Ningún otro campo cambia. |
| Correos | En `renderHtml`, antes del `<p>` con `SITE.name` en mayúsculas: `<p style="margin:0 0 16px"><img src="…" alt="Vector Bikes" width="160" style="display:block;height:auto;border:0"></p>`. En el pie, si `SITE.certifications.length > 0`, una línea más `Certificaciones: a · b`. `renderText` idéntico al de hoy. |
| Informe público | `ReportView` empieza con `<p class="brand"><img src={SITE.logoPath} alt="Vector Bikes" width="160" height="auto"></p>` (ruta relativa: lo sirve el mismo sitio) y termina con un `<footer>`-like `<section>` "Vector Bikes · Av. Kennedy 7666, Vitacura · info@vectorbikes.cl · +56 9 8509 5780" y, si hay certificaciones, "Certificaciones: …". Sin `<header>`/`<footer>` reales (la prueba de página exige que no existan). |
| Portada | En `#taller`, bajo el teléfono: `{SITE.certifications.length > 0 && <p style="margin-top:12px">Certificaciones: {SITE.certifications.join(" · ")}</p>}`. Con la lista vacía el HTML de la portada es idéntico. |
| Diseño | Solo tokens existentes; ninguna regla nueva en `global.css`. El `<img>` del informe usa el `<style>` de `ReportView`. |

## Qué hacer

- **`src/lib/site.ts`**: los tres campos.
- **`src/server/email/templates.ts`** (`renderHtml`, +~8 líneas): el `<img>` y la línea de certificaciones.
- **`src/components/taller/ReportView.astro`**: importar `SITE` de `../../lib/site.ts` (permitido: componentes importan `src/lib/**`); logo arriba, contacto y certificaciones abajo; una regla `.brand img { max-width: 160px; height: auto; }` en su `<style>`.
- **`src/components/Landing.astro`**: la línea condicional en `#taller`.

## No cambiar

- `src/styles/global.css`, `src/layouts/Base.astro` (ya usa el logo para `og:image`).
- Asuntos, filas, notas y enlaces de todos los correos; `renderText`.
- `src/server/taller/reports.ts`, el `snapshot` del informe, `src/pages/informe/[token].astro`.
- `tests/build/landing.test.ts`, `seo.test.ts`, `a11y.test.ts` y todas las pruebas existentes: deben pasar sin tocarlas (la lista de certificaciones queda vacía en este encargo).
- Fotos por orden: sin tope.

## Pruebas (primero, verlas fallar)

**`tests/unit/email-brand.test.ts`:**
- Para cada plantilla exportada de `templates.ts` que recibe una reserva (`customerConfirmationEmail`, `bookingRescheduledEmail`, `reminderEmail`, `shopNewBookingEmail`, `shopRescheduledEmail`, `shopCancellationEmail`) y para `receivedBikeEmail`, `readyForPickupEmail` y `quoteEmail` (`order-templates.ts`): el `html` contiene `<img src="https://vectorbikes.cl/brand/vector-bikes-logo.png" alt="Vector Bikes"` exactamente una vez, y el `text` no contiene "brand/".
- Con `vi.mock("../../src/lib/site.ts")` devolviendo `certifications: ["Shimano Service Center", "SRAM Technical"]`, el pie del `html` contiene "Certificaciones: Shimano Service Center · SRAM Technical"; con la lista vacía, el `html` no contiene "Certificaciones".

**`tests/integration/report-view-brand.test.ts`** (`experimental_AstroContainer` de `astro/container`: `const container = await AstroContainer.create(); await container.renderToString(ReportView, { props: { snapshot, photos: {} } })` con un `snapshot` v1 mínimo armado a mano con el tipo `ReportSnapshot` de `src/server/taller/reports.ts`; el mock de `SITE` con `vi.mock("../../src/lib/site.ts", …)` y `vi.resetModules()` + import dinámico del componente por caso): el HTML contiene `<img src="/brand/vector-bikes-logo.png" alt="Vector Bikes"`, "Av. Kennedy 7666" y "info@vectorbikes.cl"; sin certificaciones no contiene "Certificaciones"; con el mock de `SITE`, sí; no contiene `<header` ni `<footer`.

Ninguna prueba existente se modifica. Si `tests/build/*` o `tests/integration/email.test.ts` fallan, detente y reporta con el diff.

## Documentación

- Decisión 51 en §20.3.
- `README.md`, "Configuración de producción (referencia)": una sección corta "11. Certificaciones del taller": "Se escriben en `certifications` de `src/lib/site.ts`; aparecen en el informe, en los correos y en la portada. Con la lista vacía no se muestra nada."

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0. Claude: `pnpm gate` → exit 0.
2. Con `pnpm dev`: abrir un informe público y ver el logo arriba y el contacto abajo, en claro y oscuro; leer en el log un correo y comprobar el `<img>` en el HTML.

## Reporte

La cola de `pnpm check`, `pnpm test` y `pnpm build`, el HTML de la cabecera de un correo generado en las pruebas, líneas finales de `templates.ts`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
