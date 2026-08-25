import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Point at shared source rather than a build artifact, so editing the
      // protocol hot-reloads instead of requiring a rebuild between packages.
      "@godc/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Phones on the same wifi need to reach the dev server to test a real room.
    host: true,
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
