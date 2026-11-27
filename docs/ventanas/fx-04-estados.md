# FX-04 — expand de los estados de la orden

La base admite los diez estados nuevos y los cinco alias heredados. El código escribe los nuevos; el historial conserva sus valores originales. Esta ventana no incluye el contract.

1. En la sesión coordinadora, migrar y verificar la base de desarrollo (`pnpm db:migrate && pnpm db:check`), y ejecutar `pnpm gate` y la revisión de tablet a 820×1180 de la ficha y su desplegable.
2. Publicar en Replit. La publicación propaga el esquema expand a producción.
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

7. Solo con cero pendientes en producción, pedir el encargo de contract que retirará los alias del CHECK y del código.

Hecho el 27-11-2026 (`"pending":0`). Contract: `docs/ventanas/fx-06-contract-estados.md`.
