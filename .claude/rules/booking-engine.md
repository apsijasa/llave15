---
description: Motor de agenda, zonas horarias y escritura concurrente de reservas
paths:
  - "src/server/booking/**"
  - "src/data/**"
---

# Motor de reservas

- Zona única: `America/Santiago` (constante `TIMEZONE` de `src/lib/time.ts`, junto con `localToday`, `addDays` y `localToInstant`; `booking/rules.ts` y `booking/slots.ts` los reexportan solo entre BG-02 y BG-28). Horas de negocio como texto `HH:MM` local; conversión a instantes solo con luxon.
- Nunca sumar 24 horas a un instante para "mañana": usar `addDays` sobre fechas locales.
- Una hora local inexistente (cambio de horario) devuelve `null` en `localToInstant` y no genera bloque.
- Funciones puras con `now: Date` inyectado; prohibido `new Date()` o `Date.now()` dentro de la lógica.
- **Las reglas son del taller:** horarios de recepción y retiro, bloque, capacidad diaria, antelación, horizonte, retiro habilitado, tarifa, comunas y prefijo de código vienen de `BookingConfig` (`src/server/booking/config.ts`, `bookingConfigFromShop`) dentro de un `BookingScope = { shopId, slug, branchId, config }` (`src/server/shops/scope.ts`). En `rules.ts` quedan solo las reglas genéricas (`BLOCKS_PER_MODE`, `blocksFor`, `MAX_BIKES_PER_BOOKING`, `hoursFor(config, …)`). Ningún valor de un taller en `src/` (regla de código 14).
- Toda función que lee o escribe reservas recibe el alcance o la sucursal (último argumento opcional); sin él, `singleShopScope` usa el único taller y lanza `ShopScopeError` con dos. Excepción (BG-D41): `readRange` y `readDay` sin sucursal la resuelven dentro de sus propias consultas (única sucursal del único taller) para conservar las tres consultas fijas, y con dos talleres no ven ninguna fila (falla cerrada); las escrituras sí lanzan. Páginas y handlers lo pasan siempre explícito. Toda consulta de `bookings`, `booking_blocks`, `booking_days`, `blocked_periods`, `booking_bikes`, `booking_requests` y `whatsapp_messages` filtra por `branch_id`.
- La disponibilidad es consultiva; `createBooking` revalida todas las reglas del taller dentro de la transacción (horario, feriado, bloqueos, antelación, horizonte, capacidad, teléfono por taller).
- Orden de locks fijo: `booking_days` (`branch_id`, `service_date`) `FOR UPDATE` → `pg_advisory_xact_lock(hashtext(phone))`. Nunca al revés.
- Código de reserva `${config.codePrefix}-AAMMDD-HHMM`, con sufijo `-n` por sucursal (`VB-…` en Vector Bikes).
- Nada de red ni correos dentro de la transacción; se notifica después del commit, con la marca del taller.
- Violación única (`isUniqueViolation`) → `slot_unavailable`, nunca 500.
- `retiro` ocupa 2 bloques consecutivos y cuenta como 1 de las reservas del día; la tarifa y las comunas son las del taller (zod), los CHECK solo exigen tarifa ≥ 0 y comuna no vacía.
- Feriados solo desde `src/data/feriados-cl.json`; nunca inventar años no publicados.
