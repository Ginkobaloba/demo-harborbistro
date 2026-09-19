/**
 * Node-runtime startup work, imported once by instrumentation.ts.
 *
 * - Stripe: logs a loud error at boot when the configured keys are not
 *   test-mode keys. Enforcement itself lives in getStripe() and the checkout
 *   route, which refuse every Stripe call in that state (stripe-mode.ts).
 * - SESSION_SECRET: logs once at boot when it is unusable, since online
 *   ordering and reservations then answer 503 and no visitor cookie is
 *   issued (session-secret.ts, D-018). The message names the rule, never the
 *   value.
 * - Retention: opens the database, which runs the visitor-data purge once at
 *   startup and then at most hourly on later requests (retention.ts, D-016).
 */
import { checkStripeTestMode } from "./lib/stripe-mode";
import { getDb } from "./lib/db";
import { readSessionSecret } from "./lib/session-secret";

const mode = checkStripeTestMode(process.env);
if (!mode.ok && mode.reason === "not_test_mode") {
  console.error(
    `[startup] ${mode.message} Checkout stays disabled (503) until a test key is set.`,
  );
}

// Logs its own warning when the secret is unusable.
readSessionSecret();

try {
  getDb();
} catch (err) {
  console.error("[startup] could not open the database for the retention purge", err);
}
