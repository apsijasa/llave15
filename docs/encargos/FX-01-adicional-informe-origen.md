"Crear propuesta" y "Generar informe" sin 403

## Contexto y autorización (Andrés, 16-nov)

En producción, en `/taller/ordenes/<id>/adicional`, al completar problema, recomendación y precio y tocar "Crear propuesta", el navegador muestra `{"error":"No tienes permiso para realizar esta acción.","code":"forbidden"}`. No es un permiso: `src/pages/taller/ordenes/[id]/adicional.astro` responde con `referrer-policy: no-referrer` (objeto `headers` y helper `forbidden()`), y con esa política el navegador envía `Origin: null` al enviar el formulario. `isAllowedOrigin` (`src/server/api/handlers.ts`) rechaza `null`, así que la página devuelve `forbidden()`. `src/pages/taller/ordenes/[id]/informe.astro` tiene la misma combinación, así que "Generar informe" falla igual. Las pruebas de página no lo detectaron porque fijan `origin` a mano.

Regístralo como **decisión F2-D31** en `blueprints/vector-taller-f2/blueprint.md` §20.3 (nueva fila después de la de `F2-D30`, mismo formato de tabla), con este texto:

> **Las páginas internas con formulario usan `referrer-policy: same-origin`** (decisión del dueño, 2026-11-16, rama `fix/fecha-repuesto-adicional`, encargo `docs/encargos/FX-01-adicional-informe-origen.md`): `adicional.astro` e `informe.astro` del taller mandaban `no-referrer`, y con esa política el navegador envía `Origin: null` en el POST del formulario, que `isAllowedOrigin` rechaza: "Crear propuesta", "Generar nuevo enlace" y "Generar informe" respondían 403 desde el día en que se crearon. Pasan a `same-origin`: el navegador manda el `Origin` real al propio sitio y sigue sin mandar referrer a sitios externos. Las páginas públicas por token (`/aprobacion`, `/informe/[token]`, `/seguimiento`) mantienen `no-referrer` porque no chequean `Origin`. Una prueba guardiana impide volver a combinar `isAllowedOrigin` con `no-referrer`. El dueño autorizó cambiar las dos aserciones de `tests/integration/approvals.test.ts` (líneas 337 y 378) que fijaban `no-referrer` en la página interna de Adicional.

## Lee antes

`AGENTS.md`; `.claude/rules/server-api.md`; `.claude/rules/taller-ui.md`; `.claude/rules/e2e.md`.

## Rama y reparto

Rama `fix/fecha-repuesto-adicional` (ya creada desde `main`). Pruebas primero, en rojo; `pnpm format && pnpm check && pnpm test && pnpm build` en verde; sin commits ni push (Claude corre `pnpm gate`, incluidas las pruebas de tablet, y commitea). Escribe primero y verifica una vez al final.

## Qué hacer

- **`src/pages/taller/ordenes/[id]/adicional.astro`**: `"referrer-policy": "no-referrer"` → `"same-origin"` en el objeto `headers` y en `forbidden()`. Nada más.
- **`src/pages/taller/ordenes/[id]/informe.astro`**: lo mismo, en `headers` y en `forbidden()`. Nada más.
- **`.claude/rules/server-api.md`**: en la viñeta de "Respuestas con datos personales o sesión", agregar al final: "Una página que chequea `Origin` nunca manda `referrer-policy: no-referrer` (el navegador enviaría `Origin: null` y `isAllowedOrigin` la rechaza): las páginas internas con formulario usan `same-origin`."
- **`tests/integration/approvals.test.ts`**: SOLO las dos aserciones `expect(response.headers.get("referrer-policy")).toBe("no-referrer");` de las líneas 337 y 378 pasan a `"same-origin"` (autorizado por el dueño, decisión F2-D31). Ninguna otra línea de ese archivo ni de otra prueba existente.

## No cambiar

- `isAllowedOrigin`, `allowedOrigins`, `handlers.ts`.
- Las páginas públicas `src/pages/aprobacion/[token].astro`, `src/pages/informe/[token].astro`, `src/pages/seguimiento/[token].astro` y sus pruebas (siguen con `no-referrer`).
- El `rel` de los enlaces de WhatsApp.
- `e2e/global-setup.ts`, `e2e/fixtures.ts`, `playwright.config.ts`.
- Cualquier otra prueba existente. Si una falla, detente y reporta con el diff.

## Pruebas (primero, verlas fallar)

**`tests/unit/origin-referrer-guard.test.ts`** (nuevo, junto a `tests/unit/origin-guard.test.ts`): recorre recursivamente `src/pages/` con `node:fs` (`readdirSync` con `recursive: true` o una función propia) y, para cada archivo `.astro` o `.ts` cuyo texto contiene `isAllowedOrigin`, afirma que no contiene `no-referrer`. Un `it` por archivo afectado es lo más legible (`it.each`). Hoy falla en `adicional.astro` e `informe.astro`.

**`e2e/adicional-informe-origen.spec.ts`** (nuevo; solo `@playwright/test` y `e2e/fixtures.ts`; `.tap()`; no modifica datos sembrados):
- "Crear propuesta llega al servidor": `login(page, "owner", `/taller/ordenes/${SEED.orderRecibidaId}/adicional`)`, llenar `getByLabel("Problema")`, `getByLabel("Recomendación")` (al menos 5 caracteres) y el precio (`getByLabel(/^Precio/)`: la etiqueta es "Precio" o "Precio neto" según el régimen de la orden), tocar `getByRole("button", { name: "Crear propuesta" })`. La orden está "Recibida", que no admite propuestas, así que la respuesta correcta es la página con `getByRole("alert")` = "El estado de la orden no permite proponer un adicional." y el `h1` de la orden. Antes del arreglo, el navegador recibía el JSON 403 y el spec falla: esa es la reproducción. Afirma también que el cuerpo no contiene `"forbidden"`.
- "Generar informe llega al servidor": `login(page, "owner", `/taller/ordenes/${SEED.orderRecibidaId}/informe`)`, tocar `getByRole("button", { name: /Generar informe|Regenerar informe/ })` y esperar `getByRole("alert")` con "El informe se genera cuando la orden está Lista para retirar o Entregada." y que el cuerpo no contenga `"forbidden"`.
Estos specs no se pueden correr en tu sandbox (no hay red ni Postgres): déjalos escritos; Claude los corre.

## Documentación

Decisión F2-D31 en `blueprints/vector-taller-f2/blueprint.md` §20.3 con el texto de arriba. No hace falta tocar el README.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0 (la guardiana nueva pasa tras el arreglo).
2. Claude: `pnpm build && pnpm test:tablet e2e/adicional-informe-origen.spec.ts` en rojo antes del arreglo y en verde después; `pnpm gate` → exit 0.

## Reporte

Lista de archivos tocados, el diff exacto de `tests/integration/approvals.test.ts` (deben ser solo dos líneas), la cola de `pnpm check`, `pnpm test` y `pnpm build`, y cualquier prueba existente que haya fallado y por qué, sin modificarla.
