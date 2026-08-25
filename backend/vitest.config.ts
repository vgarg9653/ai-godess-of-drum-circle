import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests drive a real Socket.IO server over real sockets.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      "@godc/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
});
