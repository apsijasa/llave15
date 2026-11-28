# FX-07 — productos de uso interno

Esta ventana agrega la columna `products.for_sale` (migración `0048`, que va después de la `0047` de FX-08). Es un cambio aditivo: `boolean NOT NULL DEFAULT true`, así que todos los productos existentes quedan "para la venta" y no hay traspaso de datos. También mejora los mensajes de la revisión de factura. No hay Secrets nuevos.

**Orden con FX-06.** FX-06 (el contract de los estados de la orden, rama `feat/estados-contract`) también trae una migración. La rama que entre segunda a `main` se rebasa, borra su SQL y su snapshot y vuelve a correr `pnpm db:generate`. Nunca se edita `drizzle/` a mano.

1. En la sesión coordinadora, con la rama al día, contra la base de desarrollo: `pnpm db:migrate && pnpm db:check`, y después `pnpm gate`.
2. Revisión en el build local:
   - Ficha de un producto de uso interno con "Registrar uso en taller", en 820×1180.
   - Revisión de factura con un error de precio, en 1280×800.
3. Publicar en Replit. Replit lleva a producción el esquema de la **base del workspace**, así que antes hay que migrarla. En el Shell de Replit, un comando a la vez:

   ```bash
   git fetch origin
   git reset --hard origin/main
   git log --oneline -1
   corepack pnpm@12.4.2 install --frozen-lockfile
   corepack pnpm@12.4.2 db:migrate
   corepack pnpm@12.4.2 db:check
   rm -rf node_modules
   ```

   Después, **Deployments → Republish**. Los cambios de esquema que muestre deben ser solo agregados (`products.for_sale`). Si propone borrar algo, no se publica.

   **28-11-2026:** se publicó sin `db:migrate` en el Shell y `/taller/inventario` respondió 500, porque producción no tenía la columna. Se resolvió corriendo estos pasos y volviendo a publicar.
4. Prueba en producción, como dueño:
   - En `/taller/inventario`, abrir uno de los productos de la `OC-00001` que no se venden. Desmarcar "Para la venta" y guardar.
   - Debe aparecer "Uso interno" en la lista, y el producto ya no debe aparecer en `/taller/ventas/nueva`.
   - En su ficha, "Registrar uso en taller" con cantidad 1. El stock baja en 1 y el movimiento dice `Uso en taller`.
5. Vuelta atrás: volver a marcar "Para la venta" en el producto. La columna se queda.
