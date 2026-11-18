---
description: Fidelidad al diseño aprobado y accesibilidad de la interfaz
paths:
  - "src/components/**"
  - "src/layouts/**"
  - "src/styles/**"
  - "src/pages/*.astro"
  - "src/pages/[slug]/**"
---

# Interfaz

- `docs/design-preview.html` manda: clases, textos y estructura se copian de ahí; las únicas diferencias permitidas están en `blueprint.md` §6. Es el diseño de Llave 15.
- Colores solo con variables de `:root` (`--ground`, `--surface`, `--ink`, `--ink-2`, `--steel`, `--rule`, `--hatch`, `--on-ink`, `--field-border`), que viven en `src/styles/tokens.css` desde BG-22 (`global.css` lo importa); ningún hex nuevo.
- Radio 2px, reglas de 1px, sin sombras (salvo `inset 0 0 0 1px var(--ink)` de selección).
- Botón primario invierte en hover (fondo `--surface`, texto y borde `--ink`); enlaces de nav con `:not(.btn)`.
- Formularios: `label` visible con `for`, `.fields{align-items:start}`, `.field{align-content:start}`, errores en texto con `aria-invalid` y `aria-describedby`.
- Un solo `h1` por página, niveles sin saltos; controles nativos (`button`, `a`, `details`), nunca `div` clicable.
- Transiciones con `var(--dur-fast)`/`var(--dur)`; sin `!important`.
- Layouts: `AppLayout` (raíz del sistema: fuentes, `tokens.css`, `global.css`; sin FAQ, JSON-LD ni wordmark) ← `TallerLayout` (personal, marca `PLATFORM.name`) y `PublicLayout` (cliente: nombre o logo del taller desde `/<slug>/logo`, pie `Gestionado con Llave 15`). `Base.astro` queda solo para la portada heredada de Vector Bikes hasta BG-DC1.
- En lo público, una sola isla (`BookingIsland`, `client:visible`) en `/<slug>/reservar` y en la portada heredada; recibe el taller por props (`IslandShop`) y lo comparte con sus hijos por `ShopContext`. Todo lo demás es HTML del servidor o estático. El área `/taller` tiene sus propias reglas en `.claude/rules/taller-ui.md`.
- Ningún dato de un taller en `src/`: la portada heredada toma sus textos de `web/vector-bikes/src/content/site.ts` (excepción BG-D14); lo público por taller, del perfil (`ShopProfile`); los componentes reciben todo ya formateado.
- WhatsApp: si `PUBLIC_WHATSAPP_NUMBER` está vacío, el botón no se renderiza (`whatsappHref` en `src/lib/whatsapp.ts` desde BG-27).
- Etiquetas no-void siempre cerradas (Astro 7).
