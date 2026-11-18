import node from "@astrojs/node";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

// Sitio informativo de Vector Bikes (decisión 15). Mientras vive en este repo, los paquetes se
// resuelven desde node_modules de la raíz; se construye con `astro build --root web/vector-bikes`.
export default defineConfig({
  site: "https://vectorbikes.cl",
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [
    sitemap({
      // Lista blanca: solo la portada y privacidad entran al sitemap.
      filter: (page) =>
        ["/", "/privacidad"].includes(new URL(page).pathname.replace(/\/$/, "") || "/"),
    }),
  ],
  security: {
    checkOrigin: false,
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
