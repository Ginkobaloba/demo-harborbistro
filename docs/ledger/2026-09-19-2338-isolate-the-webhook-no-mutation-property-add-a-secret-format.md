# 2026-09-19 23:38 CDT - Isolate the webhook no-mutation property; add a secret format floor

- **Who:** Claude Opus 5 session (harbor webhook secret gap), briefed by Drew.
- **Change:** Added an isolating test block to
  `src/app/api/webhooks/stripe/route.test.ts` that snapshots the entire `orders`
  row before each rejected webhook request and asserts it is identical
  column-for-column afterwards (`toStrictEqual`), for four rejection shapes:
  missing `stripe-signature`, malformed header, signature made with the wrong
  key, and a valid signature over a different body. Added a control case
  proving the forged event really does mutate the row when correctly signed, so
  the four cannot pass vacuously. Added `src/lib/webhook-secret.ts`
  (`whsec_` prefix plus a 32-character floor, shaped after
  `session-secret.ts`) and pointed `getWebhookSecret()` at it; a
  configured-but-malformed secret now reads as unconfigured and the route 503s.
  Corrected two comments that had gone stale: `.env.example` still said
  `getWebhookSecret()` had no format check, and the route doc comment described
  only the missing-secret case.
- **Why:** `getWebhookSecret()` did a truthy check and nothing else, so any
  non-empty value was accepted as the HMAC key that verifies inbound Stripe
  signatures, and `handleStripeEvent` mutates order state on a verified event.
  The property that matters is that order state never changes on an event whose
  signature was not verified, and the tests that existed asserted the `status`
  column only, so a rejection that still wrote `stripe_payment_intent_id` or
  bumped `updated_at` would have passed. Hard call: the format floor was
  deliberately NOT treated as the fix. A length or prefix rule is a placeholder
  filter, not a security control, because a `whsec_`-shaped value an attacker
  chose passes every rule in it. The alternative considered and rejected was to
  ship the validator alone and call the gap closed; it lost because it would
  have left a future reader believing the floor is what makes the endpoint safe.
  The floor is labelled as secondary in three places (module comment, accessor
  comment, `.env.example`) and one test asserts an attacker-shaped value passes
  it, so the limitation is executable rather than prose.
- **State after:** Full suite 218/218 green, `tsc --noEmit` clean, `eslint` 0
  errors (4 pre-existing warnings in `ParadigmBanner.tsx`, untouched). Mutation
  checks ran and bit: neutering `constructEvent` to `JSON.parse` reddened 6
  tests (3 of the 4 new row-identity cases; the missing-header case stayed green
  because the header check returns first, which is correct and is why a second
  mutation was run); also removing the missing-header early return reddened 8,
  including all 4 new cases; reverting `getWebhookSecret()` to the old truthy
  check reddened 6 (4 route-level 503 cases, 2 unit cases). The working tree was
  restored after each mutation with `git status --porcelain` and `git diff` both
  empty. Still open: `handleStripeEvent` has no processed-event ledger keyed on
  `event.id`. Replay is safe for the order row today only because
  `markOrderPaid` and `markOrderCancelled` guard on `status = 'pending'` in the
  WHERE clause; any non-idempotent side effect added later (email, kitchen push)
  would double-fire on a replayed signed event. Reported, not fixed here. This
  PR is tier-3 and needs an independent deep verify before merge.
- **Refs:** `src/lib/webhook-secret.ts`, `src/lib/webhook-secret.test.ts`,
  `src/lib/stripe.ts`, `src/app/api/webhooks/stripe/route.ts`,
  `src/app/api/webhooks/stripe/route.test.ts`, `.env.example`, commit e1792e7.
