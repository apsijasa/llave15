---
description: Multi-taller de Llave 15 — alcance, aislamiento, plataforma, slugs y sitio de Vector Bikes
paths:
  - "src/server/shops/**"
  - "src/pages/plataforma/**"
  - "scripts/bg-*.ts"
  - "scripts/platform-admin.ts"
  - "web/vector-bikes/**"
---

# Multi-taller

- **Principio (FASE §4):** ninguna consulta, tarea, correo ni página ve datos de un taller distinto al del usuario, el token o el `slug` que la origina. Toda tabla de operación lleva `branch_id`; toda consulta filtra por él.
- Un taller = una fila de `shops` con una sola sucursal (`branches.shop_id`). El perfil (`ShopProfile`, `profile.ts`) y la configuración de reserva (`BookingConfig`, `booking/config.ts`) salen de esa fila; nunca de constantes en `src/`.
- **Alcance:** `BookingScope = { shopId, slug, branchId, config }` (`scope.ts`): `scopeForBranch(db, branchId)` (personal), `scopeBySlug(db, slug)` (público; `null` si es desconocido, reservado o `suspendido`), `activeShopScopes(db)` (tareas), `singleShopScope(db)` (compatibilidad: solo con un taller; lanza `ShopScopeError` con dos o ninguno). Páginas, handlers y tareas pasan el alcance explícito.
- **Prueba de dos talleres:** `tests/helpers/two-shops.ts` (`seedTwoShops`) siembra Vector Bikes y el Taller Demo con datos parecidos; cada pantalla y tarea que lee datos de operación tiene su `*-isolation.test.ts` que comprueba que nada cruza. `pnpm test isolation` la corre sola; `pnpm gate` siempre.
- **Slugs:** `slugSchema` (`slugs.ts`): `^[a-z0-9]+(-[a-z0-9]+)*$`, 3 a 40 caracteres, fuera de `RESERVED_SLUGS`; toda entrada de primer nivel de `src/pages/` y `public/` está reservada (lo prueba `tests/unit/reserved-slugs.test.ts`). `slug` y `code_prefix` no se editan después del alta.
- **Plataforma:** la marca `users.is_platform_admin` no es un rol. Da acceso a `/plataforma` (crear, suspender, reactivar, ver uso), que muestra solo metadatos y conteos, nunca filas de clientes, órdenes ni reservas. Para operar un taller hace falta un usuario en ese taller. El administrador de plataforma es además curador de la biblioteca (decisión 12). La marca se pone o quita con `pnpm platform:admin`.
- **Alta de taller:** `createShop` en una transacción: `shops` `activo`, una sucursal, el primer `owner` (clave ≥ 12, scrypt; correo único en toda la plataforma) y la copia del catálogo del taller plantilla con el `branch_id` nuevo.
- **Suspensión:** `status = 'suspendido'` revoca sesiones, bloquea el ingreso de sus usuarios, saca su página pública y su API (404) y lo omite en las tareas. Nunca se borra un taller.
- **Scripts:** `bg-backfill.ts` (migración idempotente del primer taller, `--dry-run`, `--logo`), `bg-check.ts` (cruces de sucursal), `platform-admin.ts`: salen 0/1/2, imprimen solo conteos o JSON sin datos personales, se cargan con `node --env-file-if-exists=.env` y su `main` corre solo si `import.meta.url === pathToFileURL(process.argv[1]).href`.
- **Sitio de Vector Bikes (`web/vector-bikes/`):** app Astro aparte (portada y privacidad prerenderizadas, endpoint comodín `[...path].ts` con redirecciones 301/308 a `https://llave15.cl` conservando ruta y consulta para `/taller`, `/admin`, `/seguimiento`, `/informe`, `/aprobacion` y `/reservas/cancelar`). Nunca importa `src/**`; resuelve paquetes desde `node_modules` de la raíz; se prueba con `pnpm test:web`. Sus `package.json`, `astro.config.mjs`, `tsconfig.json` y `vitest.config.ts` los entrega el Bootstrap y no se editan. Sale al repositorio `vector-bikes-web` en BG-DC4.
