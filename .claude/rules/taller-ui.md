---
description: Pantallas del área interna /taller, pensadas primero para tablet
paths:
  - "src/pages/taller/**"
  - "src/components/taller/**"
  - "src/layouts/TallerLayout.astro"
---

# Interfaz del taller

- Tablet primero: recepción, checklist, fotos, firma, orden de trabajo, control de calidad, venta de mostrador, caja y ajuste de stock se diseñan para 820×1180 en vertical y con las manos sucias; el escritorio viene después. Catálogo, usuarios, informes, compras, proveedores, gastos, indicadores, "Mi taller" y `/plataforma` son de escritorio.
- La recepción la hace cualquier rol, también el mecánico (FASE1 decisión 5): sus pantallas no se esconden al mecánico.
- Objetivos táctiles ≥ 48px de alto y de ancho en las pantallas de taller (botones, opciones del checklist, selects, enlaces de acción), separados al menos 8px. Única excepción: el menú lateral con mouse (`pointer: fine`, ≥ 1024px) usa opciones de 34px; con el dedo, 48px.
- Nada que dependa de pasar el mouse por encima; nada que exija teclear párrafos: opciones tocables (`input type=radio` dentro de `label`), selects y campos cortos. Las notas son opcionales.
- Estados de orden con forma + texto: `<span class="status status--<estado>">` con un borde propio por estado (sólido, punteado, doble, rayado con `--hatch`) y la etiqueta de `STATUS_LABELS`. Nunca solo color. Lo mismo para inventario, caja y talleres: `status--bajo` ("Bajo mínimo"), `status--sin-stock` ("Sin stock"), `status--diferencia` ("Diferencia +$1.000"), `status--anulada` ("Anulada"), y en `/plataforma` "Activo" y "Suspendido".
- Tablas densas con `font-variant-numeric: tabular-nums`; montos con `formatClp`; números con `formatOrderNumber` (`OT-00001`), `formatSaleNumber` (`VM-00001`) y `formatPurchaseNumber` (`OC-00001`).
- Montos de órdenes `neto`: Neto / `IVA (19%)` / Total con `OrderAmounts.astro` dentro del `<dl class="data">`; en órdenes `final`, el marcado de siempre sin cambios.
- Mismos tokens de `src/styles/tokens.css` (importados por `global.css`); ningún hex nuevo; radio 2px, reglas de 1px, sin sombras. Los estilos comunes del área viven en `src/styles/taller-layout.css` (base, identidad, menú y columna de escritorio) y `src/styles/taller-components.css` (superficies, avisos, formularios, estados y tablas), importados en ese orden por `src/layouts/TallerLayout.astro` (sobre `AppLayout` desde BG-27), bajo la clase `.taller`; cada componente de `src/components/taller/` lleva los suyos en su propio `<style>` (scoped o `is:global` bajo `.taller`), y los que usa una sola página van en el `<style is:global>` de esa página, también bajo `.taller`; `global.css` no se toca.
- Las únicas islas del área son `src/components/taller/PhotoCapture.tsx` y `src/components/taller/SignaturePad.tsx`, con `client:load`. Todo lo demás es HTML del servidor con formularios POST que redirigen 303 a la misma página (`?hecho=…`). La venta de mostrador calcula su total con un botón "Calcular total" que vuelve a renderizar en el servidor. El logo de "Mi taller" se sube con un formulario `multipart/form-data`, sin isla.
- Las islas y los componentes no importan `src/server/**`: reciben props (montos y marca ya formateados) y hablan con el servidor por `fetch` (fotos) o por un `input` del formulario que las contiene (firma).
- Formularios con `label` visible; errores en texto con `aria-invalid`/`aria-describedby`; avisos de resultado con `role="status"`; grupos de opciones en `fieldset` con `legend` (los specs los ubican por ese nombre).
- Toda página empieza con sesión → permiso; los enlaces y botones se ocultan según `can(...)`, pero el servidor vuelve a revisar. El grupo de menú "Inventario y caja" filtra cada enlace por su acción; "Mi taller" se muestra con `shop.manage` y "Plataforma" solo con `isPlatformAdmin`.
- Un solo `h1` por página; controles nativos (`button`, `a`, `label` + `input`), nunca `div` clicable.
- Títulos de página del personal con `PLATFORM.name` (`… — Bike Garage`) y la marca del menú `Bike Garage · Taller`; un texto que va al cliente (WhatsApp, cotización) usa el nombre del taller del perfil de la sucursal del usuario. Nunca el nombre del taller literal.
- Fuera de la recepción, al mecánico no se le muestran teléfono, correo ni RUT del cliente, ni costos de productos.
