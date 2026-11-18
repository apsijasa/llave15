import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Pruebas del sitio de Vector Bikes; desde la raíz del repo:
// `pnpm exec vitest run --config web/vector-bikes/vitest.config.ts`.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
    environment: "node",
  },
});
