---
description: Handlers HTTP, páginas de servidor, sesión, permisos y chequeos de seguridad
paths:
  - "src/server/api/**"
  - "src/server/auth/**"
  - "src/pages/api/**"
  - "src/pages/admin/**"
  - "src/pages/reservas/**"
  - "src/pages/taller/**"
  - "src/pages/aprobacion/**"
  - "src/pages/informe/**"
  - "src/pages/seguimiento/**"
  - "src/pages/[slug]/**"
  - "src/pages/plataforma/**"
  - "src/server/taller/**"
  - "src/server/storage/**"
---

# API y servidor

- Las páginas y endpoints son envoltorios: parsean, llaman a `src/server/**` y devuelven su resultado. Sin SQL en `src/pages/**`.
- Error siempre `{ error, code, fields? }` con los códigos `validation_error` 422, `turnstile_failed` 403, `slot_unavailable`/`phone_limit` 409, `rate_limited` 429 (`Retry-After`), `shop_not_found` 404, `internal_error` 500.
- Éxito de `POST /api/reservas`: 201 `{ code, service_date, start, end, mode, fee }`, sin envoltorio. `GET /api/disponibilidad`: `{ timezone, modo, capacity, days }`. Esas formas no cambian.
- **Taller en la API pública:** `taller` (slug) en el cuerpo de `POST /api/reservas` y en la consulta de `GET /api/disponibilidad`; `scopeBySlug` → `null` (desconocido, reservado o `suspendido`) → 404 `shop_not_found` sin registrar el intento. Sin `taller`, `singleShopScope` (si lanza, 422 con el campo `taller`).
- Orden en `POST /api/reservas`: taller → rate limit por (`branch_id`, IP) → zod con la configuración del taller → Turnstile (si siteverify devuelve `cdata`, debe ser el slug) → transacción → correos post-commit (un fallo de correo nunca cambia el 201).
- Todo POST de admin, de `/taller` y de `/plataforma` (login, logout, formularios, subida de fotos y logos) llama `isAllowedOrigin(request)` antes de leer el cuerpo. Acepta el origen de `APP_URL` y, durante la convivencia (hasta BG-DC3), el de `PUBLIC_SITE_URL`, cada uno con y sin `www.`.
- El POST de `/reservas/cancelar` **no** chequea `Origin`: el token del correo es la defensa contra CSRF (no es adivinable, vive como HMAC en base, deja de servir al empezar la reserva y al usarse). Registra el origen recibido con `originForLog(request)` para tener visibilidad, nunca para decidir.
- `/aprobacion/[token]`, `/informe/[token]` y `/seguimiento/[token]` siguen la misma regla que la cancelación: el token es la defensa, sin chequeo de `Origin`, con `originForLog`. El perfil del taller sale del token (`profileForShareToken`, `profileForCancelToken`), nunca de la sesión. Tokens de 32 bytes base64url guardados como sha256 hex; solo el primer nombre del cliente; nunca teléfono, correo ni RUT.
- Toda página de `/admin` y `/taller` empieza con `requireAdmin(...)`; si devuelve `null`, 303 a `loginRedirect(ruta)` (`/admin/login?next=…`). Después `can(user.role, acción)`; sin permiso, `forbiddenResponse()` (403). El mecánico recibe 403 en `/admin/**`. Nunca confiar solo en middleware. `/plataforma/**`: `requireAdmin` → `user.isPlatformAdmin` (403 si falta); la marca no abre datos de otro taller.
- El permiso se revisa en el servidor en cada handler, también en los POST. El mecánico que intenta cambiar un precio recibe 403 y no cambia ninguna fila.
- `/api/tareas/*`: `Authorization: Bearer <TASKS_SECRET>` comparado en tiempo constante con `isAuthorizedTask` de `src/server/api/task-handlers.ts`. Sin cabecera, con un valor distinto o sin secreto configurado: 401 `{"ok":false,"error":"unauthorized"}` y log `tasks.unauthorized` sin IP ni datos personales. Cada tarea recorre `activeShopScopes` (talleres `activo`) en una sola llamada y conserva la forma de su respuesta.
- Respuestas con datos personales o sesión: `cache-control: no-store`; páginas admin, taller, plataforma, cancelación, aprobación e informe con `noindex`; aprobación e informe además con `referrer-policy: no-referrer`. Una página que chequea `Origin` nunca manda `referrer-policy: no-referrer` (el navegador enviaría `Origin: null` y `isAllowedOrigin` la rechaza): las páginas internas con formulario usan `same-origin`. `/<slug>/reservar` es indexable y `no-store`.
- Fotos y firmas se sirven solo por `/taller/media/[...key]` (sesión + acceso a la orden, `cache-control: private, max-age=300`) o, las del informe, incrustadas en `/informe/[token]`. El logo del taller es público por `/<slug>/logo` (`cache-control: public, max-age=86400`). El documento de una compra por factura se sirve solo por `/taller/compras/factura/<id>/documento` (sesión y `purchases.manage`, `private, max-age=300`, `inline`, `nosniff`). Nunca una URL pública del almacenamiento.
- Enlaces del sistema (seguimiento, informe, aprobación, cancelación, QR de etiqueta), cookie de sesión (`secure` según el esquema) y CSRF usan `getAppEnv().APP_URL` (sin `APP_URL`, `PUBLIC_SITE_URL`).
- Tokens (cancelación, sesión, aprobación, informe, seguimiento) en base solo como hash; comparar claves con `timingSafeEqual`. El seguimiento usa `TRACKING_TOKEN_SECRET` y reemite el token heredado de `CANCEL_TOKEN_SECRET` cuando la orden ya tiene fila (hasta BG-DC2).
- Logs vía `src/lib/log.ts`; nunca `console.log` de objetos con correo, teléfono, RUT o tokens.
