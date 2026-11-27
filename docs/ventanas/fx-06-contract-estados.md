# FX-06 — contract de los estados de la orden

El CHECK admite solo los diez estados actuales. El historial conserva sus valores y etiquetas heredadas.

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

3. Publicar. La publicación propaga el CHECK nuevo a producción y falla si quedara una orden con un estado heredado.
4. Revisar `/taller/ordenes` y la ficha de una orden con historial viejo.

En el Mac, la sesión coordinadora corre `pnpm db:migrate && pnpm db:check` contra la base dev (ya en `"pending":0` desde el 26-11-2026).
