import { defineConfig } from "vitest/config";

/**
 * Real-server suite (D-017): starts the built standalone server and talks
 * raw HTTP to it. Kept out of the default `vitest run` because it needs a
 * fresh `npm run build` first. Every file in this suite calls
 * `assertFreshBuild` (test/server/fresh-build.ts, D-019) before starting a
 * server, and fails fast, naming both shas, when the build in
 * `.next/BUILD_STAMP.json` does not match the current checkout. Run:
 *   npm run build
 *   npm run test:server
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
