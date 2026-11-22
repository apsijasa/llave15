# Corte del dominio: Llave 15 en `llave15.cl`, Vector Bikes en su sitio propio

Plan operativo de las fases C5 a C8 de `blueprints/bike-garage/blueprint.md` §9.1. Las fases C1 a C4 son las ventanas de esquema y las publicaciones de las etapas 1 a 3 (`docs/ventanas/bg-v1.md`, `bg-v2.md`, `bg-v3.md`). Lo publica el dueño; ningún paso de este documento lo corre Claude ni Codex.

De guardia en todo el corte: **Andrés**.

## Resumen

| Fase | Qué pasa | Quién lo nota | Cómo se vuelve atrás |
|---|---|---|---|
| C5 | Llave 15 se publica con `llave15.cl` agregado y los secretos nuevos | Los enlaces nuevos de correos y etiquetas | Quitar `APP_URL` de Secrets y republicar `bg-33` |
| C6 | El sitio de `web/vector-bikes/` se publica en un Replit nuevo (`*.replit.app`) | Nadie todavía | Despublicar el Replit nuevo |
| C7 | El DNS de `vectorbikes.cl` apunta al Replit nuevo | Clientes y enlaces antiguos, que redirigen a `llave15.cl` | Volver el DNS al Replit actual |
| C8 | Decomisiones `BG-DC1` a `BG-DC4` | Nadie | Un commit revertible por cada una |

## Precondiciones

Antes de C5, todo esto tiene que estar hecho y verificado:

- [ ] **Clave de la base de producción rotada.** Es el pendiente de la fase Biblioteca. La nueva va en Secrets del Replit actual como `DATABASE_URL`, y la anterior se revoca.
- [ ] **`send.llave15.cl` verificado en Resend** con SPF, DKIM y DMARC en verde. Después se envía un correo de prueba a una casilla propia y se revisa que no llegue a spam.
- [ ] **Widget de Turnstile para `llave15.cl`**, con el dominio agregado en Cloudflare. Su clave pública va en `PUBLIC_TURNSTILE_SITE_KEY` y la secreta en `TURNSTILE_SECRET_KEY`. El widget actual sigue aceptando `vectorbikes.cl` hasta C7.
- [ ] **`llave15.cl` agregado como dominio del Replit actual**, con el TLS de Replit activo: `https://llave15.cl/api/health` responde `{"ok":true,"db":true}`.
- [ ] **Secretos nuevos generados**, de al menos 32 caracteres cada uno:
  - `TRACKING_TOKEN_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
  - Todavía no se cargan.
- [ ] **Respaldo del día** de la base de producción.
- [ ] **`pnpm gate` en verde en el tag `bg-40`**, incluido `pnpm test:web`.
- [ ] **Términos con cada taller y aviso de privacidad de Llave 15** revisados (FASE §7). Es requisito antes del segundo taller real, no del corte de Vector Bikes.

## Secuencia de corte

### C5 — Llave 15 publicado con `llave15.cl`

1. En Secrets del Replit actual, agrega o cambia estos valores:
   - `APP_URL=https://llave15.cl`
   - `TRACKING_TOKEN_SECRET=<el generado>`
   - `EMAIL_FROM=<remitente en send.llave15.cl>`, por ejemplo `reservas@send.llave15.cl`.
   - `PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` del widget nuevo.
   - `PUBLIC_SITE_URL` queda en `https://vectorbikes.cl`: mientras dure la convivencia, el CSRF acepta los dos orígenes.
2. Publica desde `main` con el tag `bg-40` (o el último `bg-4x` en verde). Republish.
3. Verifica cada punto:
   - `curl -s https://llave15.cl/api/health` devuelve `{"ok":true,"db":true}`.
   - Ingresa en `https://llave15.cl/admin/login`. El personal vuelve a iniciar sesión, porque la cookie es de host.
   - Una orden de prueba: su enlace de seguimiento y el QR de la etiqueta empiezan con `https://llave15.cl/`.
   - Un enlace de seguimiento enviado antes de C5 sigue abriendo: es el token heredado de `CANCEL_TOKEN_SECRET`.
   - Una reserva de prueba en `https://llave15.cl/vector-bikes/reservar` y su cancelación desde el correo.
   - `pnpm bg:check` contra producción, desde el Shell del Replit, sale 0.

### C6 — Sitio de Vector Bikes en un Replit nuevo

1. Crea un Replit nuevo para el sitio. Hasta `BG-DC4`, publícalo desde un clon de este repositorio con `web/vector-bikes/` como raíz. Desde `BG-DC4`, publícalo desde el repositorio `vector-bikes-web`.
2. Mientras el sitio viva en este repositorio, configura el build con `corepack pnpm@12.4.2 install --frozen-lockfile && corepack pnpm@12.4.2 exec astro build --root web/vector-bikes` y el arranque con `HOST=0.0.0.0 PORT=4321 node web/vector-bikes/dist/server/entry.mjs`. Desde `BG-DC4`, en `vector-bikes-web`, son `corepack pnpm@12.4.2 build` y `HOST=0.0.0.0 PORT=4321 node dist/server/entry.mjs`. Agrega `PUBLIC_WHATSAPP_NUMBER` si el botón debe aparecer. El sitio no usa base de datos ni otros secretos.
3. Publica y anota la URL `*.replit.app`.
4. Verifica, cada día durante el período sombra (al menos 7 días):

   ```bash
   node web/vector-bikes/scripts/check-redirects.ts https://<sitio>.replit.app
   ```

   Debe salir 0. Además, abre `/` y `/privacidad` y compáralas con la portada de hoy: textos, FAQ y botón `Reservar` a `https://llave15.cl/vector-bikes/reservar`.

### C7 — DNS de `vectorbikes.cl` al Replit nuevo

1. Avisa al taller: el cambio no corta las reservas, pero conviene hacerlo fuera del horario de recepción.
2. Saca `vectorbikes.cl` y `www.vectorbikes.cl` del Replit actual y agrégalos al Replit nuevo. Actualiza en el proveedor de DNS los registros que Replit indique.
3. Cuando propague el DNS y el TLS esté activo, verifica:

   ```bash
   node web/vector-bikes/scripts/check-redirects.ts https://vectorbikes.cl
   ```

   Debe salir 0, con las rutas `/taller`, `/admin`, `/seguimiento`, `/informe`, `/aprobacion` y `/reservas/cancelar` en 301 a `https://llave15.cl` con la misma ruta y consulta.
4. Abre un enlace de seguimiento antiguo (`https://vectorbikes.cl/seguimiento/<token>`) y una etiqueta QR impresa: los dos deben llegar a `llave15.cl` y abrir.
5. En Make.com, apunta las tareas (`/api/tareas/*` y el cron de WhatsApp) a `https://llave15.cl`. El secreto `TASKS_SECRET` no cambia. Corre cada tarea una vez a mano y comprueba `ok: true`.
6. Corre `pnpm bg:check` contra producción: debe salir 0.

### C8 — Decomisiones

Cada una se ejecuta como encargo propio (`docs/encargos/BG-DCn-*.md`) cuando se cumple su precondición, y cada una es un commit revertible con `pnpm gate` en verde.

## Criterios de aborto

Se evalúan durante la primera semana después de C5 y de C7. De guardia: **Andrés**.

| Señal | Umbral | Acción |
|---|---|---|
| `pnpm bg:check` contra producción sale 1 (cruce de sucursal) | 1 | Detener la publicación siguiente. Si el cruce es de datos, restaurar el respaldo del día. Reportar. |
| Respuestas 5xx en Replit en las 24 horas siguientes a una publicación | más de 5 en una hora, o una sola 500 de `/api/reservas` | Republicar el deployment anterior. |
| Vector Bikes sin ninguna reserva web | 3 días hábiles seguidos después de C5 o C7 | Correr `node web/vector-bikes/scripts/check-redirects.ts https://vectorbikes.cl` y una reserva de prueba. Si falla, volver al deployment anterior. |
| `pnpm test isolation` falla en algún paso | 1 prueba | No publicar ese paso. |
| `check-redirects.ts https://vectorbikes.cl` sale distinto de 0 después de C7 | 1 ruta | Volver el DNS al Replit actual. |
| Rebotes en Resend después de cambiar `EMAIL_FROM` | más de 5 % en un día | Volver `EMAIL_FROM` al dominio anterior. |

## Reversión

| Fase | Cómo se vuelve atrás | Qué se pierde |
|---|---|---|
| C5 | Quitar `APP_URL` y `TRACKING_TOKEN_SECRET` de Secrets y republicar `bg-33`. Los enlaces vuelven a `PUBLIC_SITE_URL`. | Nada. Los enlaces emitidos con `llave15.cl` siguen sirviendo mientras el dominio esté agregado. Los tokens de seguimiento emitidos con el secreto nuevo dejan de abrir si se quita `TRACKING_TOKEN_SECRET`, así que conviene dejarlo cargado. |
| C6 | Despublicar el Replit nuevo. | Nada: todavía no recibe tráfico. |
| C7 | Volver `vectorbikes.cl` al Replit actual, que sigue sirviendo la portada heredada y todas las rutas antiguas. Make.com puede quedar en `llave15.cl`. | Nada. |
| C8 | Revertir el commit de la decomisión y republicar. | Nada. |

Ningún paso del corte cambia el esquema: la última ventana de esquema fue V-BG3 (C3).

## Decomisión

Cada tarea se ejecuta cuando se cumple su precondición. El detalle está en `blueprints/bike-garage/blueprint.md` §9.1.

- **`BG-DC1` — Retirar el sitio heredado del sistema.**
  - Precondición: C7 hecho y 7 días con `node web/vector-bikes/scripts/check-redirects.ts https://vectorbikes.cl` en 0.
  - Resultado: `/` muestra solo la landing de Llave 15 (desde el 21-11-2026 ya la muestra en `llave15.cl` por dominio, BG-D52), se borra `isPlatformHost` y `src/` deja de importar `web/vector-bikes`.
- **`BG-DC2` — Retirar el secreto heredado del seguimiento.**
  - Precondición: ninguna orden no terminada conserva un token derivado de `CANCEL_TOKEN_SECRET`, y pasaron 30 días desde la última.
  - Resultado: el seguimiento se firma solo con `TRACKING_TOKEN_SECRET`.
- **`BG-DC3` — Fin de la convivencia de dominios.**
  - Precondición: 30 días desde C7.
  - Resultado: un POST con `Origin` de `vectorbikes.cl` recibe 403 y `APP_URL` pasa a ser obligatoria. `SHOP_NOTIFY_EMAIL` y `EMAIL_REPLY_TO` salen del entorno.
- **`BG-DC4` — Sacar el sitio a `vector-bikes-web`.**
  - Precondición: C7 hecho.
  - Resultado: el dueño crea el repositorio con el contenido de `web/vector-bikes/` y lo conecta al Replit nuevo.
  - En este repositorio se borran `web/vector-bikes/` y `test:web`, y `pnpm gate` sale 0 sin ese tramo.
