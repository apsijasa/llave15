# FASE LLAVE15 (antes Bike Garage) — El sistema del taller como producto para muchos talleres

> **Aprobado por el dueño el 17 de noviembre de 2026 (decisión 57), con el dominio `llave15.cl`.** Escrito por la sesión coordinadora ese mismo día; el dueño aprobó §2 completo, incluidas las propuestas de §2.2. Es la **entrada** para `/the-architect:architect-brownfield`, no el blueprint; el bundle se genera en `blueprints/bike-garage/` (§15).
>
> Fuentes: la conversación del 17-11-2026 (tres decisiones del dueño, §2.1); `blueprints/vector-plataforma/FASE-PLATAFORMA.md` en la rama `feat/plataforma` (decisión 56, reemplazada; se reutilizan su mapa de literales §6 y el relajo de CHECK §2.3); `blueprints/vector-taller-f2/FASE2.md` §2.5 y §16; `blueprints/vector-biblioteca/BIBLIOTECA.md` BT-D1 y BT-D8; el mapa de acoplamiento del 17-11-2026 (§6 de este documento).

## Cómo se trabaja esta fase

Mismo reparto que las fases anteriores (`docs/BITACORA.md` §2, `docs/encargos/README.md`): un encargo por paso, Codex implementa con TDD y corre `check`, `test` y `build`; Claude revisa, aplica migraciones en la base dev, corre `pnpm gate` y commitea; el dueño sube y publica. Diferencias:

- **Cinco etapas que se publican por separado** (§3). Cada una deja Vector Bikes operando igual que antes. Vector Bikes es el primer taller de Llave 15.
- Los cambios de esquema van en **ventanas de publicación** con el taller cerrado y respaldo del día, con el patrón expand → migrar datos → contract en publicaciones distintas.
- La **decisión 57** (§13), registrada el 17-11-2026, reemplaza la 56 y enmienda el No negociable 6.
- Desde el primer paso, una **prueba de dos talleres** (§4) vigila que ningún dato cruce de un taller a otro.

## 1. Objetivo y criterio de término

Que **Llave 15** sea un solo sistema, en su propio dominio, donde cada taller de bicicletas entra con sus usuarios y ve solo lo suyo: agenda, reservas en línea, recepción, órdenes, inventario, caja, ventas, informes y avisos al cliente. El sitio de Vector Bikes queda como un sitio informativo aparte, cuyo botón "Reservar" lleva a la página de reservas de Vector Bikes en Llave 15.

**La fase está lista cuando un segundo taller (real o de demostración) opera un mes en Llave 15 junto a Vector Bikes, sin que ninguno vea datos del otro, y vectorbikes.cl sigue funcionando con todos sus enlaces antiguos.**

Escala: de 1 a 20 talleres, una sucursal por taller, Chile.

## 2. Decisiones cerradas

### 2.1 Decididas por el dueño (17-11-2026)

1. **Una sola app para todos los talleres**, en una sola base Postgres, en un dominio propio de Llave 15. Reemplaza la decisión 56 ("una instalación por taller").
2. **La reserva en línea vive dentro de Llave 15.** Cada taller tiene su página pública de reservas. El sitio de Vector Bikes no escribe en la base: enlaza.
3. **Código:** el repositorio actual se convierte en `bike-garage` (conserva todo el historial y las pruebas); el sitio de Vector Bikes sale a un repositorio nuevo y pequeño, `vector-bikes-web`.

### 2.2 Propuestas por la coordinadora (el dueño las confirma o cambia)

4. **El taller es una fila de `shops`;** cada taller tiene una sola fila en `branches` (`branches.shop_id` NOT NULL). Todo el código ya filtra por `branch_id`: se conserva ese filtro y se agrega donde falta. Multi-sucursal sigue en la fase 4.
5. **El perfil y la configuración del taller viven en la base** (`shops`), no en archivos: nombre, contacto, logo, horarios, capacidad, retiro a domicilio, comunas, tarifa, prefijo de código y correo de avisos. `SITE` deja de ser una constante.
6. **Una persona, una cuenta:** `users.email` sigue único en toda la plataforma; cada usuario pertenece a un taller por su sucursal.
7. **Administrador de plataforma:** una marca `users.is_platform_admin` (Andrés), separada de los cuatro roles del taller. Solo ella crea, suspende y configura talleres. Un administrador de plataforma no ve datos de otros talleres por usar la marca: para operar un taller necesita un usuario en ese taller.
8. **Marca:** Llave 15 en todo lo que ve el personal (ingreso, menú, títulos, pie de correos); **la marca del taller** en todo lo que ve su cliente (correos, informe, seguimiento, aprobación, página de reservas), con una línea discreta "Gestionado con Llave 15" al pie.
9. **Dominio: `llave15.cl`** (dueño, 17-11-2026; nombre y dominio cambiados de Bike Garage y `bikegarage.cl` a Llave 15 y `llave15.cl` el 18-11-2026, BG-D31). El sistema del personal vive en `https://llave15.cl/taller`; las páginas públicas de cada taller cuelgan del mismo dominio: `https://llave15.cl/<slug>/reservar`, y los enlaces con token (`/seguimiento`, `/informe`, `/aprobacion`, `/reservas/cancelar`) también. La raíz `https://llave15.cl/` es una portada mínima de Llave 15 con el ingreso. Correo de envío en un subdominio (`send.llave15.cl`). Sin dominio propio por taller en esta fase.
10. **Correos:** remitente del dominio de envío de Llave 15 con el nombre del taller ("Vector Bikes · Llave 15"), `Reply-To` al correo del taller; las copias al taller van al correo de avisos del taller.
11. **Tareas diarias:** las cuatro tareas de `/api/tareas/*` recorren todos los talleres activos en una sola llamada de Make.com.
12. **La biblioteca técnica es de la plataforma:** las tablas globales (BT-D1) se comparten entre talleres; lo privado de cada taller ya lleva `branch_id`. El curador (BT-D2) es un usuario con `is_platform_admin`.
13. **Los CHECK de reservas se relajan** como en FASE-PLATAFORMA §2.3: tarifa de retiro `>= 0`, comuna no vacía; la validación de los valores del taller pasa a zod en el servidor, desde `shops`.

14. **El Replit actual pasa a ser Llave 15** (dueño, 17-11-2026): conserva la base de producción y el almacenamiento de fotos sin mudarlos; se le agrega el dominio `llave15.cl`. El sitio de Vector Bikes se publica en un **Replit nuevo** y pequeño, y `vectorbikes.cl` se apunta a él en el corte.
15. **El sitio nuevo de Vector Bikes se construye en una carpeta de este repositorio** (dueño, 17-11-2026): `web/vector-bikes/`, una app Astro pequeña con la portada, privacidad, el botón "Reservar" hacia `https://llave15.cl/vector-bikes/reservar` y las **redirecciones permanentes** de las rutas antiguas, con sus propias pruebas dentro del gate. En el corte, el dueño la mueve a un repositorio nuevo `vector-bikes-web`.

### 2.3 Lo que queda afuera y por qué

| Tema | Destino | Razón |
|---|---|---|
| Cobro, planes, licencias, facturación a talleres | Fuera | Es negocio; se decide con el segundo taller interesado |
| Alta autoservicio de talleres | Fuera | El administrador de plataforma da de alta a mano |
| Dominio propio por taller (`reservas.mitaller.cl`) | Fase posterior | Certificados y DNS por taller |
| Multi-sucursal | Fase 4 | Un taller = una sucursal; `branches` ya existe |
| Otros países, monedas o impuestos | Fuera | IVA, RUT, feriados y comunas son de Chile |
| App móvil | Fuera | La tablet usa el navegador |
| Mercado Pago integrado, asistente de WhatsApp, Strava | Fase 3 | Igual que hoy |
| Catálogo de servicios compartido entre talleres | Fuera | Cada taller tiene el suyo; se siembra una plantilla al crear el taller |
| Portal de clientes con cuenta | Fuera | Igual que hoy: el cliente usa enlaces con token |

**Esta tabla es la cerca de la fase.**

## 3. Alcance, por etapas

- **Etapa 1 · Cimientos multi-taller, sin cambios visibles.** Tabla `shops` y `branches.shop_id`; `branch_id` en las tablas de reserva (expand, migrar a la sucursal de Vector Bikes, contract); unicidad por taller; motor de reservas que lee la configuración del taller; relajo de los CHECK; filtro por taller en todo lo que hoy lee reservas sin filtrar; prueba de dos talleres; guardia de literales (regla 14).
- **Etapa 2 · Identidad.** `SITE` sale de `shops` por la sesión, el token o el `slug`; se eliminan los literales del taller; marca Llave 15 para el personal y del taller para el cliente; tokens de diseño separados en `tokens.css`; el sistema deja de cargar la portada de Vector Bikes; remitente y copias por taller.
- **Etapa 3 · Reservas en línea por taller.** Página `/<slug>/reservar` con la isla de reserva actual y la marca y configuración del taller; `api/reservas` y `api/disponibilidad` reciben el taller; cancelación por enlace bajo el dominio de Llave 15; Turnstile y límite de solicitudes por taller.
- **Etapa 4 · Separación y nuevo dominio.** `APP_URL` para cookie, CSRF y enlaces; secretos propios del sistema (`TRACKING_TOKEN_SECRET` aparte de `CANCEL_TOKEN_SECRET`); el Replit actual pasa a Llave 15 con `llave15.cl` (decisión 14); el sitio de `web/vector-bikes/` en un Replit nuevo para vectorbikes.cl (decisión 15); redirecciones permanentes de las rutas antiguas; Make.com al nuevo dominio.
- **Etapa 5 · Administración de la plataforma.** Pantallas del administrador de plataforma (crear taller con su primer dueño, suspender, ver uso); pantalla "Mi taller" para el dueño; plantilla de catálogo inicial; `docs/nuevo-taller.md`.

## 4. Principio central

**Ninguna consulta, tarea, correo ni página ve datos de un taller distinto al del usuario, el token o el `slug` que la origina.** Toda tabla de operación lleva `branch_id`; toda consulta filtra por él; la prueba de dos talleres siembra dos talleres con datos parecidos y verifica, pantalla por pantalla y tarea por tarea, que nada cruza.

## 5. Modelo de datos

| Tabla | Cambio |
|---|---|
| `shops` (nueva) | `id`, `slug` único, `name`, `legal_name`, `rut`, `email`, `notify_email`, `phone`, `phone_display`, `street_address`, `locality`, `region`, `maps_url`, `instagram_url`, `logo_key` (almacenamiento), `timezone` (por defecto `America/Santiago`), `reception_hours` y `pickup_hours` (jsonb validado con zod), `daily_capacity`, `block_minutes`, `min_notice_minutes`, `horizon_days`, `pickup_enabled`, `pickup_fee_clp`, `pickup_comunas` (text[]), `code_prefix`, `status` (`activo`/`suspendido`), timestamps |
| `branches` | `shop_id` NOT NULL FK a `shops` (la sucursal actual se enlaza al taller Vector Bikes, sembrado con los valores de hoy) |
| `users` | `is_platform_admin boolean not null default false` |
| `bookings`, `booking_bikes`, `booking_blocks`, `blocked_periods`, `booking_requests`, `whatsapp_messages` | `branch_id` NOT NULL FK (expand nullable → migrar → NOT NULL) |
| `booking_days` | PK pasa de `service_date` a (`branch_id`, `service_date`) |
| Índices únicos | `uq_customers_rut`, `uq_bookings_code`, `uq_booking_blocks_active_slot` incluyen `branch_id`; `uq_branches_name` pasa a ser por taller |
| `bookings` CHECK | `bookings_fee_check` y `bookings_retiro_address_check` relajados (decisión 13) |

Las migraciones destructivas (PK de `booking_days`, CHECK, índices reemplazados) van cada una en su propia ventana, después de la ventana aditiva. `drizzle/` solo por `pnpm db:generate`.

## 6. Integración con lo ya construido (mapa de acoplamiento del 17-11-2026)

| Acoplamiento | Dónde | Pasa a |
|---|---|---|
| Reservas sin taller | `booking/*`, `admin/agenda.ts`, `taller/{manual-booking,orders,booking-reception,dashboard,indicators*}.ts`, `email/reminders.ts`, `whatsapp/*`, FK `work_orders.booking_id` | Todas filtran por `branch_id`; las páginas públicas reciben el taller por `slug` |
| Reglas de reserva literales | `src/server/booking/rules.ts` (más de 40 importadores) | Funciones que reciben la configuración del taller; `TIMEZONE`, `localToday` y `addDays` pasan a `src/lib/time.ts` |
| Comunas, tarifa, horarios y prefijo copiados | `handlers.ts:176-195`, `manual-booking.ts:49,77`, `booking-state.ts:263,339,347`, `BookingFields.tsx:161`, `BookingSchedule.tsx`, `BookingTicket.tsx:21`, `Landing.astro`, `Base.astro:33,43`, `faq.ts:16`, `taller/reservas/nueva.astro:181,228`, `create-booking.ts:38`, CHECK `schema.ts:77,81` | Configuración del taller (`shops`) |
| Identidad fija | `src/lib/site.ts` (44 archivos), unos 42 literales "Vector Bikes" (títulos, `label.ts:43`, `templates.ts:257`, `Base.astro`, `BookingFields.tsx:185,205`, `informe.astro:111`) | Perfil del taller desde `shops`; marca Llave 15 para el personal |
| Dominio y marca en correos e ICS | `notifications.ts:26,43,45`, `Base.astro:130`, `BookingSchedule.tsx:127`, `astro.config.mjs`, `public/robots.txt` | Dominio de Llave 15 y datos del taller |
| Sucursal fija | `admin-auth.ts:93-98` (`createOwner` toma la primera sucursal o crea "Vitacura") | Alta de taller desde la administración de plataforma |
| Origin, cookie y enlaces del sistema atados al sitio | `isAllowedOrigin` (38 archivos), `sessionCookieOptions`, enlaces de seguimiento, informe, aprobación y QR | `APP_URL` |
| Páginas del cliente con el layout del sitio | `aprobacion`, `informe`, `seguimiento`, `reservas/cancelar` sobre `Base.astro` | Layout público de Llave 15 con la marca del taller |
| El sistema hereda la portada | `TallerLayout` → `Base.astro` (fuentes, `global.css`, FAQ, JSON-LD, wordmark `global.css:135,282`) | `tokens.css` compartido y layout raíz del sistema |
| Correos mezclados | `templates.ts` (reserva y orden), `notifications.ts` | `email/booking/*` y `email/garage/*` con el mismo `render` |
| Enlaces del sistema a la portada | `notifyBookingCreated` → `/reservas/cancelar`; `taller/index` → `/#reservar`; `maintenance-plan.ts:217` → `/#reserva` (**ancla incorrecta hoy**: la portada usa `#reservar`) | Página de reservas del taller en Llave 15 |
| Secretos compartidos | `CANCEL_TOKEN_SECRET` (cancelación y seguimiento), `SESSION_SECRET` (sesión y `hashIp`), `TASKS_SECRET` | Secretos propios de Llave 15 |
| Unicidad global | `uq_customers_rut`, `uq_bookings_code`, `uq_booking_blocks_active_slot`, PK `booking_days`, `uq_branches_name` | Por taller (§5) |
| Despliegue único | `.replit`, `astro.config.mjs`, `robots.txt`, sitemap; Replit no permite una segunda publicación en la misma App (README) | Dos Replit Apps: Llave 15 y `vector-bikes-web` |
| Guardia de la regla 14 | No existe, aunque `CLAUDE.md` la da por hecha | Se escribe en la etapa 1 |

Se reutiliza: `branch_id` en todas las tablas de operación; numeración de órdenes, ventas y compras por sucursal; `requireAdmin` y `actor.branchId`; `can(role, action)`; los tokens con hash; la biblioteca global y su paquete (`library:export`/`library:import`); `src/server/booking/holidays.ts` y el skill `add-holidays`; el patrón `vi.mock` de `SITE` en `tests/unit/email-brand.test.ts`.

## 7. Protección de datos personales

Con varios talleres en una base, Llave 15 pasa a ser **encargado del tratamiento** de los datos de los clientes de cada taller (Ley 21.719). Hace falta, antes del segundo taller real: términos con cada taller (responsable, encargado, finalidad, plazo de conservación), una política de privacidad de Llave 15 y la del taller en su página de reservas, y un procedimiento de supresión por taller. El código cumple con el aislamiento de §4, logs sin datos personales (como hoy) y respaldos de la base que cubren a todos los talleres.

## 8. Dispositivos

Igual que hoy: tablet 820×1180 para el taller, escritorio para administración. La página pública de reservas se diseña primero para teléfono, como la portada actual.

## 9. Diseño visual

El diseño monocromo actual es el de Llave 15. El logo del taller aparece en lo que ve su cliente; el de Llave 15, en lo que ve el personal. Ningún color nuevo; los tokens de `global.css` pasan a `tokens.css` sin cambiar valores. El logo de Llave 15 es un pendiente del dueño (§12).

## 10. Tamaño estimado

Entre 35 y 45 pasos: etapa 1 (12 a 14, con tres ventanas de esquema), etapa 2 (8 a 10), etapa 3 (4 a 5), etapa 4 (6 a 8, incluido el repositorio `vector-bikes-web`), etapa 5 (5 a 7).

## 11. Riesgos

| Riesgo | Señal temprana | Mitigación |
|---|---|---|
| Un taller ve datos de otro | Prueba de dos talleres en rojo | `branch_id` obligatorio, filtro en `src/server/**`, prueba por pantalla y por tarea, revisión de seguridad antes de la etapa 4 |
| Migración de reservas en producción | `pnpm db:check` o el smoke fallan en la ventana | Taller cerrado, respaldo del día, expand → migrate → contract en publicaciones separadas |
| Enlaces ya enviados dejan de funcionar | Un cliente reporta un enlace roto | Redirecciones permanentes en vectorbikes.cl (etapa 4) y prueba que recorre las rutas antiguas |
| Regresión visible para Vector Bikes | Una prueba existente cambia su valor esperado | Con el taller Vector Bikes, ninguna prueba existente cambia valores hasta la etapa 2, que lo declara por paso |
| SEO de vectorbikes.cl | Search Console pierde páginas | El sitio nuevo conserva sus URLs y datos estructurados |
| Costo de operación | Dos Replit y dos dominios | Llave 15 escala por taller sin publicaciones nuevas |
| Correos de un taller marcados como spam | Rebotes en Resend | Dominio de envío propio de Llave 15 con SPF, DKIM y DMARC |

## 12. Preguntas para el dueño y pendientes operativos

**Respondidas por el dueño el 17-11-2026:** dominio `llave15.cl` (§2.2 decisión 9); §2.2 aprobado completo, incluida la línea "Gestionado con Llave 15" ante el cliente final (decisión 8); la fase empieza ya, con la etapa 1.

**Pendientes operativos, fuera del código:**
- Dominio `llave15.cl` (del dueño): DNS hacia el nuevo Replit en la etapa 4; logo de Llave 15; dominio de envío `send.llave15.cl` en Resend; widget de Turnstile para `llave15.cl`.
- Términos con cada taller y política de privacidad de Llave 15 (§7).
- Un segundo taller (real o de demostración) para el criterio de término.
- Rotar la clave de la base de producción (pendiente desde antes) antes de la etapa 4.

## 13. Lo que no se negocia al construir

1. Ninguna consulta sin filtro de taller sobre una tabla de operación; la prueba de dos talleres corre en `pnpm gate`.
2. `branch_id` NOT NULL en toda tabla de operación, incluidas las de reserva al cerrar la etapa 1.
3. Ningún dato de un taller en `src/` (la guardia de la regla 14 lo vigila desde la etapa 1).
4. Vector Bikes opera sin interrupciones entre etapas; cada etapa se publica sola.
5. Los enlaces enviados antes de la etapa 4 siguen funcionando después.
6. Esquema solo por `pnpm db:generate`; las migraciones no aditivas van en ventanas propias y se declaran en el paso.
7. Todos los No negociables vigentes de `CLAUDE.md` siguen en pie (stock, caja, costos, tokens, nunca borrar, etc.).

**Decisión de apertura (57)**, registrada el 17-11-2026 en `blueprints/vector-taller-f1/blueprint.md` §20.3 con las tres decisiones del dueño de §2.1; las propuestas de §2.2 se confirman al aprobar este documento: "Llave 15: una sola app multi-taller, separada del sitio de Vector Bikes". Aprueba §2 de este documento. Reemplaza la decisión 56. Enmienda el No negociable 6 de `CLAUDE.md` y `AGENTS.md`: multi-taller se construye desde la decisión 57; multi-sucursal sigue fuera. Levanta, solo para lo descrito en §2.2 y §5, las constantes del blueprint de la fase 1 §1 sobre columnas de `bookings`, correos transaccionales y tokens de `global.css`.

## 14. Criterios de aceptación de la fase

1. Con dos talleres sembrados, ninguna pantalla de `/taller` o `/admin`, tarea de `/api/tareas/*`, correo ni página con token de uno muestra datos del otro (prueba de dos talleres en `pnpm gate`).
2. Las tablas de reserva tienen `branch_id` NOT NULL y los índices únicos son por taller.
3. Un segundo taller con otras comunas, tarifa, horarios y prefijo recibe reservas en `/<slug>/reservar` con sus reglas; Vector Bikes sigue con las suyas.
4. La guardia falla si alguien escribe "Vector Bikes", "Vitacura", "Las Condes", "Kennedy", "vectorbikes" o el teléfono del taller en `src/`.
5. El personal ve Llave 15 en ingreso, menú y títulos; el cliente de cada taller ve la marca de su taller en correos, informe, seguimiento, aprobación y reservas.
6. Llave 15 responde en su dominio con su propia cookie y defensa CSRF; vectorbikes.cl sirve el sitio nuevo.
7. Un enlace de seguimiento, informe, aprobación o cancelación enviado antes de la etapa 4 redirige y funciona después.
8. El administrador de plataforma crea un taller con su primer dueño; ese dueño entra, edita "Mi taller" y no ve nada de Vector Bikes.
9. Las tareas diarias de Make.com procesan todos los talleres activos en una llamada.
10. `pnpm gate` en verde en cada paso.
11. Un segundo taller opera un mes junto a Vector Bikes sin cruces de datos (lo verifica el dueño).

## 15. Cómo generar el blueprint

Requisitos: este documento aprobado y commiteado; las preguntas de §12 respondidas; árbol limpio; respaldos de la base activos. La decisión 57 y la enmienda del No negociable 6 ya están registradas (17-11-2026).

Desde la raíz del repo:

```
/the-architect:architect-brownfield Lee blueprints/bike-garage/FASE-BIKE-GARAGE.md, los blueprints de las fases 1 y 2 (blueprints/vector-taller-f1/blueprint.md y blueprints/vector-taller-f2/blueprint.md, solo lectura) y, como referencia, blueprints/vector-plataforma/FASE-PLATAFORMA.md de la rama feat/plataforma (reemplazado por la decisión 57). Construye el blueprint de esta fase en blueprints/bike-garage/. Pasos BG-NN, tareas E<etapa>-T<n>, tags bg-NN. Las decisiones de la sección 2 están cerradas: no las re-preguntes. La sección 2.3 es la cerca. La sección 14 son los criterios de aceptación. La paridad (§9.1) es: con el taller Vector Bikes sembrado con los valores de hoy, la suite existente pasa sin cambiar valores esperados hasta la etapa 2. Cada paso toca como máximo 5 archivos escritos a mano. Agrupa los cambios de esquema en ventanas expand, migrate y contract separadas.
```

Después, `/the-architect:architect-next` por cada paso, y un encargo por paso en `docs/encargos/BG-NN-*.md`.

## 16. Documentos relacionados

- `blueprints/vector-taller-f1/` y `blueprints/vector-taller-f2/` — fases 1 y 2, registros de solo lectura.
- `blueprints/vector-biblioteca/BIBLIOTECA.md` — la biblioteca global (BT-D1, BT-D8) que comparten los talleres.
- Rama `feat/plataforma`, `blueprints/vector-plataforma/FASE-PLATAFORMA.md` — diseño de "una instalación por taller" (decisión 56), reemplazado; se conserva como referencia.
- `FASE3.md` y `FASE4.md` — sin cambios; multi-sucursal sigue en la fase 4.
