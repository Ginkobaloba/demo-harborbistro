# Deep Verify: PR #47 isolate the webhook no-mutation property; secret format floor (2026-09-19)

Overall: PASS
Tested-SHA: d9209b586b4f20222be44ac47a21f5674f47f2d0

Independent deep verify of `Ginkobaloba/demo-harborbistro` PR #47 (branch
`fix/webhook-secret-floor`, label `tier-3`). The verifier did not write the PR
and attacked it rather than reading it. The PR body and its ledger entry were
treated as claims, not evidence.

Everything below ran against the FETCHED ref in a fresh worktree.
`git fetch origin --prune` ran first from PowerShell,
`git worktree add --detach C:\dev\_review-wt\pr47-audit d9209b58...` was created
at the head SHA, and `git status --porcelain` was empty before any work. No
local-only state fed any finding.

**Result: PASS**, with one framing caveat that must travel with this PR (below).

## Target and scope

| Item | Value |
|---|---|
| Repo | Ginkobaloba/demo-harborbistro |
| PR | #47, `fix/webhook-secret-floor` |
| Head tested | `d9209b586b4f20222be44ac47a21f5674f47f2d0` |
| Base | `origin/main` = `75f11be672f60b6634c9b1e1394d9f83b6be316d` |
| Tier | 3 (`tier-3` label present) |
| Mode | DEEP REQUESTED, LAYER 5 UNAVAILABLE |

Layers 1, 2, 3, 4 and 6 ran. Layer 5 (headed real-Chrome run) did not: this
change has no rendered surface. The webhook route was exercised directly as a
Next.js `NextRequest`/`Response` pair against a throwaway SQLite database, which
is the real handler, the real verifier and the real SQL.

---

## THE HEADLINE ANSWER

**The row-identity tests DOCUMENT A PROPERTY THAT ALREADY HELD ON `main`. They
did not close a live hole.**

`origin/main`'s `src/app/api/webhooks/stripe/route.ts` already called
`Stripe.webhooks.constructEvent(raw, signature, secret)` before
`handleStripeEvent`, and already returned 400 on a missing header and 400 on a
verification failure. The PR's diff to that file is a doc comment, two imports
and one log string: **zero control-flow change**. Only `getWebhookSecret()`
changed behaviour.

Proof, not inference. The PR's own test file was run unchanged against `main`'s
pre-fix `route.ts` and `stripe.ts`:

```
$ git checkout origin/main -- src/app/api/webhooks/stripe/route.ts src/lib/stripe.ts
$ git diff HEAD --stat
 src/app/api/webhooks/stripe/route.ts | 32 ++++++++------------------------
 src/lib/stripe.ts                    | 17 ++---------------
 2 files changed, 10 insertions(+), 39 deletions(-)

$ npx vitest run src/app/api/webhooks/stripe/route.test.ts --reporter=verbose
 ...
 ✓ unverified events leave the order row byte-for-byte unchanged > no stripe-signature header: 400 and the whole row is identical
 ✓ unverified events leave the order row byte-for-byte unchanged > malformed stripe-signature header: 400 and the whole row is identical
 ✓ unverified events leave the order row byte-for-byte unchanged > signature made with the wrong key: 400 and the whole row is identical
 ✓ unverified events leave the order row byte-for-byte unchanged > valid signature over a different body: 400 and the whole row is identical
 ✓ unverified events leave the order row byte-for-byte unchanged > control: the same body WITH a correct signature does change the row
 × malformed STRIPE_WEBHOOK_SECRET is treated as unconfigured > 503s for a request correctly signed with "whsec_xxx"
 × malformed STRIPE_WEBHOOK_SECRET is treated as unconfigured > 503s for a request correctly signed with "whsec_short"
 × malformed STRIPE_WEBHOOK_SECRET is treated as unconfigured > 503s for a request correctly signed with "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 × malformed STRIPE_WEBHOOK_SECRET is treated as unconfigured > 503s for a request correctly signed with " whsec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

 Tests  4 failed | 16 passed (20)
```

Read the split carefully, because a bare "4 failed" will be misread:

- **All 5 row-identity cases PASS against pre-fix `main`.** The property held.
  These are regression protection for a guard that was already correct. Keep
  them. Do not describe them as closing a hole.
- **The 4 failures are the floor's OWN tests**, which cannot pass on `main`
  because the floor does not exist there. They are not row-identity tests.

**In fairness to the builder: the PR body does not claim otherwise.** It says
the mutation checks prove the tests bite, which is true, and it volunteers
the correction that the pre-existing tests were already state assertions
(`statusOf(...) === "pending"`), not status-code-only, so the real gap was
*status-column-only* coverage. It also volunteers that the earlier
`.env.example` work "closed the accident, not the class." That is an accurate
self-description. The caveat this report attaches is about how the PR will be
read downstream, not about a false statement in it.

### The secondary control: does the floor block a real mutation?

**Yes, but only a misconfiguration, never an attacker-reachable input.** The
distinction matters, so it was measured both ways rather than argued.

A throwaway probe (`zz-audit-probe.test.ts`, deleted before this commit,
diff-proven below) configured `STRIPE_WEBHOOK_SECRET=whsec_xxx` and sent an
event correctly signed *with that same placeholder*.

Against **pre-fix `main`**:

```
PROBE A status= 200 json= {"received":true,"handled":true} row= {"id":"HB-PROBE",...,
  "status":"received","stripe_payment_intent_id":"pi_test_probe",...}
```

The order flipped `pending` -> `received` and the payment intent was written.
That is a genuine state mutation driven by a forged-but-"correctly-signed"
event, because the HMAC key was a publicly-guessable placeholder.

Against **PR head**:

```
PROBE A status= 503 json= {"error":"Webhook not configured"} row= {"id":"HB-PROBE",...,
  "status":"pending","stripe_payment_intent_id":null,...}
```

So the floor does stop a reachable state mutation. **But** reaching it requires
an operator to have configured a short/placeholder `whsec_`. `.env.example` on
`origin/main` already had `STRIPE_WEBHOOK_SECRET=` empty (it is an unchanged
context line in this PR's diff), so no placeholder was shipped. The floor
therefore guards a *future* bad paste, not a condition that existed in the repo.

Attacker reachability: none. The attacker does not set environment variables. A
`whsec_`-shaped value someone else chose passes every rule in the floor, and the
PR says so in an executable assertion (item 4). **Verdict: the floor blocks the
exploitation of a misconfiguration. It is correctly labelled a secondary
control, and labelling it that way is the right call.**

Not verified, and deliberately not attempted: whether the **deployed**
environment carries a placeholder secret. Reading real `.env*` files was out of
scope by instruction. **TAKEN AS UNKNOWN.**

---

## 1. Mutation re-measurement (independent)

Head commit `d9209b58` was already committed upstream; the worktree was clean
before each mutation and restored after. Every mutation was proven non-empty
with `git diff HEAD --stat` before the run. **No mutation was a no-op.**

Baseline at head, both webhook test files: **30 passed (30)**. Full suite: **218
passed (218)**.

### M1 -- `constructEvent` -> `JSON.parse`. CONFIRMED: 6 red.

```
$ git diff HEAD -- src/app/api/webhooks/stripe/route.ts
-    event = Stripe.webhooks.constructEvent(raw, signature, secret);
+    event = JSON.parse(raw) as Stripe.Event; // M1 MUTATION

 × ... with STRIPE_WEBHOOK_SECRET set > rejects a garbage signature with 400
 × ... with STRIPE_WEBHOOK_SECRET set > rejects a signature made with a different secret
 × ... with STRIPE_WEBHOOK_SECRET set > rejects a valid signature over a tampered body
 × ... unverified events leave the order row byte-for-byte unchanged > malformed stripe-signature header: 400 and the whole row is identical
 × ... unverified events leave the order row byte-for-byte unchanged > signature made with the wrong key: 400 and the whole row is identical
 × ... unverified events leave the order row byte-for-byte unchanged > valid signature over a different body: 400 and the whole row is identical

 Tests  6 failed | 24 passed (30)
```

Count and names match the PR exactly: 3 new row-identity cases plus 3
pre-existing. `no stripe-signature header: 400 and the whole row is identical`
stayed green -- see item 2.

### M2 -- M1 plus removing the missing-header early return. CONFIRMED: 8 red.

```
$ git diff HEAD --stat -- src/app/api/webhooks/stripe/route.ts
 src/app/api/webhooks/stripe/route.ts | 10 ++--------

 × ... with STRIPE_WEBHOOK_SECRET set > rejects a missing signature with 400 and changes nothing
 × ... with STRIPE_WEBHOOK_SECRET set > rejects a garbage signature with 400
 × ... with STRIPE_WEBHOOK_SECRET set > rejects a signature made with a different secret
 × ... with STRIPE_WEBHOOK_SECRET set > rejects a valid signature over a tampered body
 × ... unverified events ... > no stripe-signature header: 400 and the whole row is identical
 × ... unverified events ... > malformed stripe-signature header: 400 and the whole row is identical
 × ... unverified events ... > signature made with the wrong key: 400 and the whole row is identical
 × ... unverified events ... > valid signature over a different body: 400 and the whole row is identical

 Tests  8 failed | 22 passed (30)
```

Exactly M1's six plus the two missing-header cases. **All four row-identity
rejection cases bite under M2.**

### M3 -- revert only `getWebhookSecret()` to the truthy check. CONFIRMED: 6 red.

```
$ git diff HEAD -- src/lib/stripe.ts
-  const value = process.env.STRIPE_WEBHOOK_SECRET;
-  return webhookSecretProblem(value) ? undefined : value;
+  void webhookSecretProblem; // M3 MUTATION: floor removed, truthy check only
+  return process.env.STRIPE_WEBHOOK_SECRET || undefined;

 × src/lib/webhook-secret.test.ts > getWebhookSecret ... > returns undefined for a short whsec_ placeholder
 × src/lib/webhook-secret.test.ts > getWebhookSecret ... > returns undefined for a long value with no whsec_ prefix
 × route.test.ts > malformed STRIPE_WEBHOOK_SECRET is treated as unconfigured > 503s for a request correctly signed with "whsec_xxx"
 × route.test.ts > ... > 503s for a request correctly signed with "whsec_short"
 × route.test.ts > ... > 503s for a request correctly signed with "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
 × route.test.ts > ... > 503s for a request correctly signed with " whsec_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

 Tests  6 failed | 24 passed (30)
```

4 route-level cases plus 2 unit cases, exactly as claimed. The empty-string case
stayed green, correctly: the old truthy check already refused `""`.

### Restore proven

```
$ git checkout HEAD -- <each mutated file>
$ git status --porcelain
$ git diff
$ git diff HEAD
$ git rev-parse HEAD
d9209b586b4f20222be44ac47a21f5674f47f2d0
```

All three commands printed nothing. Tree identical to the tested head before the
report commit was made.

---

## 2. The two-guards-in-series claim. CONFIRMED, and M2 is what isolates it.

The explanation is true of the actual code. `route.ts` at the tested head:

```ts
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
```

The header check returns before `constructEvent` is ever called. So under M1
(which only neuters `constructEvent`) the no-header request never reaches the
mutated line, still gets 400, and the test stays green **while asserting
nothing about verification**. That is the "guard reached only through a path
where an earlier guard fires first" trap, and the PR named it correctly rather
than presenting a green test as proof.

M2 is what proves the isolation: removing the early return forces the no-header
request down to the mutated verifier, and both no-header tests go red
(`rejects a missing signature with 400 and changes nothing`, and
`no stripe-signature header: 400 and the whole row is identical`). Without M2
the two no-header tests would be untested tests. **The builder ran the right
second mutation; this is the strongest thing in the PR.**

---

## 3. Caller enumeration (from the fetched ref, not the PR body)

`handleStripeEvent` is called from exactly two places in the shipped tree, one
of which is not a server path:

| Caller | Signature-checked? |
|---|---|
| `src/app/api/webhooks/stripe/route.ts:76` | YES -- `constructEvent` before the call |
| `scripts/test-checkout.ts:245,267,279` | N/A -- local CLI script, not a route |

**`markOrderPaid` / `markOrderCancelled` have a THIRD caller the PR does not
mention**, and it does mutate paid state with no signature check:

- `src/app/order/confirmation/[id]/page.tsx:50` calls `markOrderPaid(order.id, paymentIntentId)`.

Its authority is different, not absent: the order must resolve under
`readVisitorScope()` (D-016, so only a seed order or one this browser placed),
a `session_id` must be supplied, `isStripeConfigured()` must hold, and the
session is fetched with `getStripe().checkout.sessions.retrieve(...)` -- i.e.
the trust root is the server's own Stripe **secret key** plus a `belongs` check
(`session.metadata.order_id === order.id || session.client_reference_id === order.id`)
and `session.payment_status === "paid"`. That is a legitimate second
reconciliation path, pre-existing on `main`, untouched by this PR.

**This is not a hole, but the PR's "THE GUARD, and the property it holds"
comment in `route.ts` reads as if the webhook were the only way an order
becomes paid. It is not.** Recommend a one-line cross-reference in a follow-up.
Flagging, not fixing.

Two further order-status mutators, for completeness:

- `advanceOrder` and `cancelActiveOrder` (`src/lib/orders.ts:416,444`), reached
  only from `POST /api/admin/orders/[id]`. That route has **no authentication**
  by deliberate demo decision (D-016) and is scoped via `scopeFromRequest(req)`
  to seed orders plus this browser's own. It cannot mark anything paid:
  `advanceOrder` only walks `received -> preparing -> ready -> completed`, and
  `cancelActiveOrder` throws `OrderTransitionError` unless the order is already
  in `ACTIVE_ORDER_STATUSES`. So it can cancel an already-paid order within the
  visitor's own scope, which is the demo's intent.

  That `advanceOrder` cannot mark a `pending` order paid was checked in the
  function that decides the transition, not inferred from the `ORDER_FLOW`
  comment:

  ```ts
  export function nextOrderStatus(current: OrderStatus): OrderStatus | null {
    const idx = (ORDER_FLOW as readonly string[]).indexOf(current);
    if (idx === -1 || idx === ORDER_FLOW.length - 1) return null;
    return ORDER_FLOW[idx + 1];
  }
  ```

  `ORDER_FLOW` is `["received", "preparing", "ready", "completed"]`, so
  `indexOf("pending") === -1`, `nextOrderStatus` returns `null`, and
  `advanceOrder` throws `OrderTransitionError` before touching the row. The
  admin route answers 409. There is no `pending -> received` edge there.
- No other `UPDATE orders SET status` exists in `src/`.

**No unauthenticated path sets `status = 'received'`.** The `pending -> received`
transition is reachable only through the signature-verified webhook or the
secret-key-authenticated confirmation reconcile.

---

## 4. The secondary-control labelling. CONFIRMED, and the test exists.

Six prose labels, not four, plus one executable assertion:

```
.env.example:17:          # SECONDARY control -- it catches a shipped placeholder and nothing more.
webhook-secret.ts:4:      * READ THIS BEFORE TRUSTING IT. This module is the SECONDARY control, not the
stripe.ts:54:             * SECONDARY CONTROL, NOT THE GUARD. The floor catches a shipped placeholder or
route.ts:27:              * the format/length floor in `@/lib/webhook-secret`, which is a SECONDARY
route.test.ts:279:        * Secondary control at the route boundary: a configured-but-malformed
webhook-secret.test.ts:11: * The SECONDARY control. These tests prove a placeholder-shaped value is
webhook-secret.test.ts:89: it("does NOT rescue a secret that merely looks right: shape is not authority", ...
```

The named test exists and asserts what its name says:

```ts
const attackerChosen = `${WEBHOOK_SECRET_PREFIX}${"0".repeat(40)}`;
expect(webhookSecretProblem(attackerChosen)).toBeNull();
vi.stubEnv("STRIPE_WEBHOOK_SECRET", attackerChosen);
expect(getWebhookSecret()).toBe(attackerChosen);
```

That is a correct encoding of "shape is not authority": a 46-character
attacker-chosen `whsec_`-shaped value clears the floor and is handed straight
back as the HMAC key.

**One precision the PR does not state, and a reviewer should know it.** This is
a *semantic-lock* test, not a guard test. It stays GREEN under M1, M2 and M3 --
it cannot detect a weakening, because it asserts a permissive outcome. It bites
only against a future *strengthening* that would make the floor look like
authentication. Proven with a fourth mutation, a plausible "entropy hardening"
added to `webhookSecretProblem`:

```
+  if (new Set(value.slice(WEBHOOK_SECRET_PREFIX.length)).size < 4) return "too_short";

 × webhookSecretProblem > accepts a whsec_ value of a realistic length
 × webhookSecretProblem > puts the boundary exactly at MIN_WEBHOOK_SECRET_LENGTH
 × getWebhookSecret ... > returns the value when it clears the floor
 × getWebhookSecret ... > does NOT rescue a secret that merely looks right: shape is not authority

 Tests  4 failed | 26 passed (30)
```

So it is executable and it does fail -- but M4 also reddens three sibling tests
(the fixtures use repeated characters), so M4 does not *uniquely* isolate it.
The label is still worth more than a comment; it is just worth less than a
guard test, and should not be cited as one. Restored afterwards; tree clean.

---

## 5. Replay. CONFIRMED as reported, including the tolerance question.

Static: no `event.id` ledger, no processed-event table, no idempotency key
anywhere in `handleStripeEvent` or `src/lib/orders.ts`. The SQL is exactly as
described:

```sql
-- markOrderPaid (orders.ts:333-345), additionally guarded by an
-- `if (order.status === "pending")` read-then-write in JS
UPDATE orders
   SET status = 'received',
       stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id),
       updated_at = datetime('now')
 WHERE id = ? AND status = 'pending'

-- markOrderCancelled (orders.ts:351)
UPDATE orders SET status = 'cancelled', updated_at = datetime('now')
 WHERE id = ? AND status = 'pending'
```

Runtime, at the tested head:

```
PROBE C r1= 200 {"received":true,"handled":true} | r2= 200 {"received":true,"handled":true}
        | row identical after replay = true | row={... "status":"received" ...}
PROBE D replay status= 200 {"received":true,"handled":true} | row unchanged = true | status= preparing
PROBE E expired-after-paid status= 200 {"received":true,"handled":true} | row unchanged = true | status= received
```

The replay returns **200 with `handled: true`** every time -- the route cannot
tell a replay from a first delivery. Only the `AND status = 'pending'` predicate
keeps the row still. PROBE D is the important one: after the order moved to
`preparing`, the identical signed event replayed and the row did not move.

**Is `constructEvent`'s timestamp tolerance doing any of the work? Yes, some.**
`constructEvent(raw, signature, secret)` is the 3-argument form, so the SDK's
default 300s tolerance applies. Measured:

```
PROBE B1 (600s old) status= 400 row.status= pending
PROBE B2 (60s old)  status= 200 row.status= received
```

So the tolerance **bounds the replay window to roughly 5 minutes** -- a captured
signed event is not replayable a day later. It does not detect replay inside
that window; the SQL guard is what makes an in-window replay a no-op. Both
controls are load-bearing, in that order.

**Standing risk, reported not fixed, agreeing with the PR:** any non-idempotent
side effect added to `handleStripeEvent` later (confirmation email, kitchen
push, analytics) will double-fire on an in-window replay, because nothing in
the current design detects one. The safety is a property of two UPDATE
statements, not of the event pipeline. Worth a follow-up card.

---

## 6. Safety audit of the branch

**No Stripe API call is possible from anything this PR adds. CONFIRMED.**

- `git diff origin/main...HEAD` grepped for `stripe.com`, `http://`, `https://`,
  `api.stripe`, `fetch(`, `axios`, `sk_live`, `pk_live`, `rk_`. **Zero hits.**
- The only `sk_test` in the diff is the synthetic bad-prefix fixture
  `"sk_test_" + "a".repeat(40)` in `webhook-secret.test.ts`. Not a key, not a
  credential, 48 characters of literal `a`.
- The only Stripe API used in the added tests is
  `Stripe.webhooks.generateTestHeaderString(...)`, a pure local HMAC helper. No
  `new Stripe(...)` is constructed anywhere in the added tests; `getStripe()` is
  not imported by either test file, and `src/lib/stripe.ts` constructs its
  client lazily inside `getStripe()`, so importing it for `getWebhookSecret`
  builds nothing.
- Every secret used in the tests is a throwaway literal: `whsec_test_local_only_not_a_real_secret`,
  `whsec_` + 38-40 repeated characters, `whsec_xxx`, `whsec_short`.
- No `.env*` file, no `~/.secrets`, and no npmrc was opened at any point in this
  verify. `.env.example` (committed, placeholder-only) was read.
- The verifier's own probe file was deleted before the report commit; the
  `git status --porcelain` / `git diff` / `git diff HEAD` triple above is the
  proof.

The one genuine outbound Stripe call in the repo -- `sessions.retrieve` on the
confirmation page -- lives on `main` and is untouched by this branch.

### Cross-repo survey in the PR body: CONFIRMED with a scope caveat

The PR claims only Harbor has a signature-verified mutation path. Re-grepped
independently across the sibling checkouts:

- `C:\dev\demo-axlepoint` -- zero hits for `constructEvent|whsec|webhook`
  (case-insensitive, whole tree).
- `C:\dev\demo-slatewell` -- one hit for
  `constructEvent|whsec|webhooks/stripe|STRIPE_WEBHOOK_SECRET`, in
  `docs/handoffs/HANDOFF_2026-06-29_stripe-elements-and-admin-screens.md`.
  Prose in a historical handoff, no code, no route.
- `C:\dev\lumen-analytics` -- 10 hits, all `LUMEN_SLACK_WEBHOOK_URL`. Confirmed
  outbound: `src/lib/alerting.ts:160-177` reads the URL and `POST`s to it. No
  inbound endpoint, no verification, nothing mutated by an inbound event.

Caveat: this was run against the **current local working copies**, not against
the SHAs the builder was briefed with. The conclusion reproduces; the exact
revisions do not. **CONFIRMED for the checkouts as they stand now.**

---

## Layer 1-4 and 6 results at the tested head

| Check | Result |
|---|---|
| `npx vitest run` (full suite) | **218 passed (218)**, 21 files |
| `npx vitest run` route + secret files | **30 passed (30)** |
| `npx tsc --noEmit` | clean, no output |
| `npx eslint .` | **0 errors**, 4 warnings, all pre-existing in `ParadigmBanner.tsx` |
| `npm ci` | 444 packages, clean install in a fresh worktree |

CI on the tested head (`gh pr checks 47`), all runs created `2026-09-20T04:39Z`,
**after** the head commit at `2026-09-19T23:38:58-05:00` (= `04:38:58Z`):

```
Deep Verify (tier-3 PRs only)   fail   4s
Live smoke (deployed site)      pass   6s
Quick Verify (all PRs)          pass   1m26s
Socket Security: Project Report pass   2s
Socket Security: Pull Request Alerts pass 2s
```

`Deep Verify` was red for the correct reason -- no report named this PR. This
report is the missing artifact.

Ledger entry (`docs/ledger/2026-09-19-2338-isolate-the-webhook-no-mutation-property-add-a-secret-format.md`)
was read and cross-checked: its mutation counts, its 218/218 claim, its lint
claim and its "still open: no processed-event ledger" note all reproduce.

---

## Verdict

**Overall: PASS.** Every mutation number reproduced exactly with matching test
names, no mutation was a no-op, the restore is proven, the structural
two-guards-in-series explanation is true of the code and M2 is the right proof
of it, the floor demonstrably converts a reachable mutation into a 503, nothing
on this branch can reach the network, and no real key is used or committed.

**Caveats that must travel with this PR to the merge decision:**

1. **The row-identity tests document a property that already held on `main`.**
   All five pass against pre-fix code. They are valuable regression protection
   for a correct guard; they are not the closing of a live hole. The PR body
   does not claim they are, but the `route.ts` comment "THE GUARD, and the
   property it holds" and the branch name `fix/webhook-secret-floor` will both
   invite that reading.
2. **The floor blocks a misconfiguration, not an attack.** It is correctly and
   repeatedly labelled as such. No placeholder was shipped on `main`
   (`.env.example` already had the value empty), so the floor guards a future
   bad paste rather than a present defect.
3. **`markOrderPaid` has a second, unmentioned caller**
   (`src/app/order/confirmation/[id]/page.tsx:50`) whose authority is the
   server's Stripe secret key plus visitor scope, not a webhook signature. Not
   a hole; the PR's guard framing should name it.
4. **`does NOT rescue a secret that merely looks right` is a semantic-lock
   test, not a guard test.** It stays green under M1/M2/M3 by design.
5. **Replay is undetected inside the 300s tolerance window.** Safe today only
   because of `AND status = 'pending'`. Reported by the builder, confirmed here,
   not fixed.

None of these blocks a merge. All five belong in the merge note.

---

*Verified by an independent Claude Opus 5 session that did not author PR #47.
Worktree `C:\dev\_review-wt\pr47-audit`, detached at `d9209b58`, PowerShell for
every index-touching git command.*
