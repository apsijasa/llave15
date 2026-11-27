# FX-04 — expand de los estados de la orden

La base admite los diez estados nuevos y los cinco alias heredados. El código escribe los nuevos; el historial conserva sus valores originales. Esta ventana no incluye el contract.

1. En la sesión coordinadora, migrar y verificar la base de desarrollo (`pnpm db:migrate && pnpm db:check`), y ejecutar `pnpm gate` y la revisión de tablet a 820×1180 de la ficha y su desplegable.
2. Publicar en Replit. La publicación propaga el esquema expand a producción, **salvo los tres CHECK que `0045` recrea con el mismo nombre** (`work_orders_status_check`, `work_orders_delivered_paid_check`, `work_orders_qc_check`): Replit no los reemplaza (`docs/BITACORA.md` §2). Después de publicar, comprobar en producción que `work_orders_status_check` incluye `creado` y `pagado`. Si no los incluye, el dueño decide si aplica en una transacción los `DROP CONSTRAINT` y `ADD CONSTRAINT` de `drizzle/0045_lively_captain_america.sql`; sin ese paso fallan las recepciones nuevas y el traspaso del punto 4 (`remap_failed`). Así se hizo en producción el 27-11-2026.
3. Tomar la conexión de **Database → producción** e ingresarla en una Shell Bash sin mostrarla ni guardarla en archivos, capturas o historial (como en `bg-v3.md`):

   ```bash
   read -r -s -p "Conexión de producción: " PRODUCTION_DATABASE_URL
   ```

   Luego revisar los pendientes:

   ```sh
   DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm orders:remap-status --dry-run
   ```

   Imprime una línea JSON de conteos. Sale 1 si hay pendientes; no escribe datos.

4. En el mismo shell, traspasar las órdenes (una transacción por taller, sin reescribir historial):

   ```sh
   DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm orders:remap-status
   ```

5. Repetir la revisión:

   ```sh
   DATABASE_URL="$PRODUCTION_DATABASE_URL" pnpm orders:remap-status --dry-run
   ```

   Debe imprimir `"pending":0` y salir 0. Una corrida real también es idempotente. Un problema de configuración o conexión sale 2 sin imprimir credenciales ni datos personales.

6. Quitar la conexión de la Shell:

   ```bash
   unset PRODUCTION_DATABASE_URL
   ```

7. Solo con cero pendientes en producción, pedir el encargo de contract que retirará los alias del CHECK y del código. El contract vuelve a cambiar `work_orders_status_check`: su ventana debe incluir la misma comprobación en producción después de publicar.

**Registro (27-11-2026).** Publicado junto con el panel de indicadores (BG-D55) y FX-05. Los tres CHECK se aplicaron a mano en producción y luego `orders:remap-status` traspasó 2 órdenes `recibida` → `creado`; la revisión final imprimió `"pending":0`. El contract sigue pendiente.
