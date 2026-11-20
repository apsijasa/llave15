# Dar de alta un taller en Llave 15

Paso a paso para sumar un taller nuevo a la plataforma. Lo hace el administrador de plataforma, Andrés, desde `/plataforma`. Un taller nunca se borra: si deja de usar Llave 15, se suspende.

## Antes de dar de alta

- [ ] **Términos con el taller firmados.** Se acuerda quién es responsable de los datos de sus clientes (Ley 19.628 y Ley 21.719), el soporte y las condiciones de uso (FASE §7). Es trabajo legal, no de código, y es obligatorio antes del segundo taller real.
- [ ] **Aviso de privacidad del taller.** La página `/<slug>/privacidad` usa el correo del perfil del taller. Hay que revisar con el taller que el texto le sirva.
- [ ] **Datos del taller a mano:**
  - nombre, dirección completa y corta, comuna y región;
  - correo público y correo de avisos;
  - teléfono en formato `+569XXXXXXXX` y cómo se muestra;
  - horarios de recepción y de retiro;
  - bicis por día, minutos por bloque, antelación mínima y días hacia adelante;
  - comunas y tarifa de retiro, si ofrece retiro.
- [ ] **Dirección de reservas (`slug`) y prefijo de códigos acordados.** El `slug` va en minúsculas sin tildes, con guiones entre palabras y entre 3 y 40 caracteres (por ejemplo `taller-ejemplo`), y no puede ser una palabra reservada. El prefijo tiene de 2 a 4 letras mayúsculas (por ejemplo `TE`). **Ninguno de los dos se puede cambiar después.**
- [ ] **Correo del primer dueño.** No puede estar usado en otro taller: una persona tiene una sola cuenta en la plataforma.
- [ ] **Tu usuario tiene la marca de plataforma.** Si no la tiene, corre en el Shell del Replit:

  ```bash
  pnpm platform:admin <tu-correo>
  ```

  El comando revoca tus sesiones abiertas, así que tienes que volver a entrar. Para quitar la marca: `pnpm platform:admin <correo> --off`.

## Alta en /plataforma

1. Entra a `/plataforma` y toca **Crear taller**.
2. Completa el perfil, las reservas, los horarios y el retiro. En los días cerrados, deja vacíos los dos campos.
3. En **Primer dueño y catálogo**, completa:
   - el nombre y el correo del dueño;
   - una clave inicial de al menos 12 caracteres;
   - el taller desde el que se copia el catálogo de servicios y precios, normalmente Vector Bikes.
4. Toca **Crear taller**. En una sola operación se crean:
   - el taller `activo`;
   - su sucursal;
   - el usuario dueño;
   - la copia del catálogo.

   Si algún campo no sirve, la página lo marca y no escribe nada.
5. El taller nuevo aparece en la lista de `/plataforma` con sus conteos en cero.

## Primer ingreso del dueño

1. Entrégale al dueño la dirección `https://llave15.cl/admin/login`, su correo y la clave inicial, por un canal seguro. Nunca por el mismo mensaje que el correo.
2. El dueño entra y ve solo su taller.
3. En **Mi taller**, el dueño revisa sus datos, horarios, retiro y correo de avisos, y sube su logo: JPG o PNG de hasta 2 MB.
4. En **Usuarios**, crea las cuentas de su equipo: administración, recepción y mecánicos.
5. En **Catálogo**, ajusta los servicios y precios copiados.

## Verificación

- [ ] `pnpm bg:check` contra producción, desde el Shell del Replit, sale 0: ningún cruce de sucursal y cada taller activo con una sola sucursal.
- [ ] `https://llave15.cl/<slug>/reservar` muestra el nombre o el logo del taller, sus comunas y sus bloques. Comprueba también que no aparezca nada de Vector Bikes.
- [ ] Una reserva de prueba llega con el código del prefijo nuevo y el correo de confirmación sale con el remitente `<Taller> · Llave 15`. Cancélala desde el enlace del correo.
- [ ] El dueño ve en `/taller` solo sus órdenes, reservas y clientes. Vector Bikes no ve nada del taller nuevo.
- [ ] Al día siguiente, las tareas de Make.com responden `ok: true` e incluyen al taller nuevo.

Para suspender un taller, abre su fila en `/plataforma` y toca **Suspender**. Se cierran las sesiones de sus usuarios, se bloquea su ingreso, su página de reservas responde 404 y las tareas lo omiten. **Reactivar** lo devuelve tal cual.
