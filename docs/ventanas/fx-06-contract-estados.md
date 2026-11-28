# FX-06 — contract de los estados de la orden

El CHECK admite solo los diez estados actuales (migración `0049`, que va después de la `0048` de FX-07). El historial conserva sus valores y etiquetas heredadas.

1. **En Replit, antes de traer el contract**, con el código todavía en `main` anterior, ingresar la conexión de producción en una Shell Bash sin mostrarla ni guardarla en archivos, capturas o historial:

   ```bash
   corepack pnpm@12.4.2 install --frozen-lockfile
   read -r -s -p "Conexión de producción: " PRODUCTION_DATABASE_URL
   DATABASE_URL="$PRODUCTION_DATABASE_URL" corepack pnpm@12.4.2 orders:remap-status --dry-run
   ```

   Debe imprimir `"pending":0`; si no, **no seguir**. Este comando existe solo en la versión anterior al contract. Después, quitar la conexión de la Shell:

   ```bash
   unset PRODUCTION_DATABASE_URL
   ```

2. Traer el contract y preparar la base de desarrollo del workspace de Replit, en este orden:

   ```sh
   git pull --rebase origin main
   corepack pnpm@12.4.2 install --frozen-lockfile
   corepack pnpm@12.4.2 db:migrate
   corepack pnpm@12.4.2 db:check
   rm -rf node_modules
   ```

3. **Deployments → Republish.** Los cambios de esquema que muestre deben tocar solo `work_orders_status_check`. Si propone borrar una tabla o columna, no se publica.
4. Comparar `work_orders_status_check` en producción con el del workspace, en modo de solo lectura (Replit no reemplaza un CHECK que conserva su nombre; `docs/BITACORA.md` §2):

   ```bash
   read -r -s -p "Conexión de producción: " PRODUCTION_DATABASE_URL
   psql "$PRODUCTION_DATABASE_URL" -c "select pg_get_constraintdef(oid) from pg_constraint where conname = 'work_orders_status_check';"
   psql "$DATABASE_URL" -c "select pg_get_constraintdef(oid) from pg_constraint where conname = 'work_orders_status_check';"
   unset PRODUCTION_DATABASE_URL
   ```

   Si producción todavía lista `reservada`, `recibida`, `en_reparacion`, `control_calidad` o `trabajo_rechazado`, el dueño decide si aplica a mano, con un respaldo del día y en una sola transacción (`psql -v ON_ERROR_STOP=1 --single-transaction`), exactamente las dos sentencias de `drizzle/0049_*.sql`. Solo se aplica si `"pending":0` sigue vigente: el CHECK nuevo rechaza cualquier orden con un estado heredado.
5. Revisar `/taller/ordenes` y la ficha de una orden con historial viejo.

En el Mac, la sesión coordinadora corre `pnpm db:migrate && pnpm db:check` contra la base dev (ya en `"pending":0` desde el 26-11-2026).
