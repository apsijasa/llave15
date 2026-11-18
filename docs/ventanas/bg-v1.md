# Ventana de publicación V-BG1 · Llave 15

Primera ventana de Llave 15, etiqueta `bg-05`: expansión del esquema y script idempotente de migración de datos. La sesión coordinadora prepara y verifica; el dueño publica en Replit.

La migración **`drizzle/0038_peaceful_living_tribunal.sql`** crea `shops`, agrega `branches.shop_id`, `users.is_platform_admin` y `branch_id` nulable en las siete tablas de reserva, con sus referencias e índices. Esta ventana no contrae columnas ni reemplaza las restricciones actuales. La migración de datos de producción se hace en V-BG2, antes del código con alcance; V-BG3 agrega las restricciones definitivas.

## Precondiciones

1. Taller cerrado, sin personal operando ni clientes reservando durante la publicación.
2. Respaldo de producción del día disponible en Replit → **Database** → puntos de restauración.
3. El dueño ha incorporado `bg-05` a `main` y lo ha subido a GitHub; la sesión coordinadora confirmó el Verify de BG-05 y `pnpm gate` en verde fuera del sandbox.
4. Producción tiene las migraciones anteriores a `0038`. Los cambios esperados al publicar son solo aditivos.
5. Para ejecutar después el backfill, comprobar `SHOP_NOTIFY_EMAIL` y la configuración validada por `getEmailEnv()` en los Secrets del destino. Si se incluye logo, tener el PNG y el almacenamiento Replit configurado. El script no envía correos.

## Pasos en Replit

En la **Shell del workspace**, confirmar primero que no hay cambios locales que se deban conservar. Traer la versión autorizada por el dueño:

```bash
git fetch origin
```

```bash
git reset --hard origin/main
```

```bash
git log --oneline -1
```

Confirmar que el commit coincide con GitHub y corresponde a esta ventana. Según [BITACORA §2, Publicar con cambios de esquema](../BITACORA.md#publicar-con-cambios-de-esquema), ejecutar uno por uno:

```bash
corepack pnpm@12.4.2 install --frozen-lockfile
```

```bash
corepack pnpm@12.4.2 db:migrate
```

```bash
corepack pnpm@12.4.2 db:check
```

Estos dos últimos comandos apuntan solo a la base del workspace. `db:check` debe responder `{"ok":true,...}` e incluir `shops`. Los avisos `NOTICE` de objetos existentes son normales.

Para ensayar la migración de datos en desarrollo, revisar primero sus conteos:

```bash
corepack pnpm@12.4.2 bg:backfill --dry-run
```

```bash
corepack pnpm@12.4.2 bg:backfill
```

```bash
corepack pnpm@12.4.2 bg:backfill --dry-run
```

La última corrida debe mostrar `"pending":0`. `filled` detalla las siete tablas; en dry-run representa las filas por completar, `branchesLinked` las sucursales por enlazar y `shopCreated` indica si habría que crear el taller. Dry-run no escribe, no sube el logo ni lee el correo de avisos. Una corrida posterior de escritura sin pendientes no cambia filas.

Si se incorpora el logo, reemplazar la corrida de escritura por `corepack pnpm@12.4.2 bg:backfill --logo <ruta-al-logo.png>`. Se guarda en `shops/<id>/logo.png` antes de la transacción; si falla la escritura, se elimina el objeto. Si el taller ya tiene `logo_key`, no se vuelve a subir.

Códigos de salida: **0** correcto (dry-run puede tener pendientes), **1** estado ambiguo o pendientes después de escribir, **2** uso inválido, conexión o error inesperado. Ante `ambiguous`, detenerse y revisar el estado con la sesión coordinadora; nunca asignar una sucursal por suposición.

Antes de publicar:

```bash
rm -rf node_modules
```

Ir a **Deployments → Republish**. Replit propaga el esquema a producción; no copia los datos del workspace ni ejecuta los archivos de `drizzle/`. Si ofrece un cambio destructivo, detener la publicación: esta ventana solo expande el esquema.

## Verificación después de publicar

En el panel **Database** de producción, solo lectura:

```sql
select count(*) from shops;
select count(*) from branches where shop_id is null;
select count(*) from bookings where branch_id is null;
```

Las consultas deben responder sin error. Es válido que `shops` esté vacía y existan filas sin alcance: el backfill del workspace no migra producción. No ejecutar `db:migrate` contra producción. La escritura del backfill en producción corresponde a V-BG2, con el taller cerrado y respaldo del día; la conexión se toma del panel de producción y se pasa solo al comando, sin guardarla en archivos.

Verificar en el sitio publicado que `/taller` y la reserva actual abren, una orden existente conserva sus datos y `/api/health` responde `{"ok":true,"db":true}`. La sesión coordinadora registra la revisión de V-BG1 antes de avanzar a V-BG2.

Para revertir la publicación, republicar el deployment anterior desde Replit. El código anterior ignora las tablas y columnas nuevas; no borrar datos ni revertir la migración aditiva.
