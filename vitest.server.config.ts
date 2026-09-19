import { defineConfig } from "vitest/config";

/**
 * Real-server suite (D-017): starts the built standalone server and talks
 * raw HTTP to it. Kept out of the default `vitest run` because it needs a
 * fresh `npm run build` first. Run:
 *   npm run build
 *   npx vitest run --config vitest.server.config.ts
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/server/**/*.server.test.ts"],
    globals: false,
    testTimeout: 20_000,
    // One server for the file; the cases share it in order.
    fileParallelism: false,
  },
});
