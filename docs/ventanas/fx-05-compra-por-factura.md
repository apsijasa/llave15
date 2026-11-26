# FX-05 — compra por factura

Agrega la tabla `purchase_imports` (cambio aditivo, sin traspaso de datos) y las pantallas `/taller/compras/factura`. Usa el mismo proveedor de IA y las mismas variables que la biblioteca: no hay Secrets nuevos.

**Orden con FX-04.** FX-04 (`feat/estados-orden`) también trae una migración. Esta rama se cortó de `main` antes de que FX-04 entrara: si FX-04 llega primero a `main`, antes de publicar FX-05 hay que rebasar esta rama sobre `main`, borrar su SQL generado y su snapshot, y volver a correr `pnpm db:generate` para que la migración quede numerada después de la de FX-04. Nunca editar `drizzle/` a mano.

1. En la sesión coordinadora, con la rama al día sobre `main`: `pnpm db:migrate && pnpm db:check` contra la base de desarrollo, y `pnpm gate`.
2. Revisar en el build local, a 1280×800, la carga (`/taller/compras/factura`) y la revisión de una factura real, con `AI_PROVIDER=anthropic` en el `.env` local. El archivo de prueba no se commitea.
3. En Replit, confirmar en *Secrets* que siguen `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` y `AI_MODEL`. Con `AI_PROVIDER=none` la pantalla aparece deshabilitada y nada más cambia.
4. Publicar en Replit. La publicación crea la tabla en producción.
5. Prueba en producción, como dueño:
   - Subir una factura real y confirmarla con "Recibir ahora" **desmarcado**. La compra debe quedar en borrador en `/taller/compras/<id>`, con "Ver documento".
   - Subir otra y confirmarla con "Recibir ahora" marcado. En `/taller/inventario/<producto>` el stock sube y el costo promedio cambia; el precio de venta no cambia.
6. Vuelta atrás: poner `AI_PROVIDER=none` en Secrets deshabilita la lectura. La tabla queda; las compras ya creadas son compras normales.
