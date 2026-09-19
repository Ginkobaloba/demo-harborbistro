import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig says jsx: "preserve" (Next.js compiles JSX itself); tests that
  // render server components need esbuild to emit the automatic runtime.
  esbuild: { jsx: "automatic" },
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
