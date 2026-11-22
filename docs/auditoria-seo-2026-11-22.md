# Auditoría SEO — vectorbikes.cl

| | |
|---|---|
| **Sitio** | https://vectorbikes.cl |
| **Fecha** | 22 de noviembre de 2026 |
| **Alcance** | Técnica + on-page, con el impacto cruzado del dominio `llave15.cl` |
| **Método** | Inspección externa del sitio en producción (headers HTTP, redirecciones, robots, sitemap, HTML servido, DNS, tiempos de respuesta, peso de recursos) cruzada con el código fuente en GitHub (`apsijasa/vector-bikes`, desplegado el 22-11 a las 14:53 UTC) |
| **Stack** | Astro 7.3.2 SSR (`output: "server"`, adaptador Node standalone) sobre Replit → Cloud Run, Postgres, islas Preact |
| **Limitación** | Sin Search Console: no hay datos de indexación, consultas ni Core Web Vitals de campo. La API de PageSpeed Insights devolvió cuota agotada, así que el rendimiento se midió con `curl` (TTFB y peso), no con Lighthouse. |
| **Auditoría anterior** | [`auditoria-seo-2026-10-20.md`](./auditoria-seo-2026-10-20.md) |

---

## Resumen ejecutivo

**Estado general: técnicamente sano, comercialmente invisible.** El diagnóstico de octubre sigue vigente.

La base está bien hecha: HTTPS con HSTS de 2 años, canonical correcto en el dominio principal, sitemap limpio de 2 URLs, TTFB de 100-290 ms, 94 KB de peso total referenciado en el HTML, assets con `max-age=31536000, immutable`, fuentes críticas con `preload`, schema `LocalBusiness` + `FAQPage`, y un `lang="es-CL"` correcto.

Los dos problemas de fondo no se han movido desde octubre:

1. **El sitio no compite por ninguna búsqueda.** Es una interfaz de reserva, no una página que explique qué hace el taller.
2. **No hay medición de ningún tipo.** Sin Search Console no se puede saber si el sitio está indexado, y esta auditoría es externa precisamente por eso.

Y hay un problema nuevo: el refactor multi-tenant de **Llave 15** (BG-D52, desplegado hoy) puso dos dominios sobre la misma app Astro, pero la configuración de SEO sigue siendo de un solo dominio. `llave15.cl` está sirviendo el `robots.txt`, el sitemap y los canonicals de `vectorbikes.cl`.

### Los cinco hallazgos que importan

| # | Hallazgo | Impacto |
|---|---|---|
| 1 | Sin Search Console ni analítica propia; el único tracker es el de Replit | Crítico |
| 2 | El sitio nunca dice qué servicios hace ni cuánto cuestan — `mantención`, `servicio`, `frenos`, `precio` aparecen **0 veces** | Crítico |
| 3 | `llave15.cl` sirve el `robots.txt` y el sitemap de `vectorbikes.cl`, y emite canonicals cruzados | Crítico |
| 4 | La página de reserva de cada taller es indexable, sin canonical y sin `noindex` | Alto |
| 5 | Sigue sin compresión gzip/brotli y sin una sola imagen en el sitio | Alto |

### Qué cambió desde el 20 de octubre

| Hallazgo de octubre | Estado hoy |
|---|---|
| `www.vectorbikes.cl` con error de certificado | **Cerrado** — responde 200 con canonical al apex |
| 8 URLs de `/taller` en el sitemap | **Cerrado** — lista blanca en `astro.config.mjs`, 2 URLs |
| Logo de 180 KB usado como favicon | **Cerrado** — `favicon-32.png` (0,9 KB) + `apple-touch-icon.png` (7 KB) |
| Sin `preload` de fuentes críticas | **Cerrado** — 2 woff2 con `preload` |
| Caché de assets | **Correcto** — `max-age=31536000, immutable` (verificado con GET, no con HEAD) |
| Sin Search Console ni analítica | **Abierto** |
| Sin compresión gzip/brotli | **Abierto** |
| Cero imágenes | **Abierto** |
| El sitio no dice qué servicios hace | **Abierto — es el hallazgo #1** |

---

## 1. Prioridad 1 — bloquean resultados

### 1.1 Sin Search Console ni analítica propia

**Evidencia.** Cero coincidencias de `google-site-verification` en el HTML servido y ningún registro TXT de Google en la zona DNS. El único script externo que carga la home es:

```html
<script src="https://i.replit.com/script.js" async data-website-id="2a8213db-5a13-4766-9b25-6fbccf90d6a2">
```

Cero coincidencias de `gtag`, `googletagmanager`, `google-analytics`, `fbq`, `clarity` o `hotjar`.

**Impacto.** Doble:

1. No se sabe si el sitio está indexado, por qué términos aparece, qué errores de rastreo tiene, ni los Core Web Vitals de campo. **No fue posible confirmar la indexación desde fuera** — el buscador disponible no soporta el operador `site:` de forma fiable. Sin Search Console no hay otra fuente.
2. No se puede atribuir ninguna reserva. No se sabe si los clientes llegan de Instagram, de búsqueda, del WhatsApp o escribiendo el dominio. El único tracker activo manda datos de navegación de los clientes a un tercero que no reporta nada útil y que no está declarado en `/privacidad`.

**Fix.** Verificar propiedad de **dominio** por TXT en la zona de cPanel (cubre apex y subdominios) y enviar `https://vectorbikes.cl/sitemap-index.xml`. Registrar también Bing Webmaster Tools, que importa la verificación de Google en dos clics. GA4 con un evento `generate_lead` al confirmar reserva, con la modalidad (taller / retiro a domicilio) como parámetro. Decidir explícitamente si el script de Replit se queda; si se queda, declararlo en `/privacidad`.

> ⚠️ **Trampa conocida del proyecto:** al configurar Microsoft 365, cPanel reescribió la zona y se perdieron el registro A de Replit y los CNAME de Resend. Al agregar el TXT de Google, **verificar después** que el A siga en `34.111.179.208`.

### 1.2 El sitio no dice qué hace ni cuánto cuesta

**Evidencia.** 436 palabras de texto visible en la home. Conteo de términos en ese texto:

| Término | Apariciones |
|---|---|
| `mantención` / `mantenimiento` | 0 |
| `servicio` | 0 |
| `reparación` | 0 |
| `frenos` | 0 |
| `cambios` / `transmisión` | 0 |
| `rueda` | 0 |
| `suspensión` | 0 |
| `precio` / `desde $` | 0 |
| `ruta` / `MTB` / `gravel` / `eléctrica` | 0 |
| `taller de bicicletas` | 1 |
| `Vitacura` | 5 |
| `reserva` | 11 |

El `<title>` (56 caracteres) y la meta description (148 caracteres) están bien escritos y bien dimensionados. El problema es el cuerpo: la página explica *cómo funciona el proceso de reserva*, no *qué le hacemos a tu bicicleta*.

**Impacto.** Crítico. Nadie busca "reservar bloque de 30 minutos". Buscan "mantención bicicleta Vitacura", "cambio de frenos bicicleta Santiago", "centrado de ruedas", "servicio bicicleta eléctrica". El sitio no tiene una sola página que pueda rankear para ninguna de esas consultas, y los competidores directos de la comuna (Rock & Road, Wildsty, Dark Bikes Workshop, Rayobike) sí tienen páginas de servicios con precios.

**Fix.** 4-6 páginas de servicio, una por intención de búsqueda:

| URL | Keyword objetivo |
|---|---|
| `/mantencion-de-bicicletas` | mantención bicicleta Vitacura |
| `/frenos-y-transmision` | cambio de frenos / ajuste de cambios bicicleta |
| `/ruedas-y-centrado` | centrado de ruedas bicicleta Santiago |
| `/suspension` | mantención de suspensión MTB |
| `/bicicleta-electrica` | taller bicicleta eléctrica Vitacura |
| `/retiro-a-domicilio` | retiro de bicicleta a domicilio Las Condes |

Cada una con: qué incluye, cuánto demora, **precio desde**, para qué tipo de bicicleta, y el CTA a reserva. Sumarlas a la lista blanca del sitemap. Esto es el trabajo que mueve la aguja; todo lo demás de esta auditoría es infraestructura para que esto funcione.

### 1.3 `llave15.cl` sirve el `robots.txt` y el sitemap de `vectorbikes.cl`

**Evidencia.** Los dos dominios resuelven al mismo `34.111.179.208` y corren la misma app. `public/robots.txt` es un archivo estático con el sitemap hardcodeado:

```
Sitemap: https://vectorbikes.cl/sitemap-index.xml
```

Resultado medido:

- `https://llave15.cl/robots.txt` → **idéntico** al de vectorbikes.cl, incluido el `Sitemap:` que apunta al otro dominio.
- `https://llave15.cl/sitemap-index.xml` → responde 200 y declara `https://vectorbikes.cl/sitemap-0.xml`.
- `https://llave15.cl/vector-bikes` (404) → emite `<link rel="canonical" href="https://vectorbikes.cl/404">`.

La causa está en que `site` en `astro.config.mjs` es un único `PUBLIC_SITE_URL`, y `src/layouts/Base.astro` construye el canonical desde ahí sin mirar el host de la petición:

```astro
const canonical = new URL(path, Astro.site).href;
```

**Impacto.** Crítico. A un rastreador que entra por `llave15.cl` se le está diciendo que el sitemap de ese sitio vive en otro dominio, y que una de sus páginas es canónicamente una página de error del otro dominio. Es la clase de señal cruzada que hace que Google consolide mal los dos sitios, justo cuando Llave 15 empieza a necesitar su propio posicionamiento como producto.

**Fix.** Ver §4.1 y §4.2.

### 1.4 La página de reserva de cada taller es indexable y sin canonical

**Evidencia.**

| URL | Estado | `robots` meta | canonical |
|---|---|---|---|
| `llave15.cl/` | 200 | — | — |
| `llave15.cl/demo` | 200 | — | — |
| `llave15.cl/vector-bikes/reservar` | 200 | — | — |
| `llave15.cl/vector-bikes/privacidad` | 200 | `noindex` | — |

`src/layouts/AppLayout.astro` acepta una prop `noindex` y nunca emite canonical. La página de privacidad del tenant la usa; la de reserva no.

**Impacto.** Alto. `llave15.cl/vector-bikes/reservar` tiene `<title>Reservar — Vector Bikes</title>` y es rastreable: una página de app, en otro dominio, compitiendo por la propia marca del taller. Multiplicado por cada taller que entre a la plataforma, es un conjunto de páginas casi idénticas que diluyen todo.

**Fix.** `noindex` en todas las rutas `/[slug]/*`, y canonical propio para las páginas comerciales de Llave 15 (`/`, `/demo`, `/aviso-de-privacidad`), que sí deben posicionar. Ver §4.2 y §4.3.

---

## 2. Prioridad 2 — alto impacto

### 2.1 Sin compresión gzip ni brotli (abierto desde octubre)

**Evidencia.** Pidiendo `Accept-Encoding: gzip, deflate, br`, ni el HTML ni el CSS devuelven cabecera `content-encoding`:

| Recurso | Tamaño servido |
|---|---|
| HTML de la home | 12,3 KB |
| `/_astro/SiteLayout.*.css` | 21,9 KB |

El servidor es `node dist/server/entry.mjs` (adaptador standalone de Astro, sin middleware de compresión) detrás de Cloud Run, que no comprime por su cuenta.

**Impacto.** ~34 KB transferidos donde irían ~9 KB. En 4G son 200-300 ms de LCP regalados, en el único punto donde el sitio hoy está bien.

**Fix.** Ver §4.5. Es el cambio más invasivo de la lista porque toca el arranque del servidor.

### 2.2 Cero imágenes

**Evidencia.** `<img>` = 0 en la home. Solo 3 `<svg>` inline (los iconos del pie).

**Impacto.** Alto, y doble: no hay presencia posible en Google Imágenes, y falta la señal de "negocio real, con taller real y trabajo real" que Google pesa en resultados locales. Para un taller de bicicletas, las fotos del trabajo son además el activo de conversión más obvio que existe.

**Fix.** 6-10 fotos reales: el banco de trabajo, la fachada en Kennedy 7666, bicicletas en reparación, el detalle de un trabajo bien hecho. Con `alt` descriptivo, `width`/`height` declarados, `loading="lazy"` salvo la primera, y en WebP. `sharp` ya está en dependencias.

### 2.3 La imagen Open Graph es el logo cuadrado

**Evidencia.** `og:image` apunta a `/brand/vector-bikes-logo.png`: **1254 × 1254 px, 176 KB, ratio 1:1**. Faltan `og:image:width`, `og:image:height` y `twitter:image`, y `twitter:card` es `summary` en vez de `summary_large_image`.

**Impacto.** Alto por el canal: el taller se comparte por WhatsApp, donde la vista previa es la primera impresión. Hoy se ve un logo recortado en vez de una foto del taller.

**Fix.** Imagen de 1200 × 630 px con una foto real + el logo encima, generada con `sharp`. Ver §4.4.

### 2.4 Schema `LocalBusiness` incompleto

**Evidencia.** El JSON-LD de la home trae un `@graph` con `LocalBusiness` + `FAQPage` (5 preguntas). Presente y correcto: `name`, `url`, `image`, `email`, `telephone`, `areaServed` (Vitacura, Las Condes), `address` completo, `openingHoursSpecification` (Lun-Vie 15:00-20:00, Sáb 10:00-14:00) y `sameAs` de Instagram.

Falta:

| Propiedad | Por qué importa |
|---|---|
| `@type` específico | `BicycleStore` existe en schema.org y es más preciso que `LocalBusiness` genérico |
| `geo` | coordenadas; es lo que conecta el negocio con el mapa |
| `priceRange` | Google lo muestra en el panel local |
| `hasMap` | ya tienes la URL de Maps en el pie, no está en el schema |
| `@id` | identificador estable para referenciar el negocio entre entidades |
| `logo` | hoy solo hay `image` |
| `sameAs` del WhatsApp y del perfil de Google | consolida las señales de la misma entidad |

**Fix.** Ver §4.6.

### 2.5 El 404 de `vectorbikes.cl` no es el del proyecto

**Evidencia.** Dos comportamientos distintos, y ninguno es `src/pages/404.astro`:

| URL | Respuesta |
|---|---|
| `vectorbikes.cl/no-existe-xyz` | 404, `content-type: text/plain`, cuerpo `No encontrado` |
| `vectorbikes.cl/404` | 404, página por defecto de Astro, **en inglés** (`<html lang="en">`, `<title>404: Not Found</title>`) |
| `llave15.cl/vector-bikes` | 404, página del proyecto, con `noindex` ✅ |

`src/pages/404.astro` existe, está prerenderizada y pasa `noindex` a `Base`. En el host de Llave 15 se sirve; en el host heredado no.

**Impacto.** Bajo en SEO (el status 404 es correcto, que es lo que impide la indexación) y medio en marca: un cliente que escribe mal una URL ve texto plano o una página de error en inglés. Importa sobre todo como señal de que el enrutamiento por host quedó a medias en el refactor.

**Fix.** Grepear el string `No encontrado` en el repo para encontrar el handler que intercepta las rutas desconocidas antes de que Astro llegue a su 404 (la búsqueda de código de GitHub todavía no tenía indexado el push de hoy). Que ese handler devuelva la página 404 del proyecto, o que deje pasar la petición.

### 2.6 `www` responde 200 en vez de redirigir

**Evidencia.** `https://www.vectorbikes.cl/` responde 200 con el mismo HTML y `<link rel="canonical" href="https://vectorbikes.cl/">`.

**Impacto.** Bajo, y mejoró mucho desde octubre (ya emite certificado válido, antes era un error de seguridad del navegador). El canonical apunta bien, así que Google va a consolidar en el apex.

**Fix.** Un 301 de `www` al apex es lo correcto y evita depender del canonical.

### 2.7 `robots.txt` no cubre las rutas nuevas

**Evidencia.** El `robots.txt` actual sólo tiene `Disallow` para `/admin`, `/taller` y `/reservas/cancelar`. El refactor agregó rutas que no están cubiertas:

- `/aprobacion/[token]`, `/informe/[token]`, `/seguimiento/[token]` — enlaces que se envían por correo a clientes.
- `/plataforma/*` — administración de la plataforma (responde 303 al login, pero no conviene publicarla).
- `/demo` y `/[slug]/*` en el host de Llave 15.

**Fix.** Ver §4.1.

---

## 3. Prioridad 3 — medio

### 3.1 Google Business Profile

No es verificable desde fuera, y es **la palanca número uno del SEO local**. Un taller con dirección física que no está en el mapa no existe para "taller de bicicletas cerca de mí", que es como busca la mayoría de la gente. Si el perfil no está creado y verificado, esto rinde más que todo el resto de esta auditoría junto.

Completo significa: categoría principal "Taller de reparación de bicicletas", dirección verificada, horarios que coincidan con el schema del sitio, teléfono, sitio web, zona de servicio (Vitacura y Las Condes), lista de servicios, fotos reales, y pedir reseñas a los clientes que ya atendiste.

### 3.2 Assets con `cache-control: private`

`max-age=31536000, immutable` es correcto, pero el `private` impide el caché compartido. Son archivos con hash en el nombre, así que podrían ser `public` sin riesgo.

### 3.3 Cabeceras de seguridad

Solo está `strict-transport-security`. No hay `x-content-type-options`, `x-frame-options` ni CSP. No es SEO, pero son tres cabeceras y se resuelven en el mismo lugar donde se arregla la compresión.

---

## 4. Cómo se arregla

Orden pensado para que cada paso desbloquee el siguiente y no se pisen entre ellos.

### 4.1 `robots.txt` por host (reemplaza el archivo estático)

Borrar `public/robots.txt` y crear `src/pages/robots.txt.ts`:

```ts
import type { APIRoute } from "astro";
import { getHostEnv } from "../lib/env.ts";
import { isPlatformHost } from "../server/shops/host.ts";

export const prerender = false;

/** Rutas privadas en cualquiera de los dos dominios. */
const PRIVADAS = [
  "/admin",
  "/taller",
  "/plataforma",
  "/reservas/cancelar",
  "/aprobacion",
  "/informe",
  "/seguimiento",
];

export const GET: APIRoute = ({ request, url }) => {
  const env = getHostEnv();
  const platform = isPlatformHost(request, env.APP_URL, env.PUBLIC_SITE_URL);

  const lineas = [
    "User-agent: *",
    ...PRIVADAS.map((ruta) => `Disallow: ${ruta}`),
    // En llave15.cl las páginas de cada taller son app, no contenido indexable.
    ...(platform ? ["Disallow: /*/reservar", "Disallow: /*/privacidad"] : []),
    "",
    // El sitemap que genera @astrojs/sitemap es el del dominio de `site`:
    // anunciarlo en el otro host sería mandar al rastreador a otro sitio.
    ...(platform ? [] : [`Sitemap: ${url.origin}/sitemap-index.xml`]),
  ];

  return new Response(`${lineas.join("\n")}\n`, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      vary: "Host, X-Forwarded-Host",
    },
  });
};
```

Cuando Llave 15 tenga sus páginas comerciales listas para posicionar, se le genera su propio sitemap y se agrega la línea en la rama `platform`.

### 4.2 Canonical consciente del host, y sin canonical cuando hay `noindex`

En `src/layouts/Base.astro`, el canonical sale de `Astro.site`, que es siempre `vectorbikes.cl`. Dos cambios:

```astro
// Detrás de Cloud Run el host real viene en X-Forwarded-Host: usar la misma
// fuente que isPlatformHost, no Astro.site, que es un único dominio fijo.
const forwarded = Astro.request.headers.get("x-forwarded-host");
const origin = forwarded ? `https://${forwarded.split(",")[0].trim()}` : Astro.url.origin;
const canonical = new URL(path, origin).href;
const ogImage = new URL(VECTOR_BIKES_SITE.ogImagePath, origin).href;
```

Y en el `<head>`, no emitir canonical en páginas `noindex` — es lo que produce el canonical cruzado hacia `vectorbikes.cl/404`:

```astro
{!noindex && <link rel="canonical" href={canonical} />}
{noindex && <meta name="robots" content="noindex" />}
```

### 4.3 `noindex` en las rutas de app

- `src/pages/[slug]/reservar.astro` → pasar `noindex` a `AppLayout` (igual que ya lo hace `[slug]/privacidad.astro`).
- `src/pages/aprobacion/[token].astro`, `informe/[token].astro`, `seguimiento/[token].astro` → `noindex`.
- `src/pages/plataforma/*` → `noindex`.

Y al revés: `llave15.cl/` y `/demo` **sí** deben posicionar, así que `AppLayout` necesita canonical y Open Graph propios, igual que `Base`. Hoy no emite ninguno de los dos. Lo más limpio es extraer un componente `<SeoHead>` que reciba `title`, `description`, `path`, `ogImage` y `noindex`, y usarlo desde los dos layouts, en vez de duplicar la lógica.

### 4.4 Imagen Open Graph de verdad

Generar `public/brand/og-vector-bikes.jpg` de 1200 × 630 con una foto del taller, y en `Base.astro`:

```astro
<meta property="og:image" content={ogImage} />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Taller de Vector Bikes en Av. Kennedy 7666, Vitacura" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content={ogImage} />
```

Dejar `vector-bikes-logo.png` solo como `logo` del schema, no como `og:image`.

### 4.5 Compresión (el cambio más invasivo — hacerlo solo, con `pnpm gate` después)

El adaptador standalone no comprime. Pasar a modo middleware y poner un servidor mínimo delante:

```js
// astro.config.mjs
adapter: node({ mode: "middleware" }),
```

```js
// server.mjs
import compression from "compression";
import express from "express";
import { handler as ssrHandler } from "./dist/server/entry.mjs";

const app = express();
app.disable("x-powered-by");
app.use(compression());
app.use((_req, res, next) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "SAMEORIGIN");
  next();
});
// Assets con hash: caché pública y larga.
app.use(
  "/_astro",
  express.static("dist/client/_astro", { maxAge: "1y", immutable: true }),
);
app.use(express.static("dist/client"));
app.use(ssrHandler);
app.listen(Number(process.env.PORT ?? 4321), "0.0.0.0");
```

```jsonc
// package.json
"start": "HOST=0.0.0.0 PORT=4321 node server.mjs",
```

Agregar `express` y `compression` a dependencias. Verificar después con:

```bash
curl -sI -H 'Accept-Encoding: gzip, br' https://vectorbikes.cl/ | grep -i content-encoding
```

Este cambio toca el arranque en Replit: conviene hacerlo en su propio commit, correr `pnpm gate` y publicar sin nada más encima.

### 4.6 Schema completo

En `src/layouts/Base.astro`:

```ts
const localBusiness = {
  "@type": "BicycleStore",
  "@id": `${new URL("/", origin).href}#taller`,
  name: VECTOR_BIKES_SITE.name,
  url: new URL("/", origin).href,
  image: ogImage,
  logo: new URL(VECTOR_BIKES_SITE.logoPath, origin).href,
  email: VECTOR_BIKES_SITE.email,
  telephone: VECTOR_BIKES_SITE.phone,
  priceRange: "$$",
  currenciesAccepted: "CLP",
  paymentAccepted: "Efectivo, Transferencia, Tarjeta",
  hasMap: VECTOR_BIKES_SITE.mapsUrl,
  geo: {
    "@type": "GeoCoordinates",
    latitude: -33.3869,   // ← reemplazar por las coordenadas reales de Kennedy 7666
    longitude: -70.5637,
  },
  areaServed: VECTOR_BIKES_SITE.pickupComunas.map((name) => ({ "@type": "City", name })),
  address: { /* sin cambios */ },
  openingHoursSpecification: VECTOR_BIKES_SITE.openingHoursSpecification,
  sameAs: [VECTOR_BIKES_SITE.instagramUrl /*, WhatsApp, perfil de Google */],
};
```

Las coordenadas hay que sacarlas del pin real en Google Maps, no estimarlas. Validar el resultado en el [Rich Results Test](https://search.google.com/test/rich-results), que renderiza JavaScript.

### 4.7 Lo que no es código

| Tarea | Dónde |
|---|---|
| Search Console por dominio + enviar sitemap | TXT en cPanel Bluehosting |
| Verificar que el registro A siga en `34.111.179.208` | cPanel, **después** de tocar la zona |
| Bing Webmaster Tools | importa la verificación de Google |
| GA4 + evento al confirmar reserva | contenedor nuevo; el punto exacto está en la isla de reserva |
| Google Business Profile completo | perfil + fotos + servicios + reseñas |
| 301 de `www` al apex | Replit o cPanel |
| Fotos del taller | 6-10, en WebP |
| Textos de las 4-6 páginas de servicio con precio desde | el trabajo más valioso de la lista |

---

## 5. Plan de acción

**Semana 1 — desbloquear la medición (3-4 h)**

1. Search Console por dominio + enviar sitemap → verificar el registro A después
2. `robots.txt` por host (§4.1)
3. Canonical por host y sin canonical en `noindex` (§4.2)
4. `noindex` en rutas de app y de token (§4.3)
5. Decidir qué pasa con el script de Replit; si se queda, declararlo en `/privacidad`

**Semanas 2-3 — lo que mueve la aguja**

6. Google Business Profile completo con fotos, horarios y servicios
7. Las 4-6 páginas de servicio con precio desde, sumadas al sitemap (§1.2)
8. Fotos reales del taller + imagen OG de 1200 × 630 (§2.2, §4.4)
9. GA4 con el evento de reserva

**Cuando se pueda tocar el deploy**

10. Compresión y cabeceras, en su propio commit (§4.5)
11. Schema completo con coordenadas reales (§4.6)
12. 301 de `www` al apex y arreglo del 404 por host (§2.5, §2.6)
13. Canonical y Open Graph propios para las páginas comerciales de Llave 15 (§4.3)

---

## 6. Fuera de alcance, pero conviene revisar

Este repositorio es **público** y contiene el sistema de gestión completo del taller. Vale la pena decidir explícitamente si debe seguir siéndolo, y rotar las credenciales de producción como higiene básica.

---

*Auditoría externa sobre producción, cruzada con el código fuente. Sin acceso a Search Console ni a datos de campo: todo lo medible aquí se midió con `curl` y con el HTML servido.*
