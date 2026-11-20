# Publicación de Llave 15: todos los comandos

Guía de los pasos de Andrés, en orden, para llevar la fase Llave 15 (`bg-01` … `bg-49`) a producción. Cada comando dice dónde se corre:

- **Mac:** Terminal del Mac, en la carpeta del repositorio.
- **Replit:** Shell del workspace de Replit (el sistema actual, que pasa a ser Llave 15).
- **Replit sitio:** Shell del Replit nuevo del sitio de Vector Bikes (desde C6).
- **Otros:** paneles web (Replit, Resend, Cloudflare, proveedor de DNS, Make.com).

La lógica es la misma de siempre: cada etapa se sube a `main`, Replit la trae con `git reset --hard origin/main` y se publica con **Republish**. Solo las tres primeras publicaciones (V-BG1, V-BG2, V-BG3) tocan el esquema o los datos, y van con el taller cerrado y el respaldo del día. Las guías largas de cada ventana están en `docs/ventanas/bg-v1.md`, `bg-v2.md` y `bg-v3.md`, y las del corte en `docs/corte-bike-garage.md`.

| Publicación | Tag que se sube a `main` | Taller cerrado | Esquema o datos |
|---|---|---|---|
| 0. Subir la rama | — | no | no |
| 1. V-BG1 | `bg-05` | sí | expande el esquema |
| 2. V-BG2 | `bg-08` | sí | migra los datos de producción |
| 3. V-BG3 | `bg-11` | sí | contract del esquema (aviso destructivo esperado) |
| 4. Etapa 2 (marca Llave 15) | `bg-49` | no | no |
| 5. Etapa 3 (reservas por taller) | `bg-33` | no | no |
| 6. Etapa 4 (C5: `llave15.cl`) | `bg-40` | no | no |
| 7. Etapa 5 (plataforma) | `bg-44` (punta de la rama; incluye `bg-45`) | no | no |
| 8. C6 y C7 (sitio y DNS) | — | no | no |

## 0. Subir la rama y los tags

**Mac**

```bash
git push origin feat/bike-garage
```

```bash
git push origin --tags
```

## 1. Ventana V-BG1 (`bg-05`)

Antes: taller cerrado y respaldo del día en Replit → **Database** → puntos de restauración.

**Mac**

```bash
git checkout main
```

```bash
git merge --ff-only bg-05
```

```bash
git push origin main
```

**Replit**

```bash
git fetch origin
```

```bash
git reset --hard origin/main
```

```bash
git log --oneline -1
```

El commit debe ser `3d32433`.

```bash
corepack pnpm@12.4.2 install --frozen-lockfile
```

```bash
corepack pnpm@12.4.2 db:migrate
```

```bash
corepack pnpm@12.4.2 db:check
```

Debe responder `{"ok":true,...}` con `shops` incluida.

```bash
corepack pnpm@12.4.2 bg:backfill --dry-run
```

```bash
corepack pnpm@12.4.2 bg:backfill
```

```bash
corepack pnpm@12.4.2 bg:backfill --dry-run
```

La última corrida debe mostrar `"pending":0`. Esto ensaya en la base del workspace, no en producción.

```bash
rm -rf node_modules
```

**Otros (Replit):** **Deployments → Republish**. Si ofrece un cambio destructivo, detente: esta ventana solo agrega.

**Otros (Replit → Database → producción, solo lectura):**

```sql
select count(*) from shops;
select count(*) from branches where shop_id is null;
select count(*) from bookings where branch_id is null;
```

Deben responder sin error. Es normal que `shops` esté vacía. Comprueba también que `/taller`, la reserva actual y `/api/health` (`{"ok":true,"db":true}`) funcionan.

## 2. Ventana V-BG2 (`bg-08`)

Antes: V-BG1 verificada, taller cerrado, respaldo del día, y en producción `select count(*) from branches;` debe dar 1.

**Mac**

```bash
git checkout main
```

```bash
git merge --ff-only bg-08
```

```bash
git push origin main
```

**Replit** (sin republicar todavía)

```bash
git fetch origin
```

```bash
git reset --hard origin/main
```

```bash
git log --oneline -1
```

El commit debe ser `e39bbb2`.

```bash
corepack pnpm@12.4.2 install --frozen-lockfile
```

Pega la conexión de **Database → producción** cuando la pida. No se muestra ni queda en el historial:

```bash
read -r -s -p "Conexión de producción: " BG_PRODUCTION_DATABASE_URL
```

```bash
DATABASE_URL="$BG_PRODUCTION_DATABASE_URL" pnpm bg:backfill --dry-run
```

```bash
DATABASE_URL="$BG_PRODUCTION_DATABASE_URL" pnpm bg:backfill --logo public/brand/vector-bikes-logo.png
```

```bash
DATABASE_URL="$BG_PRODUCTION_DATABASE_URL" pnpm bg:backfill --dry-run
```

Las tres deben salir 0 y la última debe imprimir `"pending":0`. Si no, detente y no publiques.

```bash
unset BG_PRODUCTION_DATABASE_URL
```

```bash
rm -rf node_modules
```

**Otros (Replit):** **Deployments → Republish** del commit de `bg-08`.

**Otros (Replit → Database → producción, solo lectura):**

```sql
select count(*) from shops;
select count(*) from branches where shop_id is null;
select count(*) from bookings where branch_id is null;
```

Debe haber 1 taller y los otros dos conteos en 0. Prueba `/api/health`, `/taller`, una orden y una reserva de prueba antes de reabrir el taller.

## 3. Ventana V-BG3 (`bg-11`)

Antes: taller cerrado, respaldo del día y el deployment de `bg-08` disponible para volver atrás.

**Mac**

```bash
git checkout main
```

```bash
git merge --ff-only bg-11
```

```bash
git push origin main
```

**Replit**

```bash
git fetch origin
```

```bash
git reset --hard origin/main
```

```bash
git log --oneline -1
```

El commit debe ser `4762486`.

```bash
corepack pnpm@12.4.2 install --frozen-lockfile
```

```bash
read -r -s -p "Conexión de producción: " BG_PRODUCTION_DATABASE_URL
```

```bash
DATABASE_URL="$BG_PRODUCTION_DATABASE_URL" pnpm bg:backfill --dry-run
```

Obligatorio: salida 0 y `"pending":0`. Si no, detente.

```bash
unset BG_PRODUCTION_DATABASE_URL
```

```bash
corepack pnpm@12.4.2 db:migrate
```

```bash
corepack pnpm@12.4.2 db:check
```

```bash
rm -rf node_modules
```

**Otros (Replit):** **Deployments → Republish**. Aparece un aviso destructivo **esperado**: se recrea `booking_days`, se agregan los NOT NULL, se recrean cuatro índices únicos y se reemplazan dos CHECK. Si ofrece borrar otra cosa, detente.

**Otros (Replit → Database → producción, solo lectura):**

```sql
select count(*) from branches where shop_id is null;
select count(*) from bookings where branch_id is null;
select count(*) from booking_bikes where branch_id is null;
select count(*) from booking_blocks where branch_id is null;
select count(*) from booking_days where branch_id is null;
select count(*) from blocked_periods where branch_id is null;
select count(*) from booking_requests where branch_id is null;
select count(*) from whatsapp_messages where branch_id is null;
```

Todos deben dar 0. Haz una reserva de prueba antes de reabrir el taller.

## 4 a 7. Etapas sin esquema (`bg-49`, `bg-33`, `bg-40`, `bg-44`)

Desde aquí ninguna publicación trae migraciones y el taller puede seguir abierto. Para cada tag, en este orden: `bg-49`, `bg-33`, `bg-40` y `bg-44`. Para la etapa 4 (`bg-40`), haz antes las precondiciones y los Secrets de la sección C5.

**Mac** (reemplaza `<tag>`)

```bash
git checkout main
```

```bash
git merge --ff-only <tag>
```

```bash
git push origin main
```

**Replit**

```bash
git fetch origin
```

```bash
git reset --hard origin/main
```

```bash
corepack pnpm@12.4.2 install --frozen-lockfile
```

```bash
rm -rf node_modules
```

**Otros (Replit):** **Deployments → Republish**. Después comprueba `/api/health`, `/taller` y una reserva.

Tras la etapa 3 (`bg-33`), la reserva por taller queda en `https://<dominio>/vector-bikes/reservar`. Tras la etapa 5 (`bg-44`), ponte la marca de plataforma:

**Replit**

```bash
pnpm platform:admin <tu-correo>
```

El comando cierra tus sesiones: vuelve a entrar y abre `/plataforma`.

## C5. `llave15.cl` y los secretos nuevos (con la etapa 4, `bg-40`)

**Otros (antes de publicar `bg-40`):**

1. **Rotar la clave de la base de producción** en Replit y actualizar `DATABASE_URL` en Secrets.
2. **Resend:** agregar el dominio `send.llave15.cl`, copiar en el DNS de `llave15.cl` los registros SPF, DKIM y DMARC que indica Resend, y esperar a que salga verificado.
3. **Cloudflare Turnstile:** crear un widget para `llave15.cl` (y dejar `vectorbikes.cl` en el actual hasta C7).
4. **Replit → Deployments → Domains:** agregar `llave15.cl` (y `www.llave15.cl`) y copiar en el DNS los registros que indique Replit.

**Mac** (genera el secreto del seguimiento; cópialo, no lo guardes en archivos)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**Otros (Replit → Secrets):**

| Secret | Valor |
|---|---|
| `APP_URL` | `https://llave15.cl` |
| `TRACKING_TOKEN_SECRET` | el generado arriba |
| `EMAIL_FROM` | el remitente en `send.llave15.cl`, por ejemplo `reservas@send.llave15.cl` |
| `PUBLIC_TURNSTILE_SITE_KEY` | clave pública del widget nuevo |
| `TURNSTILE_SECRET_KEY` | clave secreta del widget nuevo |
| `PUBLIC_SITE_URL` | se queda en `https://vectorbikes.cl` |

Después publica `bg-40` con los comandos de la sección anterior.

**Mac** (verificación)

```bash
curl -s https://llave15.cl/api/health
```

Debe responder `{"ok":true,"db":true}`. Luego, en el navegador: entra en `https://llave15.cl/admin/login`, revisa que un enlace de seguimiento nuevo empiece con `https://llave15.cl/`, abre un enlace de seguimiento enviado antes, y haz una reserva de prueba en `https://llave15.cl/vector-bikes/reservar` y cancélala desde el correo.

**Replit**

```bash
pnpm bg:check
```

Debe salir 0 con `{"ok":true,...}`.

## C6. Sitio de Vector Bikes en un Replit nuevo

**Otros (Replit):** crear un Replit nuevo importando el repositorio de GitHub (`apsijasa/vector-bikes`, rama `main`). No necesita base de datos ni Secrets, salvo `PUBLIC_WHATSAPP_NUMBER` si quieres el botón de WhatsApp.

Configura el despliegue así:

- **Build:** `corepack pnpm@12.4.2 install --frozen-lockfile && corepack pnpm@12.4.2 exec astro build --root web/vector-bikes`
- **Run:** `HOST=0.0.0.0 PORT=4321 node web/vector-bikes/dist/server/entry.mjs`

Publica y anota la URL `*.replit.app`.

**Mac** (todos los días del período sombra, al menos 7)

```bash
node web/vector-bikes/scripts/check-redirects.ts https://<sitio>.replit.app
```

Debe salir 0. Abre también `/` y `/privacidad` y compáralas con la portada de hoy.

## C7. DNS de `vectorbikes.cl` al Replit nuevo

**Otros:**

1. En el Replit actual, quita `vectorbikes.cl` y `www.vectorbikes.cl` de **Domains**.
2. En el Replit nuevo, agrégalos y copia en el proveedor de DNS los registros que indique Replit.
3. **Make.com:** cambia la URL de cada tarea (`/api/tareas/*` y el cron de WhatsApp) a `https://llave15.cl`. El `TASKS_SECRET` no cambia. Ejecuta cada una a mano y comprueba `ok: true`.

**Mac** (cuando propague el DNS)

```bash
node web/vector-bikes/scripts/check-redirects.ts https://vectorbikes.cl
```

Debe salir 0. Luego abre un enlace de seguimiento antiguo (`https://vectorbikes.cl/seguimiento/<token>`) y escanea una etiqueta QR impresa: los dos deben llegar a `llave15.cl` y abrir.

**Replit**

```bash
pnpm bg:check
```

## Cerrar la rama

**Mac** (cuando todo esté publicado)

```bash
git checkout main
```

```bash
git merge --ff-only feat/bike-garage
```

```bash
git push origin main
```

## Si algo sale mal

| Momento | Qué hacer |
|---|---|
| V-BG1 o V-BG2 | **Deployments** → republicar el deployment anterior. No borrar datos. |
| V-BG3 | Republicar el deployment de `bg-08`. No deshacer restricciones; el respaldo del día queda para una recuperación coordinada. |
| C5 | Quitar `APP_URL` de Secrets y republicar `bg-33`. Deja `TRACKING_TOKEN_SECRET` cargado para que sigan abriendo los enlaces nuevos. |
| C6 | Despublicar el Replit nuevo. |
| C7 | Devolver `vectorbikes.cl` al Replit actual. |
| Más de 5 errores 5xx en una hora, o una 500 de `/api/reservas` | Republicar el deployment anterior. |
| `pnpm bg:check` sale 1 | Detener la publicación siguiente y revisar. |

## Después del corte (con un encargo cada una)

- **`BG-DC1`:** 7 días con `check-redirects.ts https://vectorbikes.cl` en 0 → retirar la portada heredada del sistema.
- **`BG-DC2`:** 30 días sin órdenes abiertas con tokens heredados → el seguimiento solo con `TRACKING_TOKEN_SECRET`.
- **`BG-DC3`:** 30 días desde C7 → el CSRF deja de aceptar `vectorbikes.cl` y `APP_URL` pasa a obligatoria.
- **`BG-DC4`:** crear el repositorio `vector-bikes-web` con el contenido de `web/vector-bikes/` y conectarlo al Replit del sitio.

Antes del segundo taller real: los términos con cada taller (Ley 19.628 y Ley 21.719) y su alta según `docs/nuevo-taller.md`.
