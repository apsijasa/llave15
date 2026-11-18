# Ventana de publicación V-BG2 · Llave 15

Segunda ventana de Llave 15, etiqueta `bg-08`: migración de los datos de producción antes de publicar el código que usa el alcance del taller. La sesión coordinadora prepara y verifica; el dueño publica en Replit. Esta ventana no agrega migraciones de esquema: V-BG1 ya expandió las tablas y V-BG3 incorporará las restricciones definitivas.

## Precondiciones

1. [V-BG1](bg-v1.md) publicada y verificada en producción, incluida la expansión `0038_peaceful_living_tribunal.sql`.
2. Taller cerrado, sin personal operando ni clientes reservando durante toda la migración y publicación. Mantener detenidas las operaciones hasta terminar la verificación.
3. Respaldo de producción del día disponible en Replit → **Database** → puntos de restauración.
4. La sesión coordinadora confirmó el Verify completo de BG-08, el backfill de la base dev con `"pending":0` y `pnpm gate` en verde fuera del sandbox. El dueño incorporó `bg-08` a `main` y lo subió a GitHub.
5. Producción tiene exactamente una sucursal. Comprobar con una consulta de solo lectura: `select count(*) from branches;` debe devolver 1. Si hay más, detenerse y revisar con la coordinadora; no asignar datos por suposición.
6. Tener `public/brand/vector-bikes-logo.png`, acceso al almacenamiento Replit del destino y los Secrets que valida `getEmailEnv()`, incluido `SHOP_NOTIFY_EMAIL`. El script no envía correos.

## Migración de datos en producción

En la **Shell del workspace**, con el taller cerrado y el respaldo confirmado, traer el código autorizado sin republicar todavía. Confirmar primero que no hay cambios locales que se deban conservar:

```bash
git fetch origin
```

```bash
git reset --hard origin/main
```

```bash
git log --oneline -1
```

Confirmar que el commit corresponde a `bg-08` y coincide con GitHub. Instalar las dependencias:

```bash
corepack pnpm@12.4.2 install --frozen-lockfile
```

Tomar la conexión de **Database → producción** y pasarla solo a los comandos del backfill. El backfill del workspace no completa los datos de producción. No ejecutar `db:migrate` contra producción ni guardar la conexión en archivos, capturas o registros. En una Shell Bash, ingresarla sin mostrarla ni escribirla en el historial:

```bash
read -r -s -p "Conexión de producción: " BG_PRODUCTION_DATABASE_URL
```

Ejecutar uno por uno, siempre contra esa conexión; la variable del comando tiene prioridad sobre la configuración local:

```bash
DATABASE_URL="$BG_PRODUCTION_DATABASE_URL" pnpm bg:backfill --dry-run
```

```bash
DATABASE_URL="$BG_PRODUCTION_DATABASE_URL" pnpm bg:backfill --logo public/brand/vector-bikes-logo.png
```

```bash
DATABASE_URL="$BG_PRODUCTION_DATABASE_URL" pnpm bg:backfill --dry-run
```

Las tres corridas deben salir 0 y la última debe imprimir **`"pending":0`**. La primera puede mostrar pendientes: no escribe ni sube el logo. La escritura enlaza la sucursal y las siete tablas de reserva con el primer taller, en una transacción; sube el logo antes de escribir y lo elimina si falla la transacción. Si ya existe `logo_key`, no vuelve a subirlo. El script es idempotente.

Códigos de salida: **0** correcto, **1** estado ambiguo o pendientes después de escribir, **2** uso inválido, conexión o error inesperado. Ante cualquier salida distinta de 0 o pendientes en la última corrida, detenerse, conservar el cierre del taller y revisar con la coordinadora. No publicar `bg-08` hasta resolverlo.

## Pasos en Replit

**Recién después de completar el backfill de producción con `"pending":0`, publicar `bg-08`.** Confirmar nuevamente la etiqueta y el commit autorizado. No ejecutar migraciones nuevas: esta ventana solo migra datos.

Antes de publicar, según [BITACORA §2](../BITACORA.md#publicar-con-cambios-de-esquema):

```bash
rm -rf node_modules
```

Ir a **Deployments → Republish** y publicar el commit de `bg-08`. Si Replit ofrece cambios destructivos de esquema, detenerse y revisar con la coordinadora. La aplicación no migra al arrancar y la publicación no copia los datos del workspace.

## Verificación después de publicar

1. Confirmar que `/api/health` responde `{"ok":true,"db":true}` y que `/taller`, una orden existente y el formulario actual de reserva abren con sus datos.
2. Consultar `/api/disponibilidad` con `desde` igual a un día hábil futuro, `dias=1` y `modo=taller`: debe responder 200 con `{ timezone, modo, capacity, days }`, zona `America/Santiago`, capacidad 4 y bloques de 30 minutos de Vector Bikes.
3. En la reserva actual, un retiro sin comuna o con una comuna fuera de cobertura debe responder 422 `validation_error`, campo `comuna`: `Elige Vitacura o Las Condes.`. La coordinadora verifica una reserva de prueba y su aviso posterior al commit.
4. Repetir contra producción el último dry-run de la sección anterior: salida 0 y `"pending":0`. En **Database → producción**, verificar en solo lectura:

```sql
select count(*) from shops;
select count(*) from branches where shop_id is null;
select count(*) from bookings where branch_id is null;
```

Debe existir un taller y los dos conteos de filas sin alcance deben ser 0. La coordinadora registra la revisión antes de reabrir el taller y avanzar a V-BG3. Al terminar los comandos, quitar la conexión de la Shell:

```bash
unset BG_PRODUCTION_DATABASE_URL
```

Si la verificación falla, mantener cerrado el taller y revisar con la coordinadora. Ante una respuesta 500 de `/api/reservas`, republicar el deployment anterior según los criterios de aborto del blueprint. Hasta V-BG3 se puede volver al deployment de V-BG1 conservando los datos migrados; no borrar filas ni revertir la expansión del esquema.
