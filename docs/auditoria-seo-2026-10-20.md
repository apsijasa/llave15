# Auditoría SEO — vectorbikes.cl

| | |
|---|---|
| **Sitio** | https://vectorbikes.cl |
| **Fecha** | 20 de octubre de 2026 |
| **Commit auditado** | `3204567` (*feat: restyle the lookup and intake pages*) |
| **Alcance** | Auditoría completa: técnica, on-page, contenido, autoridad local |
| **Método** | Inspección externa del sitio en producción (headers HTTP, redirecciones, robots, sitemap, HTML servido, DNS, rendimiento) cruzada con el código fuente en `~/Documents/vector-bikes` |
| **Stack** | Astro SSR (`output: "server"`, adaptador Node standalone) sobre Replit → Cloud Run, Postgres, islas Preact |

---

## Resumen ejecutivo

**Estado general: técnicamente sano, comercialmente invisible.**

La base está bien hecha — HTTPS con HSTS, canonicals correctos, 404 real con `noindex`, HTML renderizado en servidor, schema `LocalBusiness` presente, TTFB de 130-240 ms, fuentes con `font-display: swap`. No hay nada roto en indexación ni contenido duplicado sin resolver.

El problema es otro: **el sitio no compite por ninguna búsqueda**. Es una interfaz de reservas, no una página que explique qué hace el taller. Y no hay forma de saber si funciona, porque no existe medición de ningún tipo.

### Los cinco hallazgos que importan

| # | Hallazgo | Impacto |
|---|---|---|
| 1 | El sitio nunca dice qué servicios hace — "mantención", "servicio", "frenos", "cambios", "ruedas" y "precio" aparecen **0 veces** | Crítico |
| 2 | Sin Search Console ni analítica — cero datos de indexación, consultas o conversión | Crítico |
| 3 | `www.vectorbikes.cl` da error de certificado (sitio caído para quien escribe "www.") | Alto |
| 4 | 8 URLs internas del sistema de taller publicadas en el sitemap | Alto |
| 5 | Cero imágenes en el sitio (`<img>` = 0) | Alto |

### Quick wins (menos de 2 horas en total)

- Sacar `/taller` del sitemap
- Agregar `Disallow: /taller` a robots.txt
- Arreglar el `www`
- Poner un `tel:` clicable
- Completar el schema con teléfono y coordenadas

---

## 1. Hallazgos técnicos

### 1.1 `www.vectorbikes.cl` rompe con error de certificado — Prioridad 1

**Evidencia.** `dig www.vectorbikes.cl` devuelve un CNAME a `vectorbikes.cl` → `34.111.179.208`, o sea el DNS resuelve. Pero `curl https://www.vectorbikes.cl` falla con `SSL_connect: SSL_ERROR_SYSCALL`: el certificado de Replit solo cubre el dominio apex.

**Impacto.** Quien escriba `www.vectorbikes.cl` (costumbre muy viva en Chile, y es lo que autocompletan algunos navegadores) ve una advertencia de seguridad del navegador, no el sitio. Es peor que un 404.

**Fix.** Agregar `www.vectorbikes.cl` como dominio personalizado adicional en Replit para que emita el certificado, y redirigir 301 al apex. Si el plan Core no lo permite, la alternativa es **eliminar el CNAME `www`** en cPanel: un dominio que no resuelve es menos dañino que uno con certificado inválido.

### 1.2 Search Console no está configurado — Prioridad 1

**Evidencia.** No hay meta `google-site-verification` en el HTML ni registro TXT de verificación en el DNS. Los TXT presentes son solo `MS=ms47588158` (Microsoft 365), el SPF de Outlook y `replit-verify`.

**Impacto.** No hay datos de qué está indexado, por qué términos aparece el sitio, qué errores de rastreo existen, ni Core Web Vitals de campo. Esta auditoría es enteramente externa precisamente por esto. Sin Search Console, nada de lo demás es medible.

**Fix.** Verificar propiedad de **dominio** (TXT en la zona de cPanel Bluehosting — cubre apex y subdominios) y enviar `https://vectorbikes.cl/sitemap-index.xml`. Aprovechar de registrar Bing Webmaster Tools, que importa la verificación de Google en dos clics.

> ⚠️ **Trampa conocida del proyecto:** al configurar Microsoft 365, cPanel reescribió la zona y se perdieron el registro A de Replit y los CNAME de Resend. Al agregar el TXT de Google, **verificar después** que el A siga en `34.111.179.208`.

### 1.3 Cero analítica propia, y un tracker de Replit en producción — Prioridad 1

**Evidencia.** 0 coincidencias de `gtag`, `googletagmanager`, `google-analytics`, `fbq`, `clarity` o `hotjar` en el HTML. Lo único que carga es `https://i.replit.com/script.js` con `data-website-id=7a3107d5-1ee2-41ee-b69c-a154774faf8c`.

**Impacto.** Doble:

1. No se puede atribuir ninguna reserva — no se sabe si llegan de Instagram, de búsqueda, del WhatsApp o escribiendo el dominio.
2. El único tracker activo es el de Replit, que envía datos de navegación de los clientes a un tercero que no reporta nada útil y que no está declarado en el aviso de privacidad.

**Fix.** GA4 con un evento `generate_lead` al confirmar reserva (el punto exacto está en la isla de reserva), distinguiendo reserva-en-taller de reserva-con-retiro como parámetro. Decidir explícitamente si el script de Replit se queda; si se queda, mencionarlo en `/privacidad`.

### 1.4 Ocho URLs internas del taller en el sitemap — Prioridad 1

**Evidencia.** `sitemap-0.xml` lista 10 URLs, de las cuales 8 son del sistema de gestión: `/taller/`, `/taller/buscar/`, `/taller/catalogo/`, `/taller/clientes/`, `/taller/clientes/nuevo/`, `/taller/ordenes/`, `/taller/recepcion/nueva/`, `/taller/usuarios/`. Todas responden **303** a `/admin/login?next=...` con 0 bytes. La causa está en `astro.config.mjs`:

```js
sitemap({
  filter: (page) => !page.includes("/admin") && !page.includes("/reservas"),
}),
```

**Impacto.** No hay filtración de datos (el guard de sesión funciona correctamente en las 8 rutas), pero se le está pidiendo a Google rastrear 8 páginas que solo devuelven redirecciones a un login. En Search Console van a aparecer como "Página con redirección" y ensucian el informe de cobertura justo cuando se empiece a usar. También publica la estructura interna del sistema de gestión.

**Fix.** Cambiar a lista blanca, que es a prueba de futuro — cada página nueva del taller queda fuera por defecto:

```js
sitemap({
  filter: (page) => ["/", "/privacidad/"].includes(new URL(page).pathname),
}),
```

Y en `public/robots.txt` agregar las rutas privadas que faltan:

```
Disallow: /taller
Disallow: /aprobacion
Disallow: /informe
```

`/aprobacion/[token]` e `/informe/[token]` no están en el sitemap porque son rutas dinámicas SSR, pero son enlaces que se envían por correo a clientes y no conviene que terminen rastreados.

### 1.5 Sin compresión gzip ni brotli — Prioridad 2

**Evidencia.** Pidiendo `Accept-Encoding: gzip, deflate, br`, tanto el HTML (20.581 bytes) como el CSS (23.949 bytes) llegan sin cabecera `content-encoding` y con el tamaño completo. El servidor es `node dist/server/entry.mjs` (adaptador standalone de Astro, sin middleware de compresión) detrás de Cloud Run, que no comprime por su cuenta.

**Impacto.** ~44 KB transferidos donde deberían ir ~10 KB. En 4G de Santiago son unos 200-300 ms de LCP regalados.

**Fix.** Envolver el handler de Astro con compresión. El caché de assets ya está correcto (`max-age=31536000, immutable` en `/_astro/*`), así que esto es lo único pendiente del lado de transferencia.

### 1.6 El logo de 180 KB hace tres trabajos para los que no sirve — Prioridad 2

**Evidencia.** `public/brand/vector-bikes-logo.png` pesa 180.172 bytes y está declarado como `rel="icon" type="image/png"`, como `apple-touch-icon` y como `og:image`.

**Impacto.** 180 KB descargados como favicon en cada visita sin caché compartido; y en WhatsApp —por donde se va a compartir el taller— la vista previa muestra un logo estirado en vez de una foto del trabajo.

**Fix.** Favicon de 32×32, apple-touch-icon de 180×180, y una imagen OG de 1200×630 con una foto real del taller. `sharp` ya está como dependencia.

### 1.7 Sin preload de las fuentes críticas — Prioridad 3

Las tres familias están self-hosted vía `@fontsource` con `font-display: swap` y subsetting por `unicode-range` — todo correcto. Falta solo precargar el `woff2` latino de Archivo (cuerpo) y Michroma (el H1), porque hoy el navegador los descubre recién al parsear el CSS. Un `<link rel="preload">` en `Base.astro` recorta el swap visible del título.

### 1.8 Lo que está bien y no hay que tocar

| Verificado | Resultado |
|---|---|
| HTTPS + HSTS | `max-age=63072000; includeSubDomains` ✓ |
| `http://` → `https://` | 301 ✓ |
| 404 | HTTP 404 real, `noindex`, canonical a `/404`, con salida al inicio ✓ |
| Duplicados `/privacidad` vs `/privacidad/` vs `/index.html` | los tres canonicalizan a la URL correcta ✓ |
| robots.txt | sintaxis válida, referencia al sitemap correcta ✓ |
| `/admin` y `/reservas/cancelar` | bloqueados en robots y protegidos en servidor ✓ |
| `lang="es-CL"`, viewport, `color-scheme` | ✓ |
| Jerarquía de encabezados | 1 H1, sin saltos de nivel ✓ |
| Schema en HTML servido | JSON-LD renderizado en servidor, Google lo ve sin ejecutar JS ✓ |
| TTFB | 130-240 ms ✓ |
| Caché de assets con hash | `max-age=31536000, immutable` ✓ |
| Accesibilidad básica | skip link, `aria-label` en nav y enlaces, 9 `<label>` para 7 `<input>` ✓ |

---

## 2. Hallazgos on-page

### 2.1 El H1 no dice qué eres ni dónde estás — Prioridad 1

**Actual:** `<h1>Mecánica de precisión.</h1>`

**Impacto.** Es una buena línea de marca y un mal H1: no contiene el servicio ni la comuna. El dato de ubicación vive en un `<span class="label">` encima, que no pesa como señal.

**Fix.** Conservar el tono y agregar la entidad. Por ejemplo: `Mecánica de precisión para tu bicicleta en Vitacura`. Mantiene el ritmo de la frase y gana el término local.

### 2.2 El title no contiene "taller" — Prioridad 2

**Actual:** `Vector Bikes — Mecánica de bicicletas en Vitacura` (48 caracteres, largo correcto)

**Impacto.** "taller de bicicletas" es la forma en que la gente busca esto en Chile; "mecánica de bicicletas" es cómo lo describe el oficio. Hoy se cubre la segunda. La palabra "taller" sí aparece 7 veces en el cuerpo, así que el tema no está ausente — pero no está en el elemento que más pesa.

**Fix.** `Taller de bicicletas en Vitacura | Mecánica Vector Bikes` (56 caracteres). Cubre ambos términos y deja la marca al final.

### 2.3 No hay un solo teléfono clicable — Prioridad 1

**Evidencia.** Cero coincidencias de `tel:` en todo el código público. El único contacto telefónico es el botón flotante a `wa.me/56985095780`.

**Impacto.** En móvil —de donde va a venir la mayoría del tráfico— un `tel:` convierte mucho mejor que un formulario para el cliente que tiene una duda antes de reservar. La ausencia de teléfono es, además, la causa del hallazgo 2.4.

**Fix.** Número en el bloque "Taller" como `<a href="tel:+56985095780">`, y el mismo número en el schema.

### 2.4 El schema `LocalBusiness` está incompleto — Prioridad 2

Lo que ya está correcto: nombre, URL, imagen, email, `PostalAddress` completa, `openingHoursSpecification` con los dos tramos horarios, y `sameAs` a Instagram.

Lo que falta:

| Campo | Por qué importa |
|---|---|
| `telephone` | El campo más consultado de un negocio local. Hoy no está en ninguna parte. |
| `geo` (lat/lon) | Ancla el negocio a un punto, no solo a una calle. |
| `areaServed` | Declara Vitacura y Las Condes, que es exactamente la cobertura de retiro. |
| `priceRange` | Google lo muestra en el panel local. |
| `hasOfferCatalog` / `makesOffer` | Los servicios con sus precios, legibles por máquina. |
| `@id` | Identificador estable para unir el sitio con la ficha de Google. |
| `@type` | `BicycleStore` es más específico que `LocalBusiness` y ambos son válidos. |

Falta además un bloque aparte: **`FAQPage` sobre las 5 preguntas que ya están escritas** en la sección "Preguntas".

> **Expectativa realista:** desde agosto de 2023 Google dejó de mostrar resultados enriquecidos de FAQ para sitios que no son de gobierno o salud, así que **no va a aparecer el acordeón en el buscador**. El valor hoy es que ChatGPT, Perplexity y los resúmenes con IA de Google leen ese marcado para responder preguntas como "¿hasta dónde llega el retiro a domicilio de Vector Bikes?". Para un negocio nuevo sin reseñas, ese canal pesa.

### 2.5 El sitio no tiene ni una imagen — Prioridad 1

**Evidencia.** `<img>` = **0** en el HTML. `public/` contiene exactamente tres archivos: el logo PNG, el favicon SVG y robots.txt.

**Impacto.** Tres pérdidas a la vez:

1. Nadie ve el taller antes de dejar su bicicleta ahí, y una bicicleta cuesta más que una cena — la foto es la prueba.
2. No hay presencia en Google Imágenes.
3. Cuando se cree la ficha de Google Business, las fotos son el factor que más mueve las llamadas, y no hay ninguna producida.

**Fix.** 6-8 fotos reales, con nombres de archivo descriptivos (`taller-bicicletas-vitacura-banco-trabajo.jpg`, no `IMG_4821.jpg`), `alt` que describa la escena, WebP vía `sharp`, `width`/`height` declarados para no introducir CLS, y `loading="lazy"` salvo la primera.

### 2.6 Menores

- **H2 usado como estilo:** el "Taller" de la sección (`<h2 class="label">`) es un rótulo visual, no un encabezado de contenido, y queda compitiendo con el H2 real de esa sección. Pasarlo a `<p>` o `<span>`.
- **`twitter:card` = `summary`:** con una imagen OG propia conviene `summary_large_image`.
- **Un solo enlace interno real:** `/privacidad`. No es un defecto en sí, es el síntoma de que no hay páginas a las que enlazar (ver sección 3).
- **Sin `<noscript>`:** la isla de reserva hidrata con `client:visible`, así que sin JavaScript no hay forma de reservar. El botón de WhatsApp sí funciona sin JS, lo que salva el caso. Un `<noscript>` con el teléfono y el WhatsApp cierra el hueco.

---

## 3. Hallazgos de contenido — el problema de fondo

### 3.1 El sitio explica cómo reservar, no qué hace el taller

Conteo sobre el texto visible de la home (617 palabras en total):

| Término | Veces |
|---|---|
| reserva | 16 |
| Vitacura | 9 |
| bicicleta | 8 |
| taller | 7 |
| Las Condes | 4 |
| mecánica | 2 |
| **mantención** | **0** |
| **servicio** | **0** |
| **frenos** | **0** |
| **cambios** | **0** |
| **ruedas** | **0** |
| **precio** | **0** |

Esa tabla es la auditoría entera en un solo cuadro. La página está construida alrededor del verbo "reservar" —que es lo que había que resolver cuando se hizo, y lo resuelve bien— pero **no contiene el vocabulario con el que la gente busca un taller de bicicletas**. No se puede rankear para "mantención de bicicletas Vitacura" una página que nunca escribe la palabra "mantención".

Único precio publicado: los $15.000 del retiro a domicilio. Nada sobre el costo de una mantención, que es la búsqueda de mayor intención comercial del rubro.

### 3.2 Una sola página pública contra competidores con páginas dedicadas

El repo tiene 43 rutas, pero el sitio público es **1 landing + 1 aviso de privacidad**. Todo lo demás es el sistema de gestión. La competencia en la misma comuna juega con páginas específicas por servicio y por ubicación:

| Competidor | URL |
|---|---|
| Taller Cletero | `tallercletero.cl/taller-de-bicicletas-vitacura/` |
| Wild Sty | `wildsty.com/servicio-tecnico-vitacura-bicicletas` |
| Pro Riders | `proriders.cl/pages/taller-proriders` — "Servicio Técnico o Taller Especializado en Bicicletas en Vitacura" |
| Rock and Road | `rockandroad.cl/pages/servicios-taller` |

El patrón es inequívoco: **servicio + comuna en la URL, el title y el H1**. Vector Bikes tiene cero URLs de ese tipo.

*Nota de método:* se intentó abrir las páginas de Taller Cletero y Pro Riders para comparar precios y estructura; la primera devolvió HTTP 522 y el dominio de la segunda no resolvió. La comparación se queda en el patrón de URLs, que es lo relevante para la recomendación.

### 3.3 Señales E-E-A-T flojas donde más se necesitan

Lo básico de confianza está: HTTPS, dirección física real, correo del dominio, aviso de privacidad, horarios explícitos, y una política de aprobación de trabajos extra que es honesta y tranquilizadora ("te llamamos antes de hacer cualquier trabajo que no estaba en tu descripción").

Lo que falta es la parte de *experiencia* y *expertise*, que en un oficio manual es lo que decide:

- **No hay persona.** Nadie firma el trabajo. La formación en mecánica profesional de bicicletas es exactamente la credencial que el cliente quiere leer antes de dejar una bicicleta de $2 millones, y no aparece en ninguna parte.
- **No hay reseñas.** Sin ficha de Google no hay dónde acumularlas. Para un taller nuevo, las primeras 10 reseñas valen más que cualquier cambio en el sitio.
- **No hay evidencia del trabajo.** Ni fotos, ni un antes/después, ni qué herramientas se usan, ni qué marcas se atienden.

### 3.4 Google Business Profile: la pieza que falta, y no es el sitio web

No fue posible verificar desde el entorno de auditoría si la ficha existe (el buscador disponible devuelve resultados de EE.UU., no el SERP chileno ni el paquete local). Pero el dato duro es este: para "taller de bicicletas Vitacura", Google muestra el mapa con tres fichas **arriba** de los resultados orgánicos. Si la ficha no existe, no hay presencia ahí, y ahí se decide la mayoría de estas búsquedas.

Si todavía no existe, esa es la acción de mayor retorno de toda esta auditoría — por encima de cualquier cambio en el código.

---

## 4. Plan de acción priorizado

### Semana 1 — medir y desbloquear

*Nada de esto es contenido; todo es destrabar.*

- [ ] 1. Crear o reclamar la **ficha de Google Business Profile**: Av. Kennedy 7666, categoría "Taller de reparación de bicicletas", horarios, teléfono y fotos. Pedir reseña a los primeros clientes reales.
- [ ] 2. Verificar el dominio en **Search Console** (TXT en cPanel) y enviar el sitemap. Revisar después que el registro A siga intacto.
- [ ] 3. Instalar **GA4** con evento de reserva confirmada.
- [ ] 4. Arreglar el **www** (dominio adicional en Replit con 301 al apex, o eliminar el CNAME).
- [ ] 5. Sacar `/taller` del **sitemap** (filtro de lista blanca) y agregar los `Disallow` faltantes en robots.

### Semana 2 — on-page

- [ ] 6. H1 y title con "taller de bicicletas" + "Vitacura".
- [ ] 7. Teléfono `tel:` visible y schema completo (`telephone`, `geo`, `areaServed`, `priceRange`, `@id`, `@type: BicycleStore`) + bloque `FAQPage`.
- [ ] 8. Sesión de fotos del taller: 6-8 imágenes, nombres descriptivos, `alt`, WebP, dimensiones declaradas. Con una de ellas, generar la imagen OG de 1200×630.

### Semanas 3-4 — contenido (el cuello de botella real)

- [ ] 9. Sección o página de **servicios con precios**: mantención básica, ajuste de cambios, sangrado de frenos, centrado de ruedas, cambio de transmisión. Cada uno con qué incluye, cuánto demora y cuánto cuesta.
- [ ] 10. Dos o tres **páginas de servicio** con URL propia (`/mantencion-de-bicicletas`, `/servicio-de-frenos`), enlazadas desde la landing.
- [ ] 11. Una página **`/retiro-de-bicicletas-las-condes`**: ya se da el servicio ahí y hoy "Las Condes" aparece 4 veces sin ninguna página que lo capture.
- [ ] 12. Un párrafo **"quién arregla tu bicicleta"** con formación y criterio de trabajo.

### Después — rendimiento y pulido

- [ ] 13. Compresión gzip/brotli en el servidor Node.
- [ ] 14. Favicon y apple-touch-icon en el tamaño correcto; dejar de usar el PNG de 180 KB.
- [ ] 15. `preload` de los woff2 latinos de Archivo y Michroma.
- [ ] 16. `<noscript>` con teléfono y WhatsApp.

---

## 5. Dos hallazgos fuera del alcance SEO

### 5.1 El repositorio de GitHub es público

`api.github.com/repos/apsijasa/vector-bikes` devuelve `"private": false`, y es el **primer resultado** al buscar "Vector Bikes" — le gana al propio sitio en su propia marca. En los registros del proyecto figuraba como privado, así que esto cambió en algún momento.

**No hay secretos expuestos.** Verificado: `.gitignore` excluye `.env` y `.env.*`, no hay ningún `.env` real en HEAD ni en el historial, y las únicas cadenas con pinta de credencial son `postgres://postgres:postgres@127.0.0.1:5432/vector_bikes`, que son valores por defecto de desarrollo local.

Lo que sí publica el repo es la arquitectura completa: la ruta `/admin/login`, la lógica de límite por IP, la configuración de Turnstile y el README con el estado de producción. No es una vulnerabilidad, es reconocimiento gratis para quien quiera buscarle el lado. Si se deja público, vale al menos sacar del README las rutas internas y el detalle de defensas.

### 5.2 La credencial de la base de producción sigue sin rotar

Pendiente desde el 16-09-2026, descartada por decisión del dueño. Se menciona solo porque el repo público cambia un poco el cálculo: la credencial no está en el código, pero sí está en el historial de un chat.

---

## 6. Límites de esta auditoría

| No cubierto | Razón | Cómo se destraba |
|---|---|---|
| **Core Web Vitals** (laboratorio y campo) | La API de PageSpeed sin clave devolvió cuota agotada; los datos de campo requieren Search Console | Punto 2 del plan, o una clave de PageSpeed API |
| **Posiciones reales y paquete local** | El buscador del entorno devuelve resultados de EE.UU., no el SERP chileno | Punto 2 del plan (informe de rendimiento de GSC) |
| **Existencia de la ficha de Google Business** | Misma razón anterior | Verificación manual en Google Maps |
| **Contraste de color y a11y de render** | Requiere renderizar la página en un navegador | Lighthouse local o la extensión de Chrome |

**Lo que sí quedó verificado con certeza:** el JSON-LD viene renderizado en servidor, así que no hizo falta ejecutar JavaScript para confirmar el schema. (El marcado inyectado por cliente no es detectable con `curl` ni `WebFetch`; acá no aplicó esa limitación.)

---

## Anexo — comandos de verificación

Para reproducir los hallazgos técnicos:

```bash
# Headers, HSTS, caché
curl -sSI https://vectorbikes.cl

# Redirecciones y www
curl -sS -o /dev/null -w '%{http_code} -> %{redirect_url}\n' http://vectorbikes.cl
curl -sS https://www.vectorbikes.cl          # falla con SSL_ERROR
dig +short www.vectorbikes.cl

# Robots y sitemap
curl -sS https://vectorbikes.cl/robots.txt
curl -sS https://vectorbikes.cl/sitemap-0.xml

# Rutas internas en el sitemap (todas 303 al login)
for p in /taller/ /taller/clientes/ /taller/ordenes/; do
  curl -sS -o /dev/null -w "$p HTTP %{http_code} -> %{redirect_url}\n" "https://vectorbikes.cl$p"
done

# Compresión (no hay content-encoding en la respuesta)
curl -sS -D - -o /dev/null -H 'Accept-Encoding: gzip, deflate, br' \
  https://vectorbikes.cl/_astro/Base.BylQxKbQ.css | grep -i 'content-encoding\|cache-control'

# Verificación de Search Console (sin resultados)
dig +short vectorbikes.cl TXT | grep -i google
curl -sS https://vectorbikes.cl | grep -o 'google-site-verification'

# Analítica (0 coincidencias) e imágenes (0 etiquetas)
curl -sS https://vectorbikes.cl | grep -ciE 'gtag|googletagmanager|google-analytics'
curl -sS https://vectorbikes.cl | grep -c '<img'
```
