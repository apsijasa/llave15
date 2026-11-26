# FX-05 — compra por factura

Agrega la tabla `purchase_imports` (cambio aditivo, sin traspaso de datos) y las pantallas `/taller/compras/factura`. Usa el mismo proveedor de IA y las mismas variables que la biblioteca: no hay Secrets nuevos.

**Orden con FX-04.** Esta rama va encima de `feat/estados-orden` (FX-04): su migración es `drizzle/0046_silent_black_crow.sql`, después de la `0045` de FX-04. FX-04 entra a `main` y se publica primero, o las dos juntas; FX-05 sola sobre `main` no aplica. Si `main` recibe otra migración antes, se rebasa, se borran el SQL y el snapshot de esta rama y se vuelve a correr `pnpm db:generate`. Nunca editar `drizzle/` a mano.

1. En la sesión coordinadora, con la rama al día: `pnpm db:migrate && pnpm db:check` contra la base de desarrollo, y `pnpm gate`. Hecho el 26-11-2026 sobre FX-04: compuerta completa en verde y revisión en el build local con una lectura sintética (carga, revisión, confirmación con "Recibir ahora", stock, costo promedio y documento).
2. Revisar en el build local, a 1280×800, la carga (`/taller/compras/factura`) y la revisión de una factura real, con `AI_PROVIDER=anthropic` en el `.env` local. El archivo de prueba no se commitea.
3. En Replit, confirmar en *Secrets* que siguen `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` y `AI_MODEL`. Con `AI_PROVIDER=none` la pantalla aparece deshabilitada y nada más cambia.
4. Publicar en Replit. La publicación crea la tabla en producción.
5. Prueba en producción, como dueño:
   - Subir una factura real y confirmarla con "Recibir ahora" **desmarcado**. La compra debe quedar en borrador en `/taller/compras/<id>`, con "Ver documento".
   - Subir otra y confirmarla con "Recibir ahora" marcado. En `/taller/inventario/<producto>` el stock sube y el costo promedio cambia; el precio de venta no cambia.
6. Vuelta atrás: poner `AI_PROVIDER=none` en Secrets deshabilita la lectura. La tabla queda; las compras ya creadas son compras normales.
