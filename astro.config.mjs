import node from "@astrojs/node";
import preact from "@astrojs/preact";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// `robots.txt` y el sitemap son rutas SSR por dominio (`src/server/shops/site-seo.ts`).
const site = process.env.PUBLIC_SITE_URL || "https://vectorbikes.cl";

export default defineConfig({
  site,
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [preact()],
  security: {
    checkOrigin: false,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
