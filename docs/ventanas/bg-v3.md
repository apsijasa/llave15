# Ventana de publicación V-BG3 · Llave 15

Tercera ventana de Llave 15, etiqueta `bg-11`: contract del esquema y cierre de la etapa 1. La sesión coordinadora prepara y verifica; el dueño publica en Replit con el taller cerrado. Las cuatro migraciones se aplican en orden en desarrollo y sus cambios se publican juntos (BG-D5, BG-D42 y BG-D43):

| Migración | Cambio |
|---|---|
| `drizzle/0039_low_ozymandias.sql` | Deja NOT NULL `branches.shop_id` y `branch_id` en las tablas de reserva; borra `booking_days`. |
| `drizzle/0040_big_wonder_man.sql` | Recrea `booking_days` con su FK y clave primaria (`branch_id`, `service_date`). |
| `drizzle/0041_awesome_firebird.sql` | Recrea `uq_bookings_code`, `uq_booking_blocks_active_slot`, `uq_branches_name` y `uq_customers_rut` con alcance por sucursal o taller, conservando sus nombres. |
| `drizzle/0042_late_master_chief.sql` | Reemplaza solo `bookings_fee_check` y `bookings_retiro_address_check`: tarifa cero en taller, tarifa de retiro ≥ 0 y retiro con comuna no vacía y dirección presente. |

Replit mostrará un **aviso de cambio destructivo**: se borra y recrea `booking_days`, se agregan NOT NULL y se recrean índices. Las filas de `booking_days` son anclas de bloqueo, no reservas; `createBooking` las recrea al reservar. El cambio de clave requiere dos generaciones porque drizzle-kit 0.31 no genera correctamente la eliminación de la PK de columna (BG-D42). No se borra ninguna reserva ni dato de operación. Las tarifas y comunas permitidas por cada taller siguen validadas con zod desde su configuración.

## Precondiciones

1. [V-BG1](bg-v1.md) y [V-BG2](bg-v2.md) publicadas y verificadas en producción. El código publicado ya pasa el alcance del taller y los datos ya están enlazados.
2. Taller cerrado, sin personal operando ni clientes reservando durante toda la ventana. Mantenerlo cerrado hasta terminar la verificación.
3. Respaldo de producción del día disponible en Replit → **Database** → puntos de restauración.
4. **`pnpm bg:backfill --dry-run` contra producción debe salir 0 e imprimir `"pending":0` antes del contract.** Un dry-run del workspace no acredita esta condición. Ante pendientes, estado ambiguo o error, detenerse y resolver con la coordinadora siguiendo V-BG2; no publicar restricciones sobre filas sin alcance.
5. La coordinadora confirmó el Verify completo de BG-11 y `pnpm gate` en verde fuera del sandbox. El dueño incorporó `bg-11` a `main` y lo subió a GitHub. Conservar disponible el deployment de `bg-08` para reversión.

## Pasos en Replit

En la **Shell del workspace**, confirmar primero que no hay cambios locales que se deban conservar. Traer el código autorizado:

```bash
git fetch origin
```

```bash
git reset --hard origin/main
```

```bash
git log --oneline -1
```

Confirmar que el commit corresponde a `bg-11` y coincide con GitHub. Instalar dependencias:

```bash
corepack pnpm@12.4.2 install --frozen-lockfile
```

Antes de aplicar o publicar el contract, tomar la conexión de **Database → producción**. En una Shell Bash, ingresarla sin mostrarla ni guardarla en archivos, capturas o historial:

```bash
read -r -s -p "Conexión de producción: " BG_PRODUCTION_DATABASE_URL
```

```bash
DATABASE_URL="$BG_PRODUCTION_DATABASE_URL" pnpm bg:backfill --dry-run
```

Exigir salida 0 y `"pending":0`. El comando no escribe ni sube el logo. Luego quitar la conexión de la Shell:

```bash
unset BG_PRODUCTION_DATABASE_URL
```

Según [BITACORA §2, Publicar con cambios de esquema](../BITACORA.md#publicar-con-cambios-de-esquema), ejecutar uno por uno **solo contra la base del workspace**, sin la conexión de producción:

```bash
corepack pnpm@12.4.2 db:migrate
```

```bash
corepack pnpm@12.4.2 db:check
```

`db:migrate` aplica las cuatro migraciones pendientes en el orden de la tabla. `db:check` debe salir 0 y responder `{"ok":true,...}`. Nunca ejecutar `db:migrate` contra producción, editar `drizzle/` ni usar `drizzle-kit push`. La aplicación no migra al arrancar.

Antes de publicar:

```bash
rm -rf node_modules
```

Ir a **Deployments → Republish**. Revisar el aviso destructivo y confirmar que corresponde exclusivamente a los cambios de las cuatro migraciones: recreación de `booking_days`, NOT NULL, cuatro índices únicos y dos CHECK reemplazados. Si ofrece borrar otra tabla, columna o dato, detenerse y revisar con la coordinadora. Con los cambios esperados y las precondiciones cumplidas, el dueño confirma la publicación.

Replit propaga el esquema a producción; no copia los datos del workspace ni ejecuta los archivos de `drizzle/`. Por eso el dry-run de producción es obligatorio antes de aceptar el aviso.

## Verificación después de publicar

1. Confirmar que `/api/health` responde `{"ok":true,"db":true}` y que `/taller`, una orden existente y el formulario actual de reserva abren conservando sus datos.
2. En **Database → producción**, revisar en solo lectura que no quedan filas sin alcance:

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

Todos los conteos deben ser 0. Confirmar en el panel que esas columnas son NOT NULL y que `booking_days` tiene PK (`branch_id`, `service_date`); puede estar vacía hasta la siguiente reserva.

3. Confirmar las definiciones de los dos CHECK y los cuatro índices únicos, en solo lectura:

```sql
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.bookings'::regclass
  and conname in ('bookings_fee_check', 'bookings_retiro_address_check');

select indexname, indexdef from pg_indexes
where schemaname = 'public'
  and indexname in ('uq_bookings_code', 'uq_booking_blocks_active_slot',
                   'uq_branches_name', 'uq_customers_rut');
```

Deben aparecer las dos reglas de la tabla inicial y los índices de reservas por `branch_id`, sucursales por `shop_id` y RUT por `branch_id`, conservando los predicados parciales de bloques activos y RUT no nulo.

4. La coordinadora verifica una reserva de prueba con el alcance de Vector Bikes, su tarifa y cobertura habituales, la creación del ancla de día y el aviso posterior al commit. Registra la verificación de V-BG3 antes de reabrir el taller. Los retiros del Taller Demo en Ñuñoa por $9.000 y los rechazos `23514` quedan cubiertos por `shops-checks.test.ts` en desarrollo; no crear otro taller en producción para ensayarlos.

Si falla una verificación o `/api/reservas` responde 500, mantener cerrado el taller y revisar con la coordinadora. Republicar el deployment de `bg-08` si corresponde al criterio de aborto del blueprint: su código con alcance es compatible con el contract. Conservar el esquema y los datos; no intentar deshacer las restricciones ni restaurar la PK anterior. El respaldo del día queda disponible para una recuperación coordinada si se detecta pérdida de datos.

## Nota de producción (2026-11-20)

Al publicar V-BG3, el diff de Replit **no incluyó** el reemplazo de `bookings_fee_check` y `bookings_retiro_address_check` (no detecta cambios de CHECK). Sin efecto para Vector Bikes (sus valores cumplían las reglas viejas), pero bloqueaba las reservas con retiro de cualquier otro taller. Se aplicaron a mano en producción, con respaldo previo, las mismas cuatro sentencias de `drizzle/0042_late_master_chief.sql` en una sola transacción (SQL Console con *Enable Editing*, las cuatro líneas seleccionadas). Verificación: `pg_get_constraintdef` de los dos CHECK ya no contiene `15000` ni `Vitacura`. En una futura ventana, revisar siempre en producción las definiciones de los CHECK que la migración reemplaza.
