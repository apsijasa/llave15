# FASE PLATAFORMA — Un taller por instalación

> **Aprobado por el dueño el 13 de noviembre de 2026 (decisión 56), con la plataforma antes que la construcción de la fase 2.** Escrito por la sesión coordinadora a pedido del dueño ("¿qué hay que cambiar para que otros talleres ocupen el programa?"). Es la **entrada** para `/the-architect:architect-brownfield`, no el blueprint; el bundle se genera en `blueprints/vector-plataforma/` (§15).
>
> Fuentes: diagnóstico de acoplamiento del 13-11-2026 (resumido en §5 y §6); `blueprints/vector-taller-f1/FASE1.md` §2.1 decisión 4 y §2.4; `blueprints/vector-taller-f1/blueprint.md` §1 (No-Objetivos y constantes), §5 (Interfaces held constant) y §20.3; `blueprints/vector-taller-f2/FASE2.md` §2.5; `docs/encargos/README.md`.

## Cómo se trabaja esta fase

Mismo reparto que la fase 1, la etapa A y la fase 2 (`docs/BITACORA.md` §2, `docs/encargos/README.md`): un encargo por tarea de `tasks.json`, Codex implementa con TDD, Claude revisa, corre `pnpm gate` y commitea, el dueño sube y publica. Diferencias:

- **La prueba de que nada se rompe es la suite que ya existe.** Con el perfil por defecto (`vector-bikes`) ninguna prueba existente se modifica en sus valores. Si un paso necesita cambiar la firma de una función que una prueba llama, el encargo cita la autorización de §13.
- **Un segundo perfil (`demo`) existe desde el primer paso** y prueba, con valores distintos en todo, que ningún dato de Vector Bikes quedó escrito en `src/`.
- Rama `feat/plataforma`, en un worktree propio mientras otra sesión trabaja la fase 2 en `main`.

## 1. Objetivo y criterio de término

Que el mismo código sirva a otro taller de bicicletas de Chile cambiando **una carpeta de perfil y los secretos del despliegue**, sin tocar `src/`, y que Vector Bikes siga funcionando byte a byte igual.

**La fase está lista cuando un segundo taller (real o el piloto `demo`) opera reservas y recepción en su propia instalación** con su nombre, su dirección, sus horarios, sus comunas y su logo, y Vector Bikes no notó el cambio.

Escala: una instalación por taller, una sucursal por instalación, del orden de 1 a 10 talleres.

## 2. Decisiones cerradas

Tomadas por el dueño el 13-11-2026 al pedir este plan.

### 2.1 Modelo

1. **Una instalación por taller.** Cada taller tiene su Replit, su Postgres, su almacenamiento y sus secretos. No hay datos de dos talleres en la misma base. No es multi-tenant.
2. **Una sucursal por instalación.** La tabla `branches` sigue con una fila; `actor.branchId` sigue filtrando como hoy. Multi-sucursal sigue en la fase 4.
3. **Un solo repositorio y una sola rama principal.** Los talleres difieren solo en su carpeta `shops/<slug>/` y en sus secretos. Nada de forks por taller.
4. **Solo Chile.** Zona horaria `America/Santiago`, pesos chilenos, teléfonos móviles `+56 9`, RUT, feriados nacionales de `src/data/feriados-cl.json`, boleta y factura del SII. Todo eso queda compartido.
5. **Catálogos compartidos.** Tipos de bicicleta, canales de descubrimiento, estados, transiciones y checklists de recepción y control de calidad siguen en `src/server/taller/rules.ts` y en los CHECK de la base. Servicios y precios ya son por sucursal y se cargan desde `/taller/catalogo`.

### 2.2 Perfil del taller

6. **El perfil vive en archivos del repositorio:** `shops/<slug>/shop.json` y `shops/<slug>/public/`. Se elige con la variable `SHOP_SLUG`, por defecto `vector-bikes`, leída solo por un accesor nuevo en `src/lib/env.ts`.
7. `shop.json` contiene: nombre, razón social y RUT (para la política de privacidad), dominio, correo, teléfono, Instagram, dirección (calle, comuna, región), enlace a Maps, nombre de la sucursal, prefijo del código de reserva (`VB`), comunas de retiro, tarifa de retiro, horarios de recepción y de retiro por día, capacidad diaria, minutos por bloque, anticipación mínima, horizonte, máximo de bicis por reserva, FAQ, frases de la portada y certificaciones.
8. `shops/<slug>/public/` es la carpeta pública de Astro de ese taller (`publicDir` en `astro.config.mjs`, elegida por `SHOP_SLUG`): `brand/` con logo, wordmark y favicons, `favicon.svg` y `robots.txt` con el sitemap de su dominio. El `public/` de hoy se mueve tal cual a `shops/vector-bikes/public/`, así que rutas y bytes no cambian. Nada se genera ni se copia en el build. Cada instalación hace su propio build con su `SHOP_SLUG`, como ya pasa con las variables `PUBLIC_*`, porque la portada, la privacidad y la 404 se prerenderizan. *Refinado el 13-11-2026 al preparar el blueprint: reemplaza el script de copia del borrador.*
9. El perfil se valida con zod al cargar. Un perfil inválido o ausente detiene el arranque con un `EnvError` que nombra el campo.
10. **Las constantes existentes se conservan con el mismo nombre y tipo**, ahora derivadas del perfil: `SITE` en `src/lib/site.ts`; `DAILY_CAPACITY`, `BLOCK_MINUTES`, `MIN_NOTICE_MINUTES`, `HORIZON_DAYS`, `PICKUP_FEE_CLP`, `PICKUP_COMUNAS`, `RECEPTION_HOURS`, `PICKUP_HOURS`, `MAX_BIKES_PER_BOOKING` en `src/server/booking/rules.ts`. `TIMEZONE` sigue fijo.
11. Editar el perfil es un cambio revisado en git (un PR por taller). Una pantalla para que el dueño de otro taller edite su perfil queda fuera (§2.4).

### 2.3 Lo que cambia en interfaces que hoy son constantes

12. **Los CHECK de `bookings` se relajan solo en el valor del taller:** `bookings_fee_check` conserva tarifa cero en taller y pasa a `pickup_fee_clp >= 0` en retiro (hoy `= 15000`); `bookings_retiro_address_check` conserva la dirección obligatoria en retiro y cambia la lista fija de comunas por "comuna no vacía". La validación de valores pasa a zod, desde el perfil, en `handlers.ts` y `manual-booking.ts`. Migración generada con `pnpm db:generate`; no es aditiva y es la única excepción de esquema de la fase.
13. **La isla de reserva recibe del servidor** comunas, tarifa, horizonte, minutos por bloque, prefijo del código y dirección, como props desde `Landing.astro`. `GET /api/disponibilidad` y `POST /api/reservas` no cambian de forma.
14. **El wordmark** lee su imagen de una propiedad CSS (`--wordmark-url`) que define `Base.astro`; los demás tokens de `global.css` no cambian.
15. **Correos:** asuntos, cuerpos e ICS toman nombre, dominio y dirección de `SITE`. Con el perfil `vector-bikes` el texto resultante es idéntico al de hoy.

### 2.4 Lo que queda afuera y por qué

| Tema | Destino | Razón |
|---|---|---|
| Multi-tenant (varios talleres en una base) | Fuera de esta fase | Decisión 1. Se revisa con más de 10 talleres o si operar instalaciones separadas se vuelve caro. |
| Multi-sucursal | Fase 4 | Sin cambio respecto de FASE1 y FASE2. |
| Otros países (moneda, zona, teléfono, feriados, documentos tributarios) | Fuera | Decisión 4. |
| Catálogos editables por taller (tipos de bici, checklists, canales) | Fuera | Decisión 5. Viven en CHECK de la base; hacerlos editables es una fase propia. |
| Pantalla para editar el perfil | Fuera | Decisión 11. |
| Alta autoservicio de talleres, cobro o licencias, panel de administración de talleres | Fuera | Es negocio, no código. Se decide cuando haya un segundo taller interesado. |
| Correo con dominio propio por taller más allá de `EMAIL_FROM` y Resend | Pendiente operativo | Cada taller verifica su dominio en Resend (§12). |
| Plantillas de WhatsApp por taller | Pendiente operativo | Cada taller con su número de Meta, opcional como hoy. |
| Cambiar textos de producto de la portada más allá de frases y FAQ | Fuera | La estructura de la portada es el diseño aprobado. |

**Esta tabla es la cerca del alcance de esta fase.** Lo que está aquí no se construye aunque sea fácil. La cerca de la fase 2 (`FASE2.md` §2.5) sigue vigente para todo lo demás.

## 3. Alcance

- **3.1 Perfil y cargador:** esquema, cargador, accesor de entorno, perfiles `vector-bikes` (los valores de hoy, exactos) y `demo` (todo distinto).
- **3.2 Constantes derivadas:** `SITE` y reglas de reserva desde el perfil; nombre de la sucursal del primer arranque (`admin-auth.ts`, hoy "Vitacura") y prefijo del código de reserva (`create-booking.ts`, hoy `VB-`) desde el perfil.
- **3.3 Validación del servidor y base:** comunas y tarifa desde el perfil en `handlers.ts` y `manual-booking.ts`; mensajes de error construidos desde la lista; CHECK relajados (decisión 12); opciones de comuna en `/taller/reservas/nueva`.
- **3.4 Isla de reserva:** props desde `Landing.astro`; fuera las copias locales de zona, tarifa, comunas, bloque y `dias=14` en `BookingIsland.tsx`, `booking-state.ts`, `BookingFields.tsx`, `BookingSchedule.tsx`.
- **3.5 Portada, layout y SEO:** JSON-LD y horarios de `Base.astro` desde las reglas; `og:site_name`, `aria-label` del wordmark, pie; prosa y tabla de horarios de `Landing.astro`; `faq.ts` desde el perfil; política de privacidad con razón social y RUT.
- **3.6 Títulos y textos de páginas:** el sufijo "— Vector Bikes" de unos 44 `title` y la cabecera de `TallerLayout` pasan a `SITE.name`.
- **3.7 Correos, ICS, WhatsApp y etiqueta:** recordatorio, resumen de mantenciones, nombre e `uid` del ICS, `productId`, los tres mensajes prellenados de la orden, el `title` de la etiqueta.
- **3.8 Activos y archivos estáticos:** `public/` pasa a `shops/vector-bikes/public/` sin cambios; `publicDir` por perfil en `astro.config.mjs`; `robots.txt` y `favicon.svg` por taller; el perfil `demo` con sus propios activos; sin fallback a `vectorbikes.cl` en `astro.config.mjs`.
- **3.9 Guardia:** una prueba que recorre `src/` y falla si encuentra datos de Vector Bikes; build del perfil `demo` en una carpeta aparte y smoke sobre ella, dentro de `pnpm gate`, sin pisar el `dist/` de Vector Bikes.
- **3.10 Puesta en marcha:** `pnpm shop:check` (perfil, activos y variables completos), `docs/nuevo-taller.md` (paso a paso de una instalación), `.env.example` con `SHOP_SLUG`, `README.md` y la tabla "Dónde vive cada cosa" de `CLAUDE.md`.
- **3.11 Piloto:** una instalación `demo` en un segundo Replit, operada de punta a punta.

## 4. Principio central

**Ningún dato de un taller vive en `src/`.** Todo lo que distingue a un taller de otro está en `shops/<slug>/` o en sus secretos, y una prueba lo vigila.

## 5. Modelo de datos

Una sola migración, la de la decisión 12:

| Tabla | Cambio | Regla nueva |
|---|---|---|
| `bookings` | `bookings_fee_check`, hoy `(mode = 'taller' and pickup_fee_clp = 0) or (mode = 'retiro' and pickup_fee_clp = 15000)` | `(mode = 'taller' and pickup_fee_clp = 0) or (mode = 'retiro' and pickup_fee_clp >= 0)` |
| `bookings` | `bookings_retiro_address_check`, hoy `mode = 'taller' or (comuna in ('Vitacura', 'Las Condes') and address is not null)` | `mode = 'taller' or (length(trim(comuna)) > 0 and address is not null)` |

Ninguna tabla nueva. `branches` no gana columnas: el perfil vive en archivos (decisión 6).

## 6. Integración con lo ya construido

Acoplamiento encontrado el 13-11-2026 y dónde termina:

| Hoy | Dónde | Pasa a |
|---|---|---|
| `SITE` literal | `src/lib/site.ts` (usado por `Base.astro`, `Landing.astro`, `ReportView.astro`, `informe`, `privacidad`, `cancelar`, `seguimiento`, `templates.ts`, `order-templates.ts`, `notifications.ts`) | Derivado del perfil; mismos campos más razón social y RUT |
| Reglas de reserva literales | `src/server/booking/rules.ts` (más de 40 importadores) | Derivadas del perfil; mismos nombres |
| Comunas copiadas | `handlers.ts:176`, `manual-booking.ts:49,77`, `booking-state.ts:263`, `BookingFields.tsx:161`, `taller/reservas/nueva.astro:228`, `faq.ts:16`, `Base.astro:33`, `Landing.astro:166`, `BookingSchedule.tsx:53`, CHECK `schema.ts:81` | `PICKUP_COMUNAS` |
| Tarifa copiada | `booking-state.ts:347`, `Landing.astro:46,153`, `BookingSchedule.tsx`, `taller/reservas/nueva.astro:181`, `faq.ts`, CHECK `schema.ts:77` | `PICKUP_FEE_CLP` |
| Horarios copiados | `Landing.astro:28,127,190`, `Base.astro:43` | `RECEPTION_HOURS`, `PICKUP_HOURS` |
| Sucursal "Vitacura" | `admin-auth.ts:97` | Nombre de sucursal del perfil |
| Prefijo `VB-` | `create-booking.ts:38`, `booking-state.ts:339`, `BookingTicket.tsx:21` | Prefijo del perfil |
| "— Vector Bikes" en títulos | unas 44 páginas, `TallerLayout.astro:50`, `label.ts:43` | `SITE.name` |
| Marca en correos e ICS | `templates.ts:252`, `maintenance.ts:77`, `notifications.ts:26,43,45` | `SITE` |
| Mensajes de WhatsApp prellenados | `ordenes/[id]/index.astro:216`, `adicional.astro:104`, `informe.astro:111` | `SITE.name` |
| Consentimiento con el nombre | `BookingFields.tsx:185,205` | Prop desde `Landing.astro` |
| Logo como sprite | `global.css:131,279`, `Base.astro:23` | Wordmark recortado del perfil, `--wordmark-url` |
| Archivos estáticos | `public/robots.txt`, `public/favicon.svg`, `public/brand/*`, `astro.config.mjs` | `shops/<slug>/public/` vía `publicDir`; sin fallback de dominio |

Lo que no cambia y se reutiliza: `whatsappHref` y `PUBLIC_WHATSAPP_NUMBER` (ya por entorno); `formatClp`; `normalizePhone`; `src/lib/rut.ts`; `src/server/booking/holidays.ts` y el skill `add-holidays`; `requireAdmin` y `actor.branchId`; `EnvError` y `parseSource` de `src/lib/env.ts`; el patrón `vi.mock` de `SITE` en `tests/unit/email-brand.test.ts`.

## 7. Protección de datos personales

Cada taller es responsable de los datos de sus clientes bajo la Ley 21.719: su política de privacidad nombra su razón social, su RUT y su correo, desde el perfil. Ninguna instalación ve datos de otra (bases separadas). `shops/` solo guarda datos públicos de contacto del taller; nunca secretos ni datos de clientes. El repositorio es público.

## 8. Dispositivos

Sin cambios de pantallas. Las pruebas de tablet de hoy corren con el perfil `vector-bikes`; el piloto (§3.11) repite recepción y cierre en la tablet con el perfil `demo`.

## 9. Diseño visual

Sin hex nuevos ni reglas nuevas en `global.css` salvo la propiedad del wordmark (decisión 14). Capturas antes y después, 820×1180 y 1280×800, claro y oscuro, de portada, reserva, `/taller` y un correo, con ambos perfiles. Con `vector-bikes` deben ser idénticas a las de hoy.

## 10. Tamaño estimado

11 a 13 pasos: perfil y cargador (1); constantes derivadas (1); validación y CHECK (1, con la migración); isla (1); portada y SEO (1); títulos (2, por cantidad de archivos); correos y mensajes (1); activos (1); guardia (1); puesta en marcha (1); piloto (1, sin código). Una ventana de publicación con esquema, la de la decisión 12.

## 11. Riesgos

| Riesgo | Señal temprana | Mitigación |
|---|---|---|
| Regresión visible en Vector Bikes | Una prueba de `tests/build/` cambia | Ninguna prueba existente cambia sus valores; capturas idénticas |
| El wordmark de otro logo se ve mal | Capturas del perfil `demo` | El perfil exige un wordmark recortado; el blueprint fija sus proporciones |
| Relajar los CHECK permite basura | Reserva con comuna fuera de la lista | La lista se valida en zod en el servidor; prueba de integración con comuna inválida |
| Choque con la fase 2 | Conflictos de merge en páginas y correos | Orden en serie (§13); la guardia de §3.9 obliga a la fase 2 a no escribir el nombre |
| Instalaciones que divergen | Un taller pide un cambio solo para él | Todo cambio de comportamiento pasa por el perfil o se rechaza |
| `SHOP_SLUG` mal puesto en producción | Vector Bikes aparece como `demo` | `pnpm smoke` comprueba el nombre del perfil esperado; el valor por defecto es `vector-bikes` |

## 12. Pendientes operativos, fuera del diseño

1. Un segundo taller interesado, o la decisión de hacer el piloto solo con `demo`.
2. Por cada taller nuevo: dominio, verificación en Resend, widget de Turnstile para su dominio, Replit con Postgres y App Storage, escenario de Make.com con sus cuatro tareas diarias, y su catálogo inicial cargado a mano.
3. Logo y wordmark recortado de cada taller.
4. Términos con cada taller: quién paga el despliegue, quién es responsable de los datos, soporte. Fuera del sistema.

## 13. Lo que no se negocia al construir

1. Con `SHOP_SLUG=vector-bikes`, ninguna prueba existente cambia sus valores esperados; `pnpm gate` en verde en cada paso.
2. Ningún dato de un taller en `src/`; la prueba de §3.9 lo vigila desde que existe.
3. `process.env` solo en `src/lib/env.ts`.
4. Esquema solo por `pnpm db:generate`; la única migración no aditiva es la de la decisión 12.
5. `pnpm db:migrate` solo contra la base dev.
6. Archivos < 400 líneas, funciones < 50; ninguna isla nueva; ningún hex nuevo.
7. No se toca la fase 2 en curso: esta fase no agrega ni cambia nada de inventario, caja ni ventas.
8. Ningún secreto en `shops/`.

**Decisión de apertura** (el dueño la registra en `blueprints/vector-taller-f1/blueprint.md` §20.3 antes del primer paso, con el número libre siguiente; hoy es el 56): "Una instalación por taller; perfil en `shops/<slug>/`". Aprueba §2 de este documento. Enmienda el No negociable 6 de `AGENTS.md` y `CLAUDE.md` para aclarar que una instalación por taller no es multi-sucursal ni multi-tenant. Levanta, solo para lo descrito en §2.3, las constantes del blueprint de la fase 1 §1 sobre columnas de `bookings`, correos transaccionales y tokens de `global.css`. Autoriza modificar la **firma** (no los valores esperados) de las llamadas en pruebas existentes cuando un paso cambie la firma de `validate` en `booking-state.ts` o de funciones de `handlers.ts` y `manual-booking.ts`, en el paso que la cambia.

**Orden con la fase 2.** La fase 2 fue aprobada el 13-11-2026 (decisión 55) y no tiene blueprint todavía. Las dos fases tocan páginas, correos y `handlers.ts`, así que van en serie. **Decidido por el dueño el 13-11-2026: esta fase primero.** Es más corta (11 a 13 pasos contra 18 a 24), no tiene dependencias con la fase 2, y si va antes, las 15 o más pantallas nuevas de la fase 2 nacen usando `SITE.name` y la guardia las vigila. Si la fase 2 va primero, esta fase limpia esas pantallas también y crece en dos o tres pasos.

## 14. Criterios de aceptación de la fase

1. Con `SHOP_SLUG=vector-bikes`, `pnpm gate` en verde sin cambiar ningún valor esperado en `tests/` ni `e2e/`.
2. Con `SHOP_SLUG=demo`, el build en una carpeta aparte (`--outDir`) y el smoke sobre ella pasan, y la portada muestra el nombre, la dirección, los horarios, las comunas, la tarifa y el logo del perfil demo.
3. Una reserva de retiro con el perfil `demo` acepta una comuna de su lista y rechaza "Vitacura" con un mensaje que nombra sus comunas.
4. Con el perfil `demo`, el correo de confirmación, el ICS y el recordatorio llevan el nombre, el dominio y la dirección del demo.
5. El primer `pnpm admin:set-password` con el perfil `demo` crea la sucursal con el nombre del perfil.
6. El código de reserva del perfil `demo` usa su prefijo.
7. La prueba de §3.9 falla si alguien escribe "Vector Bikes", "Vitacura", "Las Condes", "Kennedy", "vectorbikes", "vector.bikes", "$15.000" o el teléfono del taller en `src/`, y pasa al cerrar la fase. No busca el número `15000` a secas: `src/server/whatsapp/service.ts` lo usa como timeout.
8. Un perfil sin `name` o con horarios mal formados detiene el arranque con un error que nombra el campo.
9. `pnpm shop:check` con el perfil `demo` informa perfil, activos y variables completos; sin el logo, falla nombrándolo.
10. Las capturas de Vector Bikes después de la fase son idénticas a las de antes.
11. `pnpm gate` en verde.
12. Una instalación `demo` en un segundo Replit recibe una reserva, la recepciona en la tablet y la cierra, con su marca en todo lo que ve el cliente.

Los primeros once se verifican en el blueprint, paso por paso. El doce lo verifica el dueño.

## 15. Cómo generar el blueprint

Requisitos: este documento aprobado y commiteado; decisión de apertura registrada y reglas enmendadas; orden con la fase 2 decidido; árbol limpio.

Desde la raíz del worktree de `feat/plataforma`:

```
/the-architect:architect-brownfield Lee blueprints/vector-plataforma/FASE-PLATAFORMA.md y el blueprint de la fase 1 en blueprints/vector-taller-f1/blueprint.md (solo lectura). Construye el blueprint de esta fase en blueprints/vector-plataforma/. Pasos P-NN, tareas E<épica>-T<n>, tags p-NN. Las decisiones de la sección 2 están cerradas: no las re-preguntes. La sección 2.4 es la cerca. La sección 14 son los criterios de aceptación. La paridad (§9.1) es: con SHOP_SLUG=vector-bikes la suite existente pasa sin cambiar valores esperados. Respeta CLAUDE.md, AGENTS.md y .claude/rules/, enmendados por la decisión de apertura. Cada paso toca como máximo 5 archivos escritos a mano, salvo los dos pasos de títulos, que declaran su excepción. Una sola ventana de publicación con esquema.
```

Después, `/the-architect:architect-next` por cada paso, y un encargo por paso en `docs/encargos/P-NN-*.md`.

## 16. Documentos relacionados

- `blueprints/vector-taller-f2/FASE2.md` — Inventario, caja y ventas de mostrador (aprobada, decisión 55).
- `FASE3.md` y `FASE4.md` — sin cambios; multi-sucursal sigue en la fase 4.
- `docs/nuevo-taller.md` — se escribe en esta fase (§3.10).
