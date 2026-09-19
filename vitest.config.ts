import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig says jsx: "preserve" (Next.js compiles JSX itself); tests that
  // render server components need the transformer to emit the automatic
  // runtime. Vitest 4 transforms with oxc (Vite 8 / rolldown), not esbuild, so
  // the old `esbuild: { jsx: "automatic" }` is ignored there; this is its
  // replacement.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.mjs"],
    globals: false,
  },
});
