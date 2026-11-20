BG-34 · `APP_URL` en enlaces, cookie y CSRF (excepción declarada BG-D6)

## Contexto y autorización (Andrés, 17-nov)

Este es el paso 34 de la fase Llave 15 (decisión 57) y el primero de la etapa 4, la separación y el nuevo dominio. El sistema deja de atar cookie, CSRF y enlaces a `PUBLIC_SITE_URL`: la variable nueva `APP_URL` es opcional, y cuando falta se sigue usando `PUBLIC_SITE_URL`, así que sin definirla todo queda como hoy. Durante la convivencia, el CSRF acepta los dos orígenes.

El paso completo, con sus criterios EARS y su Verify, está en `blueprints/bike-garage/blueprint.md` §9, bloque **"BG-34 — `APP_URL` en enlaces, cookie y CSRF (E4-T1)"**, y en `tasks.json` (tarea `E4-T1`). Ese texto manda.

## Lee antes

- `AGENTS.md` y `.claude/rules/server-api.md`.
- El bloque de BG-34 y BG-D6 en §20.3.
- `src/lib/env.ts` (`getSiteEnv`, `parseSource`, `EnvError`).
- `src/server/api/handlers.ts` (`allowedOrigins`, `isAllowedOrigin`).
- `src/server/auth/admin-auth.ts` (`sessionCookieOptions`).
- `tests/unit/origin-guard.test.ts`, `tests/integration/cancel-flow.test.ts`, `tests/integration/admin-login-next.test.ts` y `.env.example`.
- Cada uno de los 13 archivos de llamadas mecánicas del bloque.

## Rama y reparto

Rama `feat/bike-garage`, tag `bg-33`. Tu sandbox no tiene red ni Postgres.

- Tú: cierre con `pnpm format && pnpm check && pnpm test && pnpm build`. Sin commits.
- Claude: corre el Verify completo, `pnpm gate` y el Checkpoint con el tag `bg-34`.

## Qué hacer

1. `src/lib/env.ts`: agrega `getAppEnv(source = process.env)`, que devuelve `{ APP_URL: string }`.
   - `APP_URL` es `z.url()` opcional.
   - Si viene vacío o falta, vale `getSiteEnv(source).PUBLIC_SITE_URL`.
   - `getSiteEnv` no cambia.
2. `src/server/api/handlers.ts`: cambia la firma a `isAllowedOrigin(request, appUrl?, legacyUrl?)`.
   - **Sin argumentos de URL:** acepta los orígenes de `getAppEnv().APP_URL` y de `getSiteEnv().PUBLIC_SITE_URL`, cada uno con y sin `www.`.
   - **Con `appUrl` explícito y sin `legacyUrl`:** acepta solo `appUrl`, como hoy acepta solo `siteUrl`. Así las pruebas existentes que pasan una URL no cambian.
   - **Con los dos:** acepta los dos.
   - `Origin` ausente, `null` o inválido → `false`.
   - Este archivo conserva `getSiteEnv(` (lo usa la convivencia).
3. Llamadas mecánicas: cambia `getSiteEnv().PUBLIC_SITE_URL` por `getAppEnv().APP_URL` en los 13 archivos del bloque, una línea cada uno, y ajusta el import.
   - En `src/server/email/notifications.ts` hay dos usos (líneas ~48 y ~170): cambia los dos.
   - Al terminar, `getSiteEnv(` solo queda en `src/lib/env.ts` y `src/server/api/handlers.ts`.
4. `.env.example`: agrega una línea `APP_URL=` junto a `PUBLIC_SITE_URL`, con un comentario en español: dominio del sistema (`https://llave15.cl`); si queda vacío, se usa `PUBLIC_SITE_URL`.
5. `tests/integration/app-url.test.ts` (nuevo, escríbelo primero y confirma que falla). Cubre los seis criterios del bloque:
   - `getAppEnv` con y sin `APP_URL`.
   - `isAllowedOrigin` con los dos orígenes, con y sin `www.`, y el rechazo de otro origen y de `null`.
   - Los enlaces armados con `APP_URL`: los de seguimiento, informe, aprobación y cancelación, más el QR de la etiqueta. Prueba al menos uno o dos de los armadores reales pasándoles `APP_URL` por su entorno o por sus `deps`.
   - `sessionCookieOptions("https://…").secure === true`.
   - La búsqueda de `getSiteEnv(`.
   - La línea `APP_URL=` de `.env.example`.

**Ningún valor esperado cambia:** sin `APP_URL`, todo se comporta igual. `node scripts/bg-expect-parity.ts` (sin flags) sale 0.

## No cambiar

- Las firmas exportadas, salvo `isAllowedOrigin`, que agrega un tercer parámetro opcional.
- Ninguna prueba existente.
- `tests/helpers/**`, `e2e/`, `drizzle/`, `package.json`, el lockfile, el diseño y los textos.
- La regla 14: ningún literal de un taller en `src/`.
- No leas ni escribas archivos de entorno reales; `.env.example` es la única excepción.

## Verificación

1. Codex: `pnpm format && pnpm check && pnpm test && pnpm build` → exit 0. Además:
   - `pnpm test tests/integration/app-url.test.ts tests/unit/origin-guard.test.ts tests/integration/admin-login-next.test.ts tests/integration/label.test.ts` → 0.
   - La línea `grep` del Verify → 0.
   - La paridad → 0.
2. Claude: el Verify completo del bloque BG-34 y `pnpm gate` → exit 0.

## Reporte

- Los archivos tocados, con sus líneas.
- La firma final de `getAppEnv` y de `isAllowedOrigin`.
- La cola de `pnpm check`, `pnpm test` y `pnpm build`.
- Cualquier prueba existente que haya fallado y por qué.
