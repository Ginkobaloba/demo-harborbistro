/**
 * Runs once when the server process starts (Next.js instrumentation hook).
 * The Node-only work lives in instrumentation-node.ts; this exact
 * `if (process.env.NEXT_RUNTIME === "nodejs")` shape is what lets Next.js drop
 * the import from the edge bundle, so better-sqlite3 never reaches it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
