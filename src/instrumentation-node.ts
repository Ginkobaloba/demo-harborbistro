/**
 * Node-runtime startup work, imported once by instrumentation.ts.
 *
 * - Stripe: logs a loud error at boot when the configured keys are not
 *   test-mode keys. Enforcement itself lives in getStripe() and the checkout
 *   route, which refuse every Stripe call in that state (stripe-mode.ts).
 * - Retention: opens the database, which runs the visitor-data purge once at
 *   startup and then at most hourly on later requests (retention.ts, D-016).
 */
import { checkStripeTestMode } from "./lib/stripe-mode";
import { getDb } from "./lib/db";

const mode = checkStripeTestMode(process.env);
if (!mode.ok && mode.reason === "not_test_mode") {
  console.error(
    `[startup] ${mode.message} Checkout stays disabled (503) until a test key is set.`,
  );
}

try {
  getDb();
} catch (err) {
  console.error("[startup] could not open the database for the retention purge", err);
}
