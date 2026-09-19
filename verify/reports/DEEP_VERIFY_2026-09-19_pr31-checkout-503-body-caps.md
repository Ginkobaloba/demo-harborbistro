# Deep Verify: PR #31 checkout 503 with no order row, public request body caps (2026-09-19)

Overall: FAIL
Tested-SHA: 7e327730d60a1a0d1566ee3462d9546e38b504eb

**Round 3 at `7e32773` (current verdict).** RB1 is fixed. The round-2
big-cart repro now checks out in real Chromium at the 15%, 18% and 20%
presets, and each one reaches the fake Stripe. A custom tip of exactly 100%
is accepted, and 100% + 1 cent is refused. The $1,000 floor works on small
carts. Forged or stale client prices cannot move the limit. The PR #28
regression passed 221 of 221, and W2 to W5 still hold.

**It is still FAIL, because the new `drainBriefly` added a slowloris hold.**
After the byte cap trips, the drain reads with a 50 ms timeout. When that
timeout wins, the `reader.read()` it started is still pending, and the
following `await reader.cancel()` does not settle until the client sends
more bytes. So a client that goes past the cap by less than 64 KB and then
stops sending gets **no 413 at all**. It is held until Node's
`requestTimeout`, which answered 408 at **301 s** for each of 50 concurrent
stalled senders.

`ad5713e`, built from source and run as a diagnostic, answers the same five
stall probes with 413 in 7 to 27 ms, so this is new in `7e32773`. It
contradicts the commit's own claim that "a stalled sender cannot delay the
answer past the time bound". It is also why the endless-upload probes B-R1
and B-R4 slowed from about 7 ms to about 510 ms: the 413 waits for the next
chunk to arrive.

The drain's other goal, fewer TCP resets under load, was **not** achieved:
29 of 240 uploads (12%) against 12 of 200 (6%) in round 2, and 2 of 160
against 1 of 160 in the isolation probe.

Round-3 totals:
- attack harness: 122 of 127;
- PR #28 regression: 221 of 221, plus 7 N/A and 2 SKIP;
- unit tests: 150 of 150;
- collision probe: 4 of 4;
- builder's server suite: 6 of 6, three times (it cannot see the stall bug;
  see 3.4).

The 5 attack FAILs:
- B-D1 and B-D4: the blocker;
- B-R7: the reset rate did not drop;
- B-R6: a byte threshold I set in round 2, missed because of socket buffers,
  not a defect (3.5);
- U8: a harness bug, re-run correctly in `u8.mjs` (3.3).

Earlier rounds are kept below as history.

## 3. Re-verify (round 3) at 7e32773 (2026-09-19)

### 3.1 Scope and environment

- **Head:** `7e327730d60a1a0d1566ee3462d9546e38b504eb`, reached with
  `git pull --ff-only`. The fix commit sits on top of the round-2 report
  commit `9e97d97`.
- **Mode:** deep, layers 1, 2, 3, 4 and 6. Headed Chrome was not run.
- **Environment:**
  - One image, `demo-harborbistro:dv31`, rebuilt from `7e32773` with the npm
    secret pattern; the npmrc was deleted right after, and the token was
    never printed. The build ran seed, seed verification and "Compiled
    successfully".
  - The same nine `dv31-*` containers on `127.0.0.1:18411-18419`, with the
    same fake-key, listener and fake-Stripe setup. The PR #28 regression ran
    first on fresh containers, then the attack harness.
- **Diagnostic, clearly separate:** a second image,
  `demo-harborbistro:dv31-r2diag`, was built from a `git archive` of
  `ad5713e` into the scratch dir. It ran as `dv31-r2diag` on port 18414, in
  place of `dv31-rk` after the regression was done. It exists only to show
  whether the stall behaviour is new.
- The live container, the public URL, demo-proxy and cloudflare-config were
  not touched.
- Evidence (scratch dir):
  - harness logs: `attack-r3.log`, `regress-r3.log`;
  - stall probes: `stallprobe.log`, `stallprobe-r2diag.log`, `holdprobe.log`;
  - `b7probe-r3.log`, `u8.log`;
  - Layer 1 and suite logs: `vitest-r3.log`, `unitprobe-r3.log`,
    `serversuite-r3-{1,2,3}.log`;
  - build logs: `build3.log`, `build-r2diag.log`.

### 3.2 Diff review, `ad5713e` to `7e32773`

`git diff ad5713e 7e32773 --stat` lists 11 files. One of them is this
report (`9e97d97`). The fix commit (`9e97d97..7e32773`) touches 10 files,
all matching the builder's list:

- **`src/lib/tip.ts` (new, pure):**
  - `MAX_TIP_CENTS = 100_000`;
  - `maxTipCents(sub) = max(100000, floor(max(0, sub)))`;
  - `presetTipCents` clamps `round(sub * pct)` to that limit;
  - `parseTipCents(raw, sub)` uses the same type rules as before, against
    the scaled limit, with the error "from 0 to <limit>".
- **`src/lib/orders.ts`:** re-exports those; the old `parseTipCents` is
  removed.
- **`src/app/api/checkout/route.ts`:** tip parsing moves after `priceCart`,
  so it is bounded by the **server-repriced** subtotal. A bad tip is still
  400 before Stripe, but a bad cart now reports its cart error first.
- **`src/app/order/page.tsx`:** the presets come from `tip.ts`, and the tip
  is `presetTipCents(subtotal, pct)`. The form has no custom-tip input, so
  the custom tip was tested through the API.
- **`src/lib/request-body.ts`:** `drainBriefly`, called before
  `reader.cancel()` once the cap trips (see 3.4).
- **Tests:** `test/server/body-caps.server.test.ts` warms both POST routes
  in `beforeAll`, and its declared-length limits go from 1 s to 2 s. Also
  new: `tip.test.ts`, `request-body.test.ts` (+38) and `route.test.ts`
  (+43).
- **`docs/decisions.md`:** D-017 describes the scaled tip limit and the
  drain. Its sentence "a stalled sender cannot delay the answer past the
  time bound" is **false on the real server** (3.4).
- No dependency, lockfile, middleware, webhook or config changes.

### 3.3 Tips (RB1) and stale prices

- **D10 (API, 50 lines x 12, subtotal $8,400):** the 15%, 18% and 20%
  preset tips each get 200, with one fake-Stripe call each.
- **U7 (real headless Chromium):** the exact round-2 repro. 27 dishes x 12
  are added through the item pages, for a subtotal of $6,120.00. The 15%,
  18% and 20% preset buttons (tips 91800, 110160 and 122400 cents) each
  check out, reach the fake Stripe, write a row and redirect to the
  (intercepted) session URL.
- **D11 (custom tip via the API):** exactly 100% (840000) is accepted and
  stored. 100% + 1 cent gets 400 "Tip must be a whole number of cents from 0
  to 840000", with no Stripe call and no row.
- **$1,000 floor:** on a $14 cart, tips of 99999 (D12) and 100000 (D8) are
  accepted and 100001 is refused (D5). All the round-2 bad shapes are still
  400 before Stripe (D1 to D7g).
- **Forged prices (D13):** a body carrying `subtotalCents: 99999999`, or a
  line carrying `unitPriceCents: 99999999`, with a $50,000 tip on a $14
  cart: both get 400 against the server limit (100000), with no Stripe
  call and no row. **No bypass.**
- **Stale prices, corrected run (`u8.mjs`).** The harness's U8 wrote the
  stale cart into the `checkout.stripe.com` origin's sessionStorage after
  the redirect, so it never tested anything. `u8.mjs` writes it into the
  bistro origin before loading `/order`:

```
U8a stale-high small: stored unit prices x6; page subtotal $2592; 20% tip sent 51840; /api/checkout 200; Stripe calls 1; row {"s":43200,"t":51840}
U8b stale-low: stored unit prices x0.2; page subtotal $86.40; 20% tip sent 1728; /api/checkout 200; Stripe calls 1; row {"s":43200,"t":1728}
U8c stale-high tiny: stored unit prices x6; page subtotal $216; 20% tip sent 4320; /api/checkout 200; Stripe calls 1; row {"s":3600,"t":4320}
```

  So:
  - The server always charges its own subtotal. The tip is always within
    `max($1,000, server subtotal)`, so there is no bypass.
  - A spurious 400 needs a client subtotal at least 5x the real one **and**
    a preset tip over $1,000 (D14 shows the server side of that: 890000
    against a limit of 840000 gets 400).
  - The UI does not reprice a stale cart. The page shows the stale subtotal,
    and the tip percentage is taken of the stale amount: U8a's "20%" tip was
    120% of the real subtotal and was accepted under the floor. This is
    pre-existing (the cart has always kept prices from add-to-cart), and
    Stripe's hosted page shows the real line items. Warning only.

### 3.4 Byte cap after the drain (the blocker)

Probes against `dv31-none` at `7e32773` (`stallprobe.log`, verbatim):

```
S-a 9 KB burst, then silence (12 s): null firstByte=null ms closedBy=client-timeout
S-b 9 KB burst, silence 3 s, then 1 byte: 413 firstByte=3005 ms closedBy=response-complete {"error":"Request body is too large"}
S-c 64 KB burst, then silence (12 s): null firstByte=null ms closedBy=client-timeout
S-d 200 KB burst, then silence (12 s): 413 firstByte=17 ms closedBy=response-complete {"error":"Request body is too large"}
S-e 9 KB as nine 1 KB chunks, then silence (12 s): null firstByte=null ms closedBy=client-timeout
```

The same probes against the `ad5713e` diagnostic image
(`stallprobe-r2diag.log`, verbatim):

```
S-a 9 KB burst, then silence (12 s): 413 firstByte=27 ms closedBy=response-complete {"error":"Request body is too large"}
S-b 9 KB burst, silence 3 s, then 1 byte: 413 firstByte=7 ms closedBy=response-complete {"error":"Request body is too large"}
S-c 64 KB burst, then silence (12 s): 413 firstByte=7 ms closedBy=response-complete {"error":"Request body is too large"}
S-d 200 KB burst, then silence (12 s): 413 firstByte=6 ms closedBy=response-complete {"error":"Request body is too large"}
S-e 9 KB as nine 1 KB chunks, then silence (12 s): 413 firstByte=8 ms closedBy=response-complete {"error":"Request body is too large"}
```

How long the hold lasts (`holdprobe.log`, verbatim; 50 concurrent senders
against `dv31-ret` at `7e32773`):

```
H1 50 senders cross the cap by ~800 bytes then stall: outcomes {"408|server-end":50}; first answer 301151 ms, last 301158 ms; sample body
```

**Reading:**
- S-b pins the mechanism: the 413 is released exactly when the next byte
  arrives, 3005 ms later.
- S-d escapes because it had already delivered the drain's full 64 KB
  budget, so no read was left pending.
- Every stall probe that crossed the cap by less than 64 KB (S-a, S-c, S-e)
  hung.
- A normal client is not affected, because a complete body ends the stream
  and the pending read settles.
- A hostile client can hold a request open for about 5 minutes per
  connection for about 9 KB of upload. That is the slowloris exposure the
  first round of this PR set out to remove, and it now applies to exactly
  the over-cap requests the cap is meant to reject quickly.

**The builder's server suite passes 6 of 6 (three runs, including a cold
first run of 10.5 s) but cannot catch this.** Its `neverEndingUpload` keeps
writing every 20 ms, so a pending read always settles.

### 3.5 Byte-cap matrix and B-R7

- **Declared length:**
  - B-R2: 1 MB declared gets 413 in 5 ms, with 0 body bytes sent.
  - B-R9: 5 MB declared gets 413 in 5 to 7 ms on checkout, both admin routes
    and the portal. This path does not drain.
- **Endless chunked:** B-R1 and B-R4 get 413, but after about **510 ms**
  (69658 bytes), where round 2 took 7 ms. The harness sends its next chunk
  every 500 ms, and the 413 waits for it (see 3.4).
- **Trickle:** B-R8 gets 413 at 9293 bytes after 2760 ms (round 2: 2442
  ms), about one 300 ms interval later for the same reason.
- **B-R6, 12 MB:** 413 in 7 ms. The client had handed 1,442,004 bytes to
  its socket by the time the response arrived, over the 1 MB line I set in
  round 2. The server reads at most about 64 KB past the cap, so the rest
  sat in loopback socket buffers. Round-2 values under the same check were
  786554, 917644 and 983189. Recorded as a FAIL against my threshold; **not
  a defect.** It gives no evidence of buffering: memory stayed flat and
  there was no Next clone warning.
- **Memory (B-R7):** 240 uploads of 9 MB over 16.5 s. Container memory went
  from 176.6 MiB to a peak of 178.1 MiB; there is no buffering.
- **Reset rate (B-R7):** **29 of 240 (12%)** were ended by a TCP reset
  before the 413 could be read, against 12 of 200 (6%) in round 2. The
  isolation probe (`b7probe-r3.log`) gave 2 of 160 in waves plus 2
  `ECANCELED` of 40 sequential, against 1 of 160 and 1 of 40 in round 2.
  The drain did **not** make the 413 more readable. The slowest upload
  ended at 2053 ms (limit 2000), so none hung.
- The outcome guarantees still hold: every over-cap request is refused and
  nothing is stored (B-R5, B-D3, the B-*-1/2/3 boundaries).

### 3.6 /api without middleware, W2 to W5, and the PR #28 regression

- A1 to A10 all pass, unchanged from round 2 (route-set cookie, forged
  cookies, GET and admin scoping, webhook fails closed).
- W2: a hung Stripe gets 503 in 20.5 s after 2 attempts (C12).
- W3: V4 returns the JSON 500.
- W4: D1 to D8b.
- W5: D9, where x200 equals x1.
- The C, E and F sections all pass.
- PR #28 regression (`regress-r3.log`): **221 of 221**, plus 7 N/A and 2
  SKIP.
- Layer 1: vitest 150/150 across 17 files, tsc exit 0, lint 0 errors and 3
  pre-existing warnings.

### 3.7 Verbatim attack log (round 3)

```

== C: checkout payment path, Stripe failure modes (fake Stripe in dv31-fake, reset listener in dv31-test) ==
PASS  C1a  Stripe unreachable, connection refused: 503 JSON with exactly the fixed message  [503 596 ms {"error":"The payment service is temporarily unavailable, so your order was not ]
PASS  C1b  connection refused: NO order row written  [orders 20->20]
PASS  C1c  connection refused: response leaks no internals  [none]
PASS  C2a  Stripe connection reset mid-handshake (dv31-test listener): 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C2b  Stripe connection reset mid-handshake (dv31-test listener): Stripe was actually attempted, and NO order row was written  [stripe calls 4->6, orders 21->21]
PASS  C2c  Stripe connection reset mid-handshake (dv31-test listener): response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C3a  Stripe 400 invalid_request_error carrying a sentinel message: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C3b  Stripe 400 invalid_request_error carrying a sentinel message: Stripe was actually attempted, and NO order row was written  [stripe calls 0->1, orders 20->20]
PASS  C3c  Stripe 400 invalid_request_error carrying a sentinel message: response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C4a  Stripe 500 api_error: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C4b  Stripe 500 api_error: Stripe was actually attempted, and NO order row was written  [stripe calls 1->3, orders 20->20]
PASS  C4c  Stripe 500 api_error: response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C5a  Stripe 200 with a non-JSON body: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C5b  Stripe 200 with a non-JSON body: Stripe was actually attempted, and NO order row was written  [stripe calls 3->4, orders 20->20]
PASS  C5c  Stripe 200 with a non-JSON body: response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C6a  Stripe session with url null: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C6b  Stripe session with url null: Stripe was actually attempted, and NO order row was written  [stripe calls 4->5, orders 20->20]
PASS  C6c  Stripe session with url null: response leaks no internals (sentinel, host, errno, key, stack)  [none]
INFO  checkout log lines: [checkout] Stripe session create failed: StripeConnectionError | [checkout] Stripe session create failed: StripeInvalidRequestError (amount_too_large) | [checkout] Stripe session create failed: StripeAPIError | [checkout] Stripe session create failed: Error
PASS  C7  server log lines for Stripe failures carry only the error type/code: no sentinel message, no key, no host  [7 lines]
PASS  C7b  the 400 case is logged with its Stripe code (StripeInvalidRequestError / invalid_request_error (amount_too_large))  []
PASS  C8a  ok session: 200 with { url, orderId }, url is the session URL  [200 HB-GXBT5]
PASS  C8b  ok session: the order row did NOT exist while Stripe was being called (checked by the fake from the DB)  [rowDuringCall=false]
PASS  C8c  ok session: exactly one new row, pending, tagged with the caller visitor id, session id stored in the same insert  [pending sess=true]
PASS  C8d  ok session: client_reference_id, metadata[order_id], payment_intent_data[metadata][order_id] all equal the returned orderId  [HB-GXBT5]
PASS  C8e  ok session: success_url and cancel_url carry the same orderId  [/order/confirmation/HB-GXBT5?session_id={CHECKOUT_SESSION_ID}]
PASS  C8f  ok session: totals agree (row subtotal + tip = row total = sum of Stripe line items); tip sent as its own line  [1400+250=1650, stripe 1650]
PASS  C9a  insert fails after Stripe succeeded: JSON 500 with the fixed "could not be saved" message (not an empty 500)  [500 application/json {"error":"Your order could not be saved. Please try again."}]
PASS  C9b  insert fails: the squatting row is untouched (not overwritten by the visitor), and no second row appears  [{"n":"Squatter Row dv31","v":"dv31-squatter","s":"received","sid":null}]
PASS  C9c  insert fails: the response carries no session URL, so the orphan test session cannot be paid by this visitor  [{"error":"Your order could not be saved. Please try again."}]
PASS  C9d  insert fails: log names the order id and error class only (no customer name or phone)  [[checkout] could not save order HB-3V3J7: SqliteError]
PASS  C10  slow Stripe (3 s): 200 and a row, nothing written before the session came back  [200 3019 ms]
PASS  C11  20 concurrent checkouts: 20 x 200, 20 distinct order ids, 20 rows each tagged with its own visitor, no row existed during any Stripe call  [20 ok, 20 ids, 20 rows]

== D: tipCents (W4) and duplicate add-ons (W5), fake Stripe in ok mode ==
PASS  D1  tip -500: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D2  tip -0.4: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D3  tip 1e400 (JSON Infinity): 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D4  tip 1e20: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D5  tip 100001 (cap + 1): 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D6  tip 2^53+1: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7a  tip "abc": 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7b  tip true: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7c  tip [5]: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7d  tip " 7 ": 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7e  tip 0.5: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7f  tip "100": 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7g  tip {}: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D8  tip 100000 accepted (row tip 100000, Stripe Tip line 100000); 0, -0, null and absent give tip 0 with no Tip line  [200/100000 200/0 200/0 200/0 200/0]
PASS  D8b  across every tip tried, no stored order has a tip outside 0..100000, a non-integer tip, or a total below its subtotal  [0 bad rows]
INFO  D10 50 lines x 12 (subtotal 840000): 15% 200/1, 18% 200/1, 20% 200/1 (status/Stripe calls)
PASS  D10  big cart (subtotal $8,400): the 15%, 18% and 20% preset tips each check out and reach Stripe  [{"0.15":"200/1","0.18":"200/1","0.2":"200/1"}]
PASS  D11  custom tip on the big cart: exactly 100% (840000) accepted and stored; 100% + 1 cent -> 400 "from 0 to 840000", no extra Stripe call or row  [200/400 Tip must be a whole number of cents from 0 to 840000]
PASS  D12  the $1,000 floor on a $14 cart: tip 99999 accepted (limit is the floor, not 100% of $14); 100000 accepted and 100001 refused per D8/D5  [200]
PASS  D13  forged client subtotal / unitPriceCents with a $50,000 tip on a $14 cart: 400 against the server limit (100000), no Stripe call, no row (no bypass)  [400/400]
INFO  D14 tip 20% of a subtotal 6x the real one (stale-price client) on the $8,400 cart = 890000 > limit 840000: 400
INFO  D9 harbor-smash-burger: plain 1700, bacon x1 2000, bacon x200 2000; stored extras for x200 = ["bacon"]; [bacon,egg,bacon,egg,egg] 2200 vs [bacon,egg] 2200
PASS  D9  W5: "bacon" x200 is priced and stored exactly like "bacon" x1 (one bacon), and mixed duplicates equal the de-duplicated set  [2000=2000=1700+300, 2200=2200]

== E: malformed carts and bodies (looking for any bare or non-JSON 500) ==
INFO  E statuses: lines [null]:400, lines [1]:400, lines ["x"]:400, lines [[]]:400, slug object:400, quantity "1":200, quantity 1.5:400, quantity -1:400, quantity 13:400, selections "abc":400, selections 5:200, selections []:200, selections null:200, selections __proto__:400, selections constructor:400, burger bun array:400, burger bun null:400, burger extras object:400, burger extras [null]:400, burger extras "bacon":200, lines array-like object:400, 51 lines:400, 50 lines:200, fulfillment object:400, customerName object:400, customerName array:400, customerPhone number:400, body null:400, body []:400, body "str":400, body 123:400, body true:400, empty body:400, huge slug 30 KB:400, unicode slug:400
PASS  E1  35 malformed carts/bodies against a working Stripe: no 5xx, every response is JSON  [none]
PASS  E2  51 lines -> 400 and 50 lines accepted  [51 lines:400,50 lines:200]

== F: field limits after trim, UTF-16 units vs UTF-8 bytes, non-string values (reservations on dv31-none, checkout on dv31-fake) ==
PASS  F-name  reservation name: 100 ASCII accepted and stored whole; 101 -> 400 "Name must be at most 100 characters", nothing stored  [201/400]
PASS  F-phone  reservation phone: 32 ASCII accepted and stored whole; 33 -> 400 "Phone must be at most 32 characters", nothing stored  [201/400]
PASS  F-email  reservation email: 254 ASCII accepted and stored whole; 255 -> 400 "Email must be at most 254 characters", nothing stored  [201/400]
PASS  F-notes  reservation notes: 500 ASCII accepted and stored whole; 501 -> 400 "Notes must be at most 500 characters", nothing stored  [201/400]
PASS  F-mb1  reservation name: 100 x e-acute (2 bytes each) accepted, stored intact  [201 units=100 bytes=200]
PASS  F-mb2  reservation name: 50 emoji (100 UTF-16 units, 200 bytes) accepted, stored intact  [201 units=100 bytes=200]
PASS  F-mb3  reservation name: 51 emoji (102 units) -> 400  [400 units=102 bytes=204]
PASS  F-mb4  reservation name: 100 CJK (300 bytes) accepted  [201 units=100 bytes=300]
PASS  F-mb5  reservation name: 101 CJK -> 400  [400 units=101 bytes=303]
PASS  F-mb6  reservation name: 99 ASCII + 1 emoji (101 units, what maxLength also blocks) -> 400  [400 units=101 bytes=103]
PASS  F-mb7  reservation name: 50 decomposed e + combining accent (100 units) accepted  [201 units=100 bytes=150]
PASS  F-worst  reservation: every field at its limit with the worst-case JSON encoding (\u escapes) is 5409 bytes, under 8192, and is accepted and stored intact  [201 5409 bytes]
PASS  F-trim  reservation name: 100 chars wrapped in ASCII and ideographic whitespace accepted, stored trimmed at 100  [201]
PASS  F-trim2  reservation name of only whitespace -> 400 (required), nothing stored  [400 {"error":"name, phone, partySize, date, and time are require]
PASS  F-types  reservation: non-string name/phone/email/notes -> 400 "<Field> must be text", nothing stored (no "[object Object]" rows)  [name=123:400:Name must be text | name={"a":1}:400:Name must be text | phone=["555"]:400:Phone must be text | email=true:400:Email must be text | notes={"toStrin]
INFO  F-lone lone high surrogate in name: 201 stored="Lone ��� surrogate a6f7a5"
PASS  F-lone  reservation name with a lone UTF-16 surrogate: handled (201 or 400), not a 500  [201]
PASS  F-ck-customerName  checkout customerName: 50 emoji (100 units) accepted and stored intact; 101 units -> 400 "Name must be at most 100 characters" with NO Stripe call and no row  [400/200 stripe 50->50]
PASS  F-ck-customerPhone  checkout customerPhone: 16 emoji (32 units) accepted and stored intact; 33 units -> 400 "Phone must be at most 32 characters" with NO Stripe call and no row  [400/200 stripe 51->51]
PASS  F-ck-customerEmail  checkout customerEmail: 127 emoji (254 units) accepted and stored intact; 255 units -> 400 "Email must be at most 254 characters" with NO Stripe call and no row  [400/200 stripe 52->52]
PASS  F-ck-deliveryAddress  checkout deliveryAddress: 150 emoji (300 units) accepted and stored intact; 301 units -> 400 "Delivery address must be at most 300 characters" with NO Stripe call and no row  [400/200 stripe 53->53]
PASS  F-ck-types  checkout: object customerName -> 400 "Name must be text", no Stripe call  [400]

== B: byte caps on the running production server (raw sockets, dv31-none and dv31-fake) ==
PASS  B-res-1  /api/reservations: exactly 8192 bytes with Content-Length handled normally (201), 8193 -> 413 {"error":"Request body is too large"}  [201/413 {"error":"Request body is too large"}]
PASS  B-res-2  /api/reservations: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 201 then 413  [201/413]
PASS  B-res-3  /api/reservations: exactly 2 rows from the two at-cap requests, none from the over-cap ones  [38->40]
PASS  B-ck-1  /api/checkout: exactly 32768 bytes with Content-Length handled normally (200), 32769 -> 413 {"error":"Request body is too large"}  [200/413 {"error":"Request body is too large"}]
PASS  B-ck-2  /api/checkout: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 200 then 413  [200/413]
PASS  B-ck-3  /api/checkout: exactly 2 rows from the two at-cap requests, none from the over-cap ones  [69->71]
PASS  B-admO-1  /api/admin/orders/<id>: exactly 1024 bytes with Content-Length handled normally (400), 1025 -> 413 {"error":"Request body is too large"}  [400/413 {"error":"Request body is too large"}]
PASS  B-admO-2  /api/admin/orders/<id>: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 400 then 413  [400/413]
PASS  B-admR-1  /api/admin/reservations/<id>: exactly 1024 bytes with Content-Length handled normally (400), 1025 -> 413 {"error":"Request body is too large"}  [400/413 {"error":"Request body is too large"}]
PASS  B-admR-2  /api/admin/reservations/<id>: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 400 then 413  [400/413]
PASS  B-portal-1  /api/auth/portal-handoff: exactly 16384 bytes with Content-Length handled normally (400/401/403/503), 16385 -> 413 {"ok":false,"error":"payload_too_large"}  [401/413 {"ok":false,"error":"payload_too_large"}]
PASS  B-portal-2  /api/auth/portal-handoff: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 400/401/403/503 then 413  [401/413]
INFO  B-mb bodies 8192 / 8193 bytes, notes 2698 UTF-16 units of CJK
PASS  B-mb  reservation notes of CJK: 8192-byte body in 7-byte chunks (splitting characters) -> not 413; 8193 bytes -> 413  [400 {"error":"Notes must be at most 500 characters"} / 413]
PASS  B-under  understated Content-Length (12) with a 40 KB body: server reads 12 bytes -> 400, the rest is not a valid request, nothing stored, server fine  [400 ]
PASS  B-over  overstated Content-Length (5000) with a short valid body, client gives up: no response, nothing stored, server fine  [null client-timeout]
PASS  B-gzip  gzip "bomb" (4908 bytes on the wire, 5 MB inflated) -> 400, not inflated, nothing stored  [400]
INFO  B-te-cl Content-Length together with Transfer-Encoding: 400
PASS  B-1mb  the #28 repro over chunked transfer: 1 MB name -> 413 JSON, nothing stored  [413]
PASS  B-R1  READ-TIME CAP: a chunked upload that passes 8 KB and keeps going gets its 413 while still uploading, within 2 s  [413 after 518 ms, 69658 bytes sent at response (response-complete)]
PASS  B-R2  READ-TIME CAP: a declared Content-Length of 1,000,000 is refused up front, before any body byte is sent, within 1 s  [413 after 5 ms, 0 body bytes sent]
INFO  B-R3 (information only, see first-run harness corrections) Content-Length 1,000,000 streamed: 413, response after 1000000 bytes sent, 20 ms
PASS  B-R4  READ-TIME CAP (checkout, 32 KB): a never-ending chunked upload gets a 413 while still uploading, within 2 s  [413 after 509 ms, 69666 bytes (response-complete)]
PASS  B-R8  READ-TIME CAP, trickle: 1 KB every 300 ms is answered 413 right after the total passes 8 KB (about 9 chunks, under 5 s), not at a timeout  [413 after 2760 ms, 9293 bytes sent]
PASS  B-R9  READ-TIME CAP: Content-Length 5,000,000 with no body is refused up front (413, under 1 s) on checkout, both admin routes and the portal handoff  [/api/checkout:413/6ms /api/admin/orders/<id>:413/6ms /api/admin/reservations/<id>:413/5ms /api/auth/portal-handoff:413/5ms]
INFO  B-D drain probes: burst+stall null after null ms; burst+1B/10ms 413 after 64 ms; burst+flood 413 after 7 ms
FAIL  B-D1  drain bound, stalled sender: cap crossed then silence -> 413 within 500 ms (the 50 ms drain cannot be held open)  [null null ms]
PASS  B-D2  drain bound, 1-byte trickle after the cap -> 413 within 500 ms (time bound, not byte bound)  [413 64 ms]
PASS  B-D3  drain bound, flood after the cap -> 413 within 500 ms; nothing stored by B-D1..3  [413 7 ms]
FAIL  B-D4  100 concurrent over-cap senders that then stall: all 413, slowest under 2 s (no slowloris hold from the drain)  [0/100, slowest Infinity ms]
PASS  B-R5  after B-R1..B-R9 and B-D1..B-D4 nothing was stored and the servers still answer  []
INFO  B-R6 12 MB chunked: 413 after 7 ms, 1442004 bytes sent when the response arrived (97 ms total); Next body-clone warning: none
FAIL  B-R6  12 MB chunked upload: 413 long before the upload finishes (under 1 MB sent), nothing stored, and no Next middleware body-clone warning  [413 at 1442004 bytes]
INFO  B-R7 240 x 9 MB chunked uploads in waves of 20 over 16544 ms: 211 answered 413, 29 ended by a TCP reset before the 413 could be read (error:ECONNRESET); slowest end after 2053 ms; 10 memory samples, 176.6MiB before, peak 178.1MiB (first run: 105 MiB -> 389 MiB for one wave)
FAIL  B-R7  sustained waves of 20 concurrent 9 MB uploads for 15 s: every one ends within 2 s, with 413 or (at most 2 percent) a TCP reset, never a success or a hang; container memory grows by under 50 MiB; server fine  [240 uploads, 29 resets, slowest 2053 ms, mem 176.6MiB -> 178.1MiB, 10 samples]

== A: /api routes with the middleware skipped (cookie minting, scoping, forged cookies) ==
PASS  A1  cookieless GET /api/reservations: 200 and no Set-Cookie (middleware skipped); cookieless GET /menu still gets hb_visitor  [200 api-cookie=false page-cookie=true]
PASS  A2  cookieless POST /api/reservations: 201, the route sets hb_visitor (HttpOnly, SameSite=Lax, Path=/, Max-Age=2592000, Secure) and the row is tagged with that id  [201 hb_visitor=<v4>; Path=/; Expires=Mon, 19 Oct 2026 09:35:05 GMT; Max-Age=2592000; Secure; HttpOnly; SameSite=lax]
PASS  A3  cookieless POST /api/checkout: 200, the route sets hb_visitor and the pending row is tagged with it  [200 tag==cookie true]
PASS  A4  POST with a valid cookie: no new Set-Cookie, row tagged with the existing id  [201]
PASS  A5  forged cookies on a write (8 variants: seed, SEED, url-encoded seed, uppercased real id, empty, 4 KB, seed-then-real duplicate, SQL-shaped): each gets a fresh v4 cookie and the row is tagged with it, never seed and never NULL  [201 201 201 201 201 201 201 201]
PASS  A6  no row written through /api in this section is tagged seed or NULL  [0]
PASS  A7  GET /api/orders/<own pending order>: owner 200 with no PII keys; another visitor, no cookie and forged seed all 404  [200/404/404/404]
PASS  A8  admin POST on a visitor order from another visitor, no cookie, forged seed: 404; the order is unchanged  [404/404/404]
PASS  A9  admin POST on a seed order with no cookie still works (staff demo): 200 preparing  [200]
PASS  A10  Stripe webhook still fails closed with no signing secret (503), no cookie set  [503]

== U: headless Chromium (390x844): form limits and the 503 message ==
PASS  U1  /reservations inputs carry maxLength name 100, phone 32, email 254, notes 500  [[100,32,254,500]]
PASS  U2  typing 150 characters into the reservation name keeps 100  [100]
PASS  U3  /order checkout inputs carry maxLength name 100, phone 32, email 254, address 300  [text:100,tel:32,email:254,radio:-1,radio:-1,text:300]
PASS  U4  UI checkout while Stripe fails: /api/checkout 503, the "payment service is temporarily unavailable" message is shown, page intact, no row  [503 rows 73->73]
PASS  U5  UI checkout with Stripe up: 200, the browser is sent to the session URL (intercepted, never reaches Stripe), one pending row  [200 https://checkout.stripe.com/c/pay/cs_test_dv31_8995dc5313419]
PASS  U6  no uncaught page errors in the UI run  []
INFO  U7 real UI: 27 dishes x 12 via the item pages, subtotal 612000 cents: 15% tip 91800 -> 200 + Stripe + redirect; 18% tip 110160 -> 200 + Stripe + redirect; 20% tip 122400 -> 200 + Stripe + redirect
PASS  U7  real UI: the $6,120 round-2 repro checks out at the 15%, 18% and 20% presets, each reaching the fake Stripe and redirecting to the session  [15%:200 18%:200 20%:200]
INFO  U8 stale-price cart (stored prices 6x real): form subtotal 3672000, 20% tip sent 122400; server subtotal 612000, limit 612000 -> 200 (redirected); Stripe calls 1
FAIL  U8  stale-price cart: the server bounds the tip by ITS subtotal, so a tip above that is refused (400, no Stripe call), and the charged subtotal is the server price, never the stale one (no bypass)  [200 tip 122400]

== C12: Stripe accepts the TLS connection and never answers (timeout path) ==
INFO  C12 hang: 503 after 20.5 s, 2 Stripe attempt(s)
PASS  C12  W2: Stripe that never answers: JSON 503 with no row within 25 s, after exactly 2 attempts (10 s timeout, 1 retry)  [503 after 20.5 s, 2 attempts]

== K: key material ==
PASS  K1  the fake sk_test_ keys never appear in either container log  [fake:clean test:clean]

== R: runtime ==
INFO  R-none request-aborted log lines from the harness's deliberately abandoned uploads: 0
PASS  R-none  none: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
INFO  R-test request-aborted log lines from the harness's deliberately abandoned uploads: 0
PASS  R-test  test: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
INFO  R-fake request-aborted log lines from the harness's deliberately abandoned uploads: 0
PASS  R-fake  fake: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]

TOTAL 122/127 passed  ({"PASS":122,"FAIL":5})
```

PR #28 regression harness at 7e32773 (`regress-r3.log`, fresh containers, same harness as round 2):

```

== P: per-visitor scope (container none, no Stripe key) ==
PASS  P1  A first request: 200 and hb_visitor Set-Cookie  [200]
PASS  P2  cookie flags: HttpOnly, SameSite=Lax, Path=/, Max-Age=2592000, Secure  [hb_visitor=<v4>; Path=/; Expires=Mon, 19 Oct 2026 09:31:57 GMT; Max-Age=2592000; Secure; HttpOnly; SameSite=lax]
PASS  P3  A id is a lowercase v4 UUID  [v4]
PASS  P4  A second request keeps its id (no new hb_visitor Set-Cookie)  [0 set-cookie]
PASS  P5  B gets its own distinct valid id  [distinct]
PASS  P6  A creates a reservation through the real API -> 201  [201 HR-NN3ZN]
PASS  P7  A reservation row is tagged with A visitor id  [tag==A]
PASS  P8  B creates its own reservation -> 201, tagged B  [201 HR-GGXEG]
PASS  P9  cookieless create -> 201, sets HttpOnly SameSite=Lax cookie, row tagged with that minted id  [201]
INFO  A order HB-AE2C2 (received), HB-CE2C2 (completed); B order HB-BE2C2; legacy HB-LGCYN / RS-LGCYN (visitor_id NULL); A res HR-NN3ZN; B res HR-GGXEG
INFO  unknown-id bodies: api={"error":"Order not found"} adminOrder={"error":"Order not found"} adminRes={"error":"Reservation not found"}
PASS  P10  A: own /reservations/<id> 200 with own name  [200]
PASS  P11  A: own /order/confirmation/<id> 200 showing the order (item line)  [200]
PASS  P12  A: own /api/orders/<id> 200, returns no PII fields  [id,status,statusLabel,fulfillment,updatedAt]
PASS  P13  A: /admin/orders lists A orders (active + recent) and seed  [A_ORD,A_ORD2,seed]
PASS  P14  A: /admin/reservations lists A booking and seed  []
PASS  P15  A: never sees B data (admin orders/reservations)  []
PASS  P16  A: B reservation detail 404  []
PASS  P17  A: legacy NULL rows hidden from A admin views  []
PASS  P18  A: legacy order /api/orders -> 404 and admin POST -> 404  []
PASS  P19  A: legacy reservation detail 404 and admin POST 404  []
PASS  P20  header counts are scoped: A active = B active (B has 1 own received order too), cookieless = seed-only = B - 1  [A=11 B=11]
PASS  X1a  B (own valid cookie): A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X1b  B (own valid cookie): /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X1c  B (own valid cookie): admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X2a  cookieless: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X2b  cookieless: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X2c  cookieless: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X3a  forged seed: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X3b  forged seed: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X3c  forged seed: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X4a  forged SEED: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X4b  forged SEED: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X4c  forged SEED: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X5a  forged url-encoded seed: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X5b  forged url-encoded seed: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X5c  forged url-encoded seed: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X6a  foreign random v4: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X6b  foreign random v4: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X6c  foreign random v4: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X7a  A id uppercased: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X7b  A id uppercased: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X7c  A id uppercased: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X8a  A id, version nibble 1: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X8b  A id, version nibble 1: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X8c  A id, version nibble 1: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X9a  A id with suffix: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X9b  A id with suffix: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X9c  A id with suffix: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X10a  dup: seed then foreign v4: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X10b  dup: seed then foreign v4: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X10c  dup: seed then foreign v4: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X11a  dup: foreign v4 then seed: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X11b  dup: foreign v4 then seed: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X11c  dup: foreign v4 then seed: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X12a  empty value: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X12b  empty value: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X12c  empty value: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X13a  4 KB junk: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X13b  4 KB junk: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X13c  4 KB junk: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X14a  SQL-shaped: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X14b  SQL-shaped: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X14c  SQL-shaped: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  P21  after the attack matrix A order is still received and A booking still confirmed, tags unchanged  [received/confirmed]
PASS  P22  B: 200 random guessed order codes, 0 non-seed foreign orders resolved  [foreign hits=0]
PASS  P23  A: admin POST advance on own order -> 200 preparing  [{"id":"HB-AE2C2","status":"preparing","statusLabel":"Preparing"}]
PASS  P24  A: admin POST seat own booking -> 200 seated  [{"id":"HR-NN3ZN","status":"seated"}]
PASS  P25  B: admin POST on a seed order -> 200 (staff demo still works)  [{"id":"HB-6SVYF","status":"preparing","statusLabel":"Preparing"}]
PASS  P26  every row written in this run is tagged: the only NULL rows are the 2 deliberate legacy inserts  [orders NULL=1 reservations NULL=1]
INFO  static: SELECT ... FROM orders|reservations without the scope predicate: src\lib\orders.ts:272, src\lib\orders.ts:288, src\lib\orders.ts:308, src\lib\reservations.ts:42
PASS  P27  static: only 4 unscoped reads remain (getOrderUnscoped, getOrderByCheckoutSession, slot counts, and the PR #31 unusedOrderId existence probe that returns no row data)  [src\lib\orders.ts:272 src\lib\orders.ts:288 src\lib\orders.ts:308 src\lib\reservations.ts:42]

== K: Stripe test-key guard (per container) ==
PASS  K-none-1  none: valid checkout -> 503 "not configured"  [503 {"error":"Online payment is not configured in this environment. Set STRIPE_SECRET_KEY (test mode) to enable checkout."}]
PASS  K-none-2  none: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 24->24]
PASS  K-none-3  none: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-live-1  live: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-live-2  live: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-live-3  live: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-rk-1  rk: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-rk-2  rk: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-rk-3  rk: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-rklive-1  rklive: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-rklive-2  rklive: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-rklive-3  rklive: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-pklive-1  pklive: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-pklive-2  pklive: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-pklive-3  pklive: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-live-4  live: boot log carries the [startup] refusal  []
PASS  K-rk-4  rk: boot log carries the [startup] refusal  []
PASS  K-rklive-4  rklive: boot log carries the [startup] refusal  []
PASS  K-pklive-4  pklive: boot log carries the [startup] refusal  []
PASS  K-none-4  none: no [startup] refusal (missing key is not a live key), checkout says not configured  []
PASS  K-test-1  test (fake sk_test_): checkout passes the guard and DOES try Stripe (blocked at the pinned host)  [status 503, hits 0->2]
INFO  K-test checkout response: 503 {"error":"The payment service is temporarily unavailable, so your order was not placed. Please try again in a moment."}
PASS  K-test-2  test (PR #31): blocked Stripe -> 503 JSON and no order row written (was: pending row left behind)  [503 orders 20->20]
PASS  K-test-3  test: B on A pending order with ?session_id -> 404 and 0 Stripe connections (scope check runs before reconcile)  [404 hits 2->2]
PASS  K-test-4  test: A on own pending order with ?session_id -> 200, reconcile attempted, fails soft (pending state shown)  [200 hits 2->4]
PASS  K-test-5  test: invalid checkout body -> 400 before any Stripe call  [400]
PASS  K-none-scan  none: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-test-scan  test: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-live-scan  live: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-rk-scan  rk: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-rklive-scan  rklive: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-pklive-scan  pklive: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]

== M: in-place migration of a pre-tagging database (container legacy) ==
PASS  M1  prep ran on a DB without visitor_id (boot log)  []
PASS  M2  server boot added visitor_id to orders and reservations  []
PASS  M3  ISO-timestamp seed rows backfilled to seed (20 orders, 15 reservations)  [20/15]
PASS  M4  app-style legacy rows kept with visitor_id NULL (2 orders, 2 reservations, incl. the 48h-old ones: not purged at boot)  [[{"id":"HB-LGCY2","v":null},{"id":"HB-LGCY3","v":null}][{"id":"RS-LGCY2","v":null},{"id":"RS-LGCY3","v":null}]]
PASS  M5  visitor indexes created  [2]
PASS  M6  fresh visitor: legacy names absent from admin views, seed shown  []
PASS  M7  legacy rows: detail, API and admin POST all 404 (fresh and forged-seed cookies)  [404/404/404/404/404]
PASS  M8  post-migration visitor write -> 201 and tagged  [201]

== T: 24h retention purge (container ret) ==
INFO  inserted per table: V25A (app format, -25h), V25B (ISO, -25h), V23 (-23h), S100 (seed, -100h), N100 (NULL, -100h); created_at V25A=2026-09-18 08:32:43 V25B=2026-09-18T08:32:43.719Z
PASS  T1  hourly gate: 6 requests after insert do not purge (boot run already happened this hour); all 5+5 rows present  [5/5]
PASS  T2  after restart (boot purge): orders -25h rows gone in both timestamp formats; -23h, seed -100h, NULL -100h kept  [N100,S100,V23]
PASS  T3  after restart: reservations same outcome  [N100,S100,V23]
PASS  T4  fresh visitor booking made minutes ago survives  [HR-8XD4R]
PASS  T5  boot log: "[retention] deleted 2 orders and 2 reservations"  [[retention] deleted 2 orders and 2 reservations created by visitors before 2026-09-18T09:32:48.272Z]
PASS  T6  seed rows untouched (20 + 1 orders, 15 + 1 reservations incl. the -100h seed probes)  [21/16]

== E: edge sweep (container none) ==
PASS  E1  reservations: no body -> 400  [400 {"error":"Invalid JSON"}]
PASS  E2  reservations: garbage JSON -> 400  [400 {"error":"Invalid JSON"}]
PASS  E3  reservations: missing fields -> 400  [400 {"error":"name, phone, partySize, date, and time are required"}]
PASS  E4  reservations: partySize as string -> 400  [400 {"error":"partySize must be 1-12"}]
PASS  E5  reservations: partySize 13 -> 400  [400 {"error":"partySize must be 1-12"}]
PASS  E6  reservations: bad date format -> 400  [400 {"error":"date must be YYYY-MM-DD"}]
PASS  E7  reservations: closed Monday -> 409  [409 {"error":"That time slot is no longer available"}]
PASS  E8  reservations: time not a slot (03:00) -> 409  [409 {"error":"That time slot is no longer available"}]
PASS  E9  reservations (PR #31): 1 MB name -> 413 (was 201 stored)  [413 {"error":"Request body is too large"}]
PASS  E9b  reservations: nothing stored for the 1 MB name  [19]
PASS  E10  reservations: HTML/unicode/apostrophes in name -> 201  [201 {"id":"HR-TCZA5"}]
PASS  E11  owner confirmation and admin escape HTML (no raw <script>alert(1) or <img src=x), unicode intact  []
PASS  E12  20 concurrent same-slot bookings: 201 count = remaining capacity (6 - existing), rest 409, slot never over 6  [existing 0, 201 x6, 409 x14, now 6]
PASS  E13  20 concurrent cookieless first requests -> 20 distinct valid v4 ids  [20]
PASS  E14  admin orders POST garbage JSON -> 400  [400 {"error":"Invalid JSON"}]
PASS  E15  admin orders POST unknown action -> 400  [400 {"error":"action must be \"advance\" or \"cancel\""}]
PASS  E16  admin reservations POST status "confirmed" (not allowed) -> 400  [400 {"error":"status must be one of seated, completed, cancelled"}]
PASS  E17  admin orders GET -> 405  [405]
PASS  E18  SQL-shaped ids on /api/orders and admin POST -> 404  [404/404]
PASS  E19  matcher-skipped path /api/orders/<A>.png -> 404 for B and cookieless  [404/404]
PASS  E20  unicode reservation id -> 404, not 500  [404]
PASS  E21  owner illegal transition completed -> cancelled -> 409 (not 404, not 500)  [409 {"error":"Reservation HR-NN3ZN cannot move from \"completed\" to \"cancelled\""}]
PASS  E22  checkout 1 MB body with no key -> 503, no crash  [503]
PASS  E23  4 KB cookie value -> 200 and replaced by a fresh v4 id  [200]

== H: headless Chromium (390x844, container none) ==
PASS  H0  browser A holds hb_visitor: httpOnly, secure, sameSite Lax, v4  [true/true/Lax]
PASS  H0b  browser A keeps the same id across navigations (cookie sent back over http://127.0.0.1)  []
PASS  H1  /reservations shows the demo notice (visible)  []
PASS  H2  /order checkout form (cart with 1 item) shows the demo notice (visible)  []
INFO  H2b checkout submit from UI: 503
PASS  H2b  UI checkout submit with no key -> /api/checkout 503 and the not-configured message is shown in the page, no crash  [503]
PASS  H3  browser A books through the UI and lands on its confirmation with its name  [/reservations/HR-8HJEQ]
PASS  H4  browser B opens A confirmation URL -> 404, A name absent  [404]
PASS  H5  browser B /admin/reservations: A booking absent, scope note shown  []
PASS  H6  browser A /admin/reservations: own booking present  []
PASS  H7  browser A: no console errors across home, menu, reservations, order, booking, admin (the one expected 503 resource error from H2b excluded)  [Failed to load resource: the server responded with a status of 503 (Service Unavailable)]
PASS  H8  browser B: only console error is the expected 404 resource load  [Failed to load resource: the server responded with a status of 404 (Not Found)]

== Q: repo's own assertions (verify/smoke.yml, assertions/home.yml, assertions/reservations.yml) against container none ==
PASS  Q1  smoke.yml / http_status 200  [200]
PASS  Q2  smoke.yml / text_present Dinner by the water, minus the production  []
PASS  Q3  smoke.yml / text_present Harbor Bistro  []
PASS  Q4  smoke.yml / text_present Coastal-inspired, locally sourced  []
PASS  Q5  smoke.yml / selector_present main  []
PASS  Q6  smoke.yml / selector_present a[href='/reservations']  []
PASS  Q7  smoke.yml / selector_present a[href='/menu']  []
N/A  Q8  smoke.yml / header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q9  smoke.yml /menu http_status 200  [200]
PASS  Q10  smoke.yml /menu text_present The Menu  []
PASS  Q11  smoke.yml /menu text_present cooked to order  []
PASS  Q12  smoke.yml /menu selector_present main  []
N/A  Q13  smoke.yml /menu header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q14  smoke.yml /reservations http_status 200  [200]
PASS  Q15  smoke.yml /reservations text_present Reserve a Table  []
PASS  Q16  smoke.yml /reservations text_present Tables for 1 to 12  []
PASS  Q17  smoke.yml /reservations selector_present form  []
PASS  Q18  smoke.yml /reservations selector_present input#date  []
PASS  Q19  smoke.yml /reservations selector_present select#partySize  []
PASS  Q20  smoke.yml /reservations selector_present input#name  []
PASS  Q21  smoke.yml /reservations selector_present input#phone  []
N/A  Q22  smoke.yml /reservations header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q23  smoke.yml /order http_status 200  [200]
PASS  Q24  smoke.yml /order text_present cart  []
PASS  Q25  smoke.yml /order selector_present main  []
N/A  Q26  smoke.yml /order header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q27  smoke.yml /about http_status 200  [200]
PASS  Q28  smoke.yml /about text_present Harbor Bistro  []
PASS  Q29  smoke.yml /about selector_present main  []
N/A  Q30  smoke.yml /about header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q31  smoke.yml /api/reservations?date=2026-07-04 http_status 200  [200]
PASS  Q32  smoke.yml /api/reservations?date=2026-07-04 json_path_equals $.slots  [["16:00","16:30","17:00","17:30","18:00","18:30","19:00","19]
PASS  Q33  assertions/home.yml / http_status 200  [200]
N/A  Q34  assertions/home.yml / header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q35  assertions/home.yml / text_present Dinner by the water, minus the production  []
PASS  Q36  assertions/home.yml / text_present Coastal-inspired, locally sourced, weeknight-easy.  []
PASS  Q37  assertions/home.yml / text_present Reserve a Table  []
PASS  Q38  assertions/home.yml / text_present See the Menu  []
PASS  Q39  assertions/home.yml / text_present This week  []
PASS  Q40  assertions/home.yml / text_present Good fish, short menu, honest hours  []
PASS  Q41  assertions/home.yml / text_present 412 Harborline Drive  []
PASS  Q42  assertions/home.yml / text_present Tue-Sun from 4pm  []
PASS  Q43  assertions/home.yml / text_present Harbor Bistro  []
PASS  Q44  assertions/home.yml / selector_present main  []
PASS  Q45  assertions/home.yml / selector_present section  []
PASS  Q46  assertions/home.yml / selector_present a[href='/reservations']  []
PASS  Q47  assertions/home.yml / selector_present a[href='/menu']  []
PASS  Q48  assertions/home.yml / selector_present ul li a[href^='/menu/']  []
PASS  Q49  assertions/home.yml / selector_present header  []
PASS  Q50  assertions/home.yml / selector_present [data-testid='demo-banner'], footer, [class*='DemoBanner'], [class*='demo']  []
PASS  Q51  assertions/home.yml / lcp_under_ms 1500 (local origin)  [88 ms]
PASS  Q52  assertions/home.yml / no_console_errors   []
SKIP  Q53  assertions/home.yml / axe_no_critical   [axe-core not in harness]
PASS  Q54  assertions/reservations.yml /reservations http_status 200  [200]
N/A  Q55  assertions/reservations.yml /reservations header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q56  assertions/reservations.yml /reservations text_present Reserve a Table  []
PASS  Q57  assertions/reservations.yml /reservations text_present Tables for 1 to 12  []
PASS  Q58  assertions/reservations.yml /reservations text_present Walk-ins always welcome at the bar  []
PASS  Q59  assertions/reservations.yml /reservations text_present Hours  []
PASS  Q60  assertions/reservations.yml /reservations text_present Tuesday  []
PASS  Q61  assertions/reservations.yml /reservations selector_present form  []
PASS  Q62  assertions/reservations.yml /reservations selector_present input#date  []
PASS  Q63  assertions/reservations.yml /reservations selector_present select#partySize  []
PASS  Q64  assertions/reservations.yml /reservations selector_present input#name  []
PASS  Q65  assertions/reservations.yml /reservations selector_present input#phone  []
PASS  Q66  assertions/reservations.yml /reservations selector_present input#email  []
PASS  Q67  assertions/reservations.yml /reservations selector_present textarea#notes  []
PASS  Q68  assertions/reservations.yml /reservations selector_present button[type='submit']  []
PASS  Q69  assertions/reservations.yml /reservations selector_present select#partySize option[value='12']  []
PASS  Q70  assertions/reservations.yml /api/reservations?date=2026-07-07 json_path_equals $.isClosed  [false]
PASS  Q71  assertions/reservations.yml /api/reservations?date=2026-07-06 json_path_equals $.isClosed  [true]
PASS  Q72  assertions/reservations.yml /reservations no_console_errors   []
SKIP  Q73  assertions/reservations.yml /reservations axe_no_critical   [axe-core not in harness]

== R: runtime ==
PASS  R-none  none: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-test  test: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-live  live: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-rk  rk: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-rklive  rklive: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-pklive  pklive: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-ret  ret: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-legacy  legacy: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]

TOTAL 221/221 passed  ({"PASS":221,"FAIL":0,"N/A":7,"SKIP":2})
```

Round-3 combined TOTAL: **343 of 348** (attack 122/127, regression
221/221), plus 7 N/A, 2 SKIP, 150/150 unit tests, 4/4 probe checks, and 6/6
x3 on the server suite.

### 3.8 Theater Check (round 3)

| Builder claimed (7e32773) | Verification found | Verdict |
|---|---|---|
| RB1: limit = max($1,000, subtotal), checked against the server-repriced subtotal | D10, D11, D12, D13; route order confirmed in the diff | CONFIRMED |
| The form uses the shared `presetTipCents`, clamped, so a preset never 400s | U7: all three presets on the $6,120 UI cart check out; D10 on $8,400 | CONFIRMED |
| drainBriefly discards at most 64 KB, for at most 50 ms, so the 413 is readable | memory flat (B-R7). **But the time bound does not hold:** a sender that stops after crossing the cap is held for 301 s and then gets 408 (S-a, S-c, S-e, H1). The 413 waits for the next chunk (S-b, B-R1/B-R4 at ~510 ms). The reset rate did not drop (12% vs 6%) | **THEATER** (time bound, readability); no-buffering CONFIRMED |
| D-017: "a stalled sender cannot delay the answer past the time bound" | false on the built server; `ad5713e` had no such hold (stallprobe-r2diag) | **THEATER** |
| The server suite warms its routes; limits are 2 s | 6/6 cold and warm, three runs | CONFIRMED (it cannot detect the stall regression) |
| 150 unit tests, plus 6 server tests | 150/150; 6/6 | CONFIRMED |
| W2 to W5 and the /api behaviour unchanged | C12, V4, D1 to D9, A1 to A10, regression 221/221 | CONFIRMED |

### 3.9 Round-3 Blockers

**RB3. `drainBriefly` holds stalled over-cap uploads open until Node's
request timeout (new in 7e32773).**

- **Where:** `src/lib/request-body.ts`. After the drain loop gives up
  because `Promise.race([reader.read(), timeout])` resolved on the timeout,
  the read is still pending, and `await reader.cancel()` does not settle
  until more request bytes arrive.
- **Effect:** no 413 and a 301 s hold (408) for any sender that crosses
  the cap by less than 64 KB and goes quiet. The 413 is delayed until the
  next chunk for slow senders.
- **Recommended fix, simplest first:**
  1. Remove `drainBriefly` and go back to the `ad5713e` behaviour, which is
     proven to answer every stall probe in 7 to 27 ms. It has a reset rate
     of a few percent under concurrent 9 MB floods, and only for clients
     that are over the cap.
  2. Or, if the drain stays: do not `await` the cancel. Fire
     `reader.cancel().catch(() => {})` and return the 413 at once.
     Re-measure S-a to S-e, H1 and B-R7 before claiming it helps, because
     this run shows the drain gave no readability gain.
- **Either way:** add a server-suite case that sends about 9 KB chunked
  (crossing the 8 KB cap) and then **stops writing**, and expects 413 in
  under 1 s. The current suite's uploads never pause, so they cannot catch
  this. Also correct the D-017 sentence.
- **Agent tier:** Tier-2 implementer. The merge stays Tier-3, with a
  re-check of S-a to S-e, H1, B-R1/B-R4/B-R8 timings and B-R7.

### 3.10 Round-3 Warnings

- **The reset rate claim is not supported:** 12% under sustained load
  against 6% before (B-R7). It only affects clients that are over the cap.
  If the drain is removed (RB3 option 1), treat this as accepted behaviour.
- **Stale cart prices are shown and tipped on as-is** (U8a). This is
  pre-existing; there is no bypass and no realistic spurious 400. A future
  chore could reprice the cart from `/api/menu` on the order page. Tier-2,
  low priority.
- **Carried over from round 2, still open:**
  - no CI job runs vitest or the server suite;
  - the CI deep gate on main is still the any-report version (it is green
    despite this FAIL); merge `chore/deep-gate-per-pr` first.

### 3.11 Round-3 coverage gaps and cleanup

- **Gaps:** headed Chrome, real Stripe and the live proxy were not run.
  The form has no custom-tip input, so the custom tip was tested only
  through the API.
- **Cleanup:**
  - all `dv31-*` containers (including `dv31-r2diag`) and both images
    (`demo-harborbistro:dv31` and `demo-harborbistro:dv31-r2diag`) were
    removed;
  - the scratch copy of the `ad5713e` source was deleted;
  - both npmrc files were deleted after their builds;
  - the probe test file was removed;
  - `git status --porcelain` was empty before the commit.
- This report is the only file in the commit.

---

# History: round 2 at ad5713e (2026-09-19)

Everything from here down to the next "History" heading is the round-2
report. Its first two header lines are relabeled so the CI gate reads only
the round-3 verdict above.


## Deep Verify: PR #31 checkout 503 with no order row, public request body caps (2026-09-19) [round 2]

Round-2 verdict: FAIL
Round-2 tested commit: ad5713eb5f15f74de827e7919841d002f6fea969

**Re-verify at `ad5713e` (current verdict).** The first run's blocker is
fixed. With the middleware off `/api/`, the byte cap now acts while reading
on a freshly built production image:
- a declared 1 MB body gets 413 in 6 ms, before any body byte is sent;
- an endless chunked upload gets 413 in 7 ms, after 64 KB;
- a trickled one gets 413 right after 8 KB;
- memory under sustained 9 MB upload waves stayed flat (70 to 84 MiB, where
  it was 105 to 389 MiB before).

W2, W3 and W5 behave exactly as claimed. The PR #28 regression harness passed
221 of 221. The builder's real-server suite is a meaningful gate: it fails 4
of 6 against the old middleware.

**It is still FAIL, because the W4 tip cap introduced a new checkout
regression.** The order form sends a default 18% tip, computed as
`Math.round(subtotal * 0.18)`. Once the subtotal passes $5,555.56 (or $5,000
at the 20% preset), that tip is over the new 100000-cent cap. The server then
refuses the whole checkout with "Tip must be a whole number of cents from 0
to 100000". This was reproduced through the real UI in headless Chromium: 27
dishes x 12 added through the item pages, subtotal $6,120.00, default tip
$1,101.60, `/api/checkout` 400, and the message was shown on the page (U7).
It is a small fix; see Re-verify Blockers.

Re-verify totals:
- attack harness: 116 of 119;
- PR #28 regression: 221 of 221, plus 7 N/A and 2 SKIP;
- unit tests: 136 of 136;
- in-process collision probe: 4 of 4;
- builder's server suite: 6 of 6 warm (it failed its first cold run by
  401 ms);
- gate check: the same suite against the old middleware failed 4 of 6, as it
  should.

The 3 attack FAILs are D10 and U7 (the tip regression, at the API and in the
UI) and B-R7 (a TCP-reset rate under load, which is a warning, not a cap
failure). The first run (FAIL at `0a83724`) is kept below as history.

## 0. Re-verify (round 2) at ad5713e (2026-09-19)

### 0.1 Scope

- **Target:** PR #31 head `ad5713eb5f15f74de827e7919841d002f6fea969`, pulled
  with `git pull --ff-only`. It is the builder's commit on top of the first
  report (`90cc60c`).
- **Mode:** deep, layers 1, 2, 3, 4 and 6. Layer 5 (headed Chrome) was not
  run, same reason as before.
- **Environment:** the same rules as the first run.
  - One image, `demo-harborbistro:dv31`, was rebuilt from `ad5713e` with the
    npm secret pattern. The temporary npmrc was deleted right after the
    build, and the token was never printed.
  - The build ran seed ("60 menu items, 20 orders, 15 reservations"),
    seed verification ("passed") and `next build` ("Compiled successfully").
  - The built `server.js` carries `middlewareClientMaxBodySize: 65536`.
  - The compiled middleware matcher starts `(?!api\/|_next\/static|...`.
  - The same nine `dv31-*` containers ran on `127.0.0.1:18411-18419`, all
    with `--add-host api.stripe.com:127.0.0.1`: fake keys, the counting
    listener, and the fake Stripe in `dv31-fake`.
  - The final regression run and the final attack run each started on freshly
    created containers.
- The builder's server suite runs the built `.next/standalone/server.js` as
  a local process on a random loopback port, with its own temp database and a
  placeholder `sk_test_` key. It has no network egress to Stripe.
- The live container, the public URL, demo-proxy and cloudflare-config were
  not touched.
- Evidence: the same scratch dir as the first run.
  - Harness logs: `attack-r2final.log`, `regress-r2.log`, `b7probe.mjs` output
    (quoted below).
  - Layer 1 logs: `vitest-r2.log`, `unitprobe-r2.log`.
  - Server suite logs: `serversuite-head*.log`, `serversuite-oldmw.log`,
    `serversuite-oldboth.log`.
  - Build log: `build2.log`.

### 0.2 Diff review, `0a83724` to `ad5713e`

`git diff 0a83724 ad5713e --stat` lists 11 files. One is this report,
committed as `90cc60c`. The builder's commit itself (`90cc60c..ad5713e`)
touches 10 files, and every change matches what the builder listed:

- **`src/middleware.ts`:** the matcher adds `api/` to the negative lookahead.
  The comment explains the reason (D-017).
- **`next.config.mjs`:** `experimental.middlewareClientMaxBodySize: "64kb"`.
- **`src/lib/stripe.ts`:** `STRIPE_CLIENT_OPTIONS = { timeout: 10_000,
  maxNetworkRetries: 1 }`, passed to `new Stripe(...)`.
- **`src/lib/orders.ts`:**
  - `MAX_TIP_CENTS = 100_000`;
  - `parseTipCents` accepts absent or null as 0, and otherwise only a JSON
    number that is a non-negative integer no larger than the cap (it folds
    -0 to 0);
  - multi-select ids are de-duplicated with a `Set`.
- **`src/app/api/checkout/route.ts`:**
  - uses `parseTipCents`, and 400s before Stripe on a bad tip;
  - wraps `unusedOrderId()` in a try that returns the same JSON 500 as a
    failed insert;
  - adds `logSaveFailure` (order id and error class only).
- **Tests:** `route.test.ts` (+122), `stripe-mode.test.ts` (+12), the new
  `test/server/body-caps.server.test.ts` (246) and `vitest.server.config.ts`.
- **`docs/decisions.md`:** D-017 is extended and accurate to what was
  measured, including that an understated Content-Length ends in a 400 by
  HTTP framing.
- No dependency, lockfile, webhook or page changes. Nothing unexpected.

### 0.3 Results by category

| Category | Result | Evidence |
|---|---|---|
| read-time byte cap (first-run B1) | PASS | B-R1, B-R2, B-R4, B-R6, B-R8, B-R9 (all under 2.5 s, most under 10 ms); memory flat in B-R7 |
| byte cap outcome and boundaries | PASS | B-*-1/2/3, B-mb, B-1mb, B-under, B-over, B-gzip, B-R5 |
| /api with the middleware skipped | PASS | A1 to A10 (route-minted cookie, forged cookies, GET and admin scoping, webhook) plus regression 221/221 |
| payment path (claim 1) | PASS | C1 to C11 unchanged; C12 now 503 in 20.5 s |
| W2 Stripe timeout | PASS | C12: 503 after 20.5 s, exactly 2 attempts, no row |
| W3 unusedOrderId wrapped | PASS | probe V4: `returned 500 {"error":"Your order could not be saved. Please try again."}`, 0 Stripe calls, 0 rows |
| W4 tip validation, as specified | PASS | D1 to D8b: 13 bad shapes are 400 before Stripe, 100000 accepted, 0 / -0 / null / absent are 0 |
| W4 effect on a legal checkout | **FAIL** | D10 (API, largest legal cart) and U7 (real UI, $6,120 cart): the form's default tip is refused |
| W5 add-on de-duplication | PASS | D9: bacon x200 priced and stored as one bacon |
| field limits, types, multibyte | PASS | F-* unchanged |
| builder's real-server suite as a gate | PASS (warning) | 6/6 warm at head; 4/6 fail with the old middleware; cold first run flaked |
| Layer 1 | PASS | vitest 136/136, tsc exit 0, lint 0 errors / 3 pre-existing warnings |
| smoke, navigation, headless | PASS | regression Q, H sections; U1 to U6 |
| accessibility / visual / cross-browser | SKIP | as in the first run |

### 0.4 Builder's real-server suite

At `ad5713e`, after `npm run build`:

- **First run** (cold, right after the build): 5 of 6. Case 1 failed with
  `expected 1401 to be less than 1000`. The first POST after server start
  paid module-load time.
- **Three further runs:** 6 of 6 each (`Tests 6 passed (6)`, about 1.4 s).

Is it a gate? Two builds, with `src/middleware.ts` (and in the second build
also `next.config.mjs`) swapped to the `0a83724` versions, then restored with
`git checkout --`:

| Build | Result | Failing cases |
|---|---|---|
| old middleware + new 64kb config | 4 failed, 2 passed | declared, chunked, checkout (each a 10 s timeout), middleware-on-pages-not-api |
| old middleware + old config | 4 failed, 2 passed | the same 4 |

So the suite catches the regression it exists for, which confirms the
builder's "4 of 6". It also shows that **`middlewareClientMaxBodySize` alone
does not fix the hang.** It only caps memory. The matcher is the actual fix,
and the suite's last case guards it. The `.next` build was rebuilt at head
afterwards, and the worktree was clean.

**No CI workflow runs vitest at all.** `.github/workflows/verify.yml` only
runs the smoke and deep-gate scripts. So both the unit tests and this suite
are manual gates today (Warnings).

### 0.5 Verbatim logs

Attack harness at `ad5713e` (`attack-r2final.log`, fresh containers). New
or changed sections compared with the first run:
- D is rewritten for W4 and W5;
- B-R1 to B-R9 are rewritten, with time limits;
- A is new (/api without middleware);
- U7 is new;
- C12 is now bounded at 25 s.

```

== C: checkout payment path, Stripe failure modes (fake Stripe in dv31-fake, reset listener in dv31-test) ==
PASS  C1a  Stripe unreachable, connection refused: 503 JSON with exactly the fixed message  [503 592 ms {"error":"The payment service is temporarily unavailable, so your order was not ]
PASS  C1b  connection refused: NO order row written  [orders 20->20]
PASS  C1c  connection refused: response leaks no internals  [none]
PASS  C2a  Stripe connection reset mid-handshake (dv31-test listener): 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C2b  Stripe connection reset mid-handshake (dv31-test listener): Stripe was actually attempted, and NO order row was written  [stripe calls 0->2, orders 20->20]
PASS  C2c  Stripe connection reset mid-handshake (dv31-test listener): response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C3a  Stripe 400 invalid_request_error carrying a sentinel message: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C3b  Stripe 400 invalid_request_error carrying a sentinel message: Stripe was actually attempted, and NO order row was written  [stripe calls 0->1, orders 20->20]
PASS  C3c  Stripe 400 invalid_request_error carrying a sentinel message: response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C4a  Stripe 500 api_error: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C4b  Stripe 500 api_error: Stripe was actually attempted, and NO order row was written  [stripe calls 1->3, orders 20->20]
PASS  C4c  Stripe 500 api_error: response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C5a  Stripe 200 with a non-JSON body: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C5b  Stripe 200 with a non-JSON body: Stripe was actually attempted, and NO order row was written  [stripe calls 3->4, orders 20->20]
PASS  C5c  Stripe 200 with a non-JSON body: response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C6a  Stripe session with url null: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C6b  Stripe session with url null: Stripe was actually attempted, and NO order row was written  [stripe calls 4->5, orders 20->20]
PASS  C6c  Stripe session with url null: response leaks no internals (sentinel, host, errno, key, stack)  [none]
INFO  checkout log lines: [checkout] Stripe session create failed: StripeConnectionError | [checkout] Stripe session create failed: StripeInvalidRequestError (amount_too_large) | [checkout] Stripe session create failed: StripeAPIError | [checkout] Stripe session create failed: Error
PASS  C7  server log lines for Stripe failures carry only the error type/code: no sentinel message, no key, no host  [6 lines]
PASS  C7b  the 400 case is logged with its Stripe code (StripeInvalidRequestError / invalid_request_error (amount_too_large))  []
PASS  C8a  ok session: 200 with { url, orderId }, url is the session URL  [200 HB-M588S]
PASS  C8b  ok session: the order row did NOT exist while Stripe was being called (checked by the fake from the DB)  [rowDuringCall=false]
PASS  C8c  ok session: exactly one new row, pending, tagged with the caller visitor id, session id stored in the same insert  [pending sess=true]
PASS  C8d  ok session: client_reference_id, metadata[order_id], payment_intent_data[metadata][order_id] all equal the returned orderId  [HB-M588S]
PASS  C8e  ok session: success_url and cancel_url carry the same orderId  [/order/confirmation/HB-M588S?session_id={CHECKOUT_SESSION_ID}]
PASS  C8f  ok session: totals agree (row subtotal + tip = row total = sum of Stripe line items); tip sent as its own line  [1400+250=1650, stripe 1650]
PASS  C9a  insert fails after Stripe succeeded: JSON 500 with the fixed "could not be saved" message (not an empty 500)  [500 application/json {"error":"Your order could not be saved. Please try again."}]
PASS  C9b  insert fails: the squatting row is untouched (not overwritten by the visitor), and no second row appears  [{"n":"Squatter Row dv31","v":"dv31-squatter","s":"received","sid":null}]
PASS  C9c  insert fails: the response carries no session URL, so the orphan test session cannot be paid by this visitor  [{"error":"Your order could not be saved. Please try again."}]
PASS  C9d  insert fails: log names the order id and error class only (no customer name or phone)  [[checkout] could not save order HB-4DJWD: SqliteError]
PASS  C10  slow Stripe (3 s): 200 and a row, nothing written before the session came back  [200 3021 ms]
PASS  C11  20 concurrent checkouts: 20 x 200, 20 distinct order ids, 20 rows each tagged with its own visitor, no row existed during any Stripe call  [20 ok, 20 ids, 20 rows]

== D: tipCents (W4) and duplicate add-ons (W5), fake Stripe in ok mode ==
PASS  D1  tip -500: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D2  tip -0.4: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D3  tip 1e400 (JSON Infinity): 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D4  tip 1e20: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D5  tip 100001 (cap + 1): 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D6  tip 2^53+1: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7a  tip "abc": 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7b  tip true: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7c  tip [5]: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7d  tip " 7 ": 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7e  tip 0.5: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7f  tip "100": 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D7g  tip {}: 400 "Tip must be a whole number of cents from 0 to 100000", no Stripe call, no row  [400 Tip must be a whole number of cents from 0 to 100000]
PASS  D8  tip 100000 accepted (row tip 100000, Stripe Tip line 100000); 0, -0, null and absent give tip 0 with no Tip line  [200/100000 200/0 200/0 200/0 200/0]
PASS  D8b  across every tip tried, no stored order has a tip outside 0..100000, a non-integer tip, or a total below its subtotal  [0 bad rows]
INFO  D10 largest legal cart (50 lines x 12): subtotal 840000 cents; the form's default 18% tip is 151200 cents -> 400 {"error":"Tip must be a whole number of cents from 0 to 100000"}
INFO  D10b the default 18% tip exceeds the cap once the subtotal passes 555556 cents ($5555.56); 20% passes it above $5000.00
FAIL  D10  legal UI-shaped order: the form default 18% tip on the largest legal cart is accepted  [400 subtotal 840000 tip 151200]
INFO  D9 harbor-smash-burger: plain 1700, bacon x1 2000, bacon x200 2000; stored extras for x200 = ["bacon"]; [bacon,egg,bacon,egg,egg] 2200 vs [bacon,egg] 2200
PASS  D9  W5: "bacon" x200 is priced and stored exactly like "bacon" x1 (one bacon), and mixed duplicates equal the de-duplicated set  [2000=2000=1700+300, 2200=2200]

== E: malformed carts and bodies (looking for any bare or non-JSON 500) ==
INFO  E statuses: lines [null]:400, lines [1]:400, lines ["x"]:400, lines [[]]:400, slug object:400, quantity "1":200, quantity 1.5:400, quantity -1:400, quantity 13:400, selections "abc":400, selections 5:200, selections []:200, selections null:200, selections __proto__:400, selections constructor:400, burger bun array:400, burger bun null:400, burger extras object:400, burger extras [null]:400, burger extras "bacon":200, lines array-like object:400, 51 lines:400, 50 lines:200, fulfillment object:400, customerName object:400, customerName array:400, customerPhone number:400, body null:400, body []:400, body "str":400, body 123:400, body true:400, empty body:400, huge slug 30 KB:400, unicode slug:400
PASS  E1  35 malformed carts/bodies against a working Stripe: no 5xx, every response is JSON  [none]
PASS  E2  51 lines -> 400 and 50 lines accepted  [51 lines:400,50 lines:200]

== F: field limits after trim, UTF-16 units vs UTF-8 bytes, non-string values (reservations on dv31-none, checkout on dv31-fake) ==
PASS  F-name  reservation name: 100 ASCII accepted and stored whole; 101 -> 400 "Name must be at most 100 characters", nothing stored  [201/400]
PASS  F-phone  reservation phone: 32 ASCII accepted and stored whole; 33 -> 400 "Phone must be at most 32 characters", nothing stored  [201/400]
PASS  F-email  reservation email: 254 ASCII accepted and stored whole; 255 -> 400 "Email must be at most 254 characters", nothing stored  [201/400]
PASS  F-notes  reservation notes: 500 ASCII accepted and stored whole; 501 -> 400 "Notes must be at most 500 characters", nothing stored  [201/400]
PASS  F-mb1  reservation name: 100 x e-acute (2 bytes each) accepted, stored intact  [201 units=100 bytes=200]
PASS  F-mb2  reservation name: 50 emoji (100 UTF-16 units, 200 bytes) accepted, stored intact  [201 units=100 bytes=200]
PASS  F-mb3  reservation name: 51 emoji (102 units) -> 400  [400 units=102 bytes=204]
PASS  F-mb4  reservation name: 100 CJK (300 bytes) accepted  [201 units=100 bytes=300]
PASS  F-mb5  reservation name: 101 CJK -> 400  [400 units=101 bytes=303]
PASS  F-mb6  reservation name: 99 ASCII + 1 emoji (101 units, what maxLength also blocks) -> 400  [400 units=101 bytes=103]
PASS  F-mb7  reservation name: 50 decomposed e + combining accent (100 units) accepted  [201 units=100 bytes=150]
PASS  F-worst  reservation: every field at its limit with the worst-case JSON encoding (\u escapes) is 5409 bytes, under 8192, and is accepted and stored intact  [201 5409 bytes]
PASS  F-trim  reservation name: 100 chars wrapped in ASCII and ideographic whitespace accepted, stored trimmed at 100  [201]
PASS  F-trim2  reservation name of only whitespace -> 400 (required), nothing stored  [400 {"error":"name, phone, partySize, date, and time are require]
PASS  F-types  reservation: non-string name/phone/email/notes -> 400 "<Field> must be text", nothing stored (no "[object Object]" rows)  [name=123:400:Name must be text | name={"a":1}:400:Name must be text | phone=["555"]:400:Phone must be text | email=true:400:Email must be text | notes={"toStrin]
INFO  F-lone lone high surrogate in name: 201 stored="Lone ��� surrogate d027fa"
PASS  F-lone  reservation name with a lone UTF-16 surrogate: handled (201 or 400), not a 500  [201]
PASS  F-ck-customerName  checkout customerName: 50 emoji (100 units) accepted and stored intact; 101 units -> 400 "Name must be at most 100 characters" with NO Stripe call and no row  [400/200 stripe 45->45]
PASS  F-ck-customerPhone  checkout customerPhone: 16 emoji (32 units) accepted and stored intact; 33 units -> 400 "Phone must be at most 32 characters" with NO Stripe call and no row  [400/200 stripe 46->46]
PASS  F-ck-customerEmail  checkout customerEmail: 127 emoji (254 units) accepted and stored intact; 255 units -> 400 "Email must be at most 254 characters" with NO Stripe call and no row  [400/200 stripe 47->47]
PASS  F-ck-deliveryAddress  checkout deliveryAddress: 150 emoji (300 units) accepted and stored intact; 301 units -> 400 "Delivery address must be at most 300 characters" with NO Stripe call and no row  [400/200 stripe 48->48]
PASS  F-ck-types  checkout: object customerName -> 400 "Name must be text", no Stripe call  [400]

== B: byte caps on the running production server (raw sockets, dv31-none and dv31-fake) ==
PASS  B-res-1  /api/reservations: exactly 8192 bytes with Content-Length handled normally (201), 8193 -> 413 {"error":"Request body is too large"}  [201/413 {"error":"Request body is too large"}]
PASS  B-res-2  /api/reservations: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 201 then 413  [201/413]
PASS  B-res-3  /api/reservations: exactly 2 rows from the two at-cap requests, none from the over-cap ones  [26->28]
PASS  B-ck-1  /api/checkout: exactly 32768 bytes with Content-Length handled normally (200), 32769 -> 413 {"error":"Request body is too large"}  [200/413 {"error":"Request body is too large"}]
PASS  B-ck-2  /api/checkout: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 200 then 413  [200/413]
PASS  B-ck-3  /api/checkout: exactly 2 rows from the two at-cap requests, none from the over-cap ones  [64->66]
PASS  B-admO-1  /api/admin/orders/<id>: exactly 1024 bytes with Content-Length handled normally (400), 1025 -> 413 {"error":"Request body is too large"}  [400/413 {"error":"Request body is too large"}]
PASS  B-admO-2  /api/admin/orders/<id>: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 400 then 413  [400/413]
PASS  B-admR-1  /api/admin/reservations/<id>: exactly 1024 bytes with Content-Length handled normally (400), 1025 -> 413 {"error":"Request body is too large"}  [400/413 {"error":"Request body is too large"}]
PASS  B-admR-2  /api/admin/reservations/<id>: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 400 then 413  [400/413]
PASS  B-portal-1  /api/auth/portal-handoff: exactly 16384 bytes with Content-Length handled normally (400/401/403/503), 16385 -> 413 {"ok":false,"error":"payload_too_large"}  [401/413 {"ok":false,"error":"payload_too_large"}]
PASS  B-portal-2  /api/auth/portal-handoff: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 400/401/403/503 then 413  [401/413]
INFO  B-mb bodies 8192 / 8193 bytes, notes 2698 UTF-16 units of CJK
PASS  B-mb  reservation notes of CJK: 8192-byte body in 7-byte chunks (splitting characters) -> not 413; 8193 bytes -> 413  [400 {"error":"Notes must be at most 500 characters"} / 413]
PASS  B-under  understated Content-Length (12) with a 40 KB body: server reads 12 bytes -> 400, the rest is not a valid request, nothing stored, server fine  [400 ]
PASS  B-over  overstated Content-Length (5000) with a short valid body, client gives up: no response, nothing stored, server fine  [null client-timeout]
PASS  B-gzip  gzip "bomb" (4908 bytes on the wire, 5 MB inflated) -> 400, not inflated, nothing stored  [400]
INFO  B-te-cl Content-Length together with Transfer-Encoding: 400
PASS  B-1mb  the #28 repro over chunked transfer: 1 MB name -> 413 JSON, nothing stored  [413]
PASS  B-R1  READ-TIME CAP: a chunked upload that passes 8 KB and keeps going gets its 413 while still uploading, within 2 s  [413 after 7 ms, 65554 bytes sent at response (response-complete)]
PASS  B-R2  READ-TIME CAP: a declared Content-Length of 1,000,000 is refused up front, before any body byte is sent, within 1 s  [413 after 6 ms, 0 body bytes sent]
INFO  B-R3 (information only, see first-run harness corrections) Content-Length 1,000,000 streamed: 413, response after 984000 bytes sent, 20 ms
PASS  B-R4  READ-TIME CAP (checkout, 32 KB): a never-ending chunked upload gets a 413 while still uploading, within 2 s  [413 after 6 ms, 65562 bytes (response-complete)]
PASS  B-R8  READ-TIME CAP, trickle: 1 KB every 300 ms is answered 413 right after the total passes 8 KB (about 9 chunks, under 5 s), not at a timeout  [413 after 2442 ms, 8262 bytes sent]
PASS  B-R9  READ-TIME CAP: Content-Length 5,000,000 with no body is refused up front (413, under 1 s) on checkout, both admin routes and the portal handoff  [/api/checkout:413/5ms /api/admin/orders/<id>:413/6ms /api/admin/reservations/<id>:413/7ms /api/auth/portal-handoff:413/6ms]
PASS  B-R5  after B-R1..B-R9 nothing was stored and the servers still answer  []
INFO  B-R6 12 MB chunked: 413 after 6 ms, 917644 bytes sent when the response arrived (103 ms total); Next body-clone warning: none
PASS  B-R6  12 MB chunked upload: 413 long before the upload finishes (under 1 MB sent), nothing stored, and no Next middleware body-clone warning  [413 at 917644 bytes]
INFO  B-R7 200 x 9 MB chunked uploads in waves of 20 over 16479 ms: 188 answered 413, 12 ended by a TCP reset before the 413 could be read (error:ECONNRESET); slowest end after 2109 ms; 10 memory samples, 70.33MiB before, peak 83.79MiB (first run: 105 MiB -> 389 MiB for one wave)
FAIL  B-R7  sustained waves of 20 concurrent 9 MB uploads for 15 s: every one ends within 2 s, with 413 or (at most 2 percent) a TCP reset, never a success or a hang; container memory grows by under 50 MiB; server fine  [200 uploads, 12 resets, slowest 2109 ms, mem 70.33MiB -> 83.79MiB, 10 samples]

== A: /api routes with the middleware skipped (cookie minting, scoping, forged cookies) ==
PASS  A1  cookieless GET /api/reservations: 200 and no Set-Cookie (middleware skipped); cookieless GET /menu still gets hb_visitor  [200 api-cookie=false page-cookie=true]
PASS  A2  cookieless POST /api/reservations: 201, the route sets hb_visitor (HttpOnly, SameSite=Lax, Path=/, Max-Age=2592000, Secure) and the row is tagged with that id  [201 hb_visitor=<v4>; Path=/; Expires=Mon, 19 Oct 2026 09:12:36 GMT; Max-Age=2592000; Secure; HttpOnly; SameSite=lax]
PASS  A3  cookieless POST /api/checkout: 200, the route sets hb_visitor and the pending row is tagged with it  [200 tag==cookie true]
PASS  A4  POST with a valid cookie: no new Set-Cookie, row tagged with the existing id  [201]
PASS  A5  forged cookies on a write (8 variants: seed, SEED, url-encoded seed, uppercased real id, empty, 4 KB, seed-then-real duplicate, SQL-shaped): each gets a fresh v4 cookie and the row is tagged with it, never seed and never NULL  [201 201 201 201 201 201 201 201]
PASS  A6  no row written through /api in this section is tagged seed or NULL  [0]
PASS  A7  GET /api/orders/<own pending order>: owner 200 with no PII keys; another visitor, no cookie and forged seed all 404  [200/404/404/404]
PASS  A8  admin POST on a visitor order from another visitor, no cookie, forged seed: 404; the order is unchanged  [404/404/404]
PASS  A9  admin POST on a seed order with no cookie still works (staff demo): 200 preparing  [200]
PASS  A10  Stripe webhook still fails closed with no signing secret (503), no cookie set  [503]

== U: headless Chromium (390x844): form limits and the 503 message ==
PASS  U1  /reservations inputs carry maxLength name 100, phone 32, email 254, notes 500  [[100,32,254,500]]
PASS  U2  typing 150 characters into the reservation name keeps 100  [100]
PASS  U3  /order checkout inputs carry maxLength name 100, phone 32, email 254, address 300  [text:100,tel:32,email:254,radio:-1,radio:-1,text:300]
PASS  U4  UI checkout while Stripe fails: /api/checkout 503, the "payment service is temporarily unavailable" message is shown, page intact, no row  [503 rows 68->68]
PASS  U5  UI checkout with Stripe up: 200, the browser is sent to the session URL (intercepted, never reaches Stripe), one pending row  [200 https://checkout.stripe.com/c/pay/cs_test_dv31_447c6cde79f4a]
PASS  U6  no uncaught page errors in the UI run  []
INFO  U7 real UI: 27 menu items x 12 through the item pages, form subtotal 612000 cents, default tip sent 110160; /api/checkout 400; page: Tip must be a whole number of cents from 0 to 100000
FAIL  U7  real UI: a large cart (12 each of the priciest dishes, added through the item pages, over $6,000) checks out with the form default 18% tip  [400 tip 110160: Tip must be a whole number of cents from 0 to 100000]

== C12: Stripe accepts the TLS connection and never answers (timeout path) ==
INFO  C12 hang: 503 after 20.5 s, 2 Stripe attempt(s)
PASS  C12  W2: Stripe that never answers: JSON 503 with no row within 25 s, after exactly 2 attempts (10 s timeout, 1 retry)  [503 after 20.5 s, 2 attempts]

== K: key material ==
PASS  K1  the fake sk_test_ keys never appear in either container log  [fake:clean test:clean]

== R: runtime ==
INFO  R-none request-aborted log lines from the harness's deliberately abandoned uploads: 0
PASS  R-none  none: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
INFO  R-test request-aborted log lines from the harness's deliberately abandoned uploads: 0
PASS  R-test  test: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
INFO  R-fake request-aborted log lines from the harness's deliberately abandoned uploads: 0
PASS  R-fake  fake: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]

TOTAL 116/119 passed  ({"PASS":116,"FAIL":3})
```

Regression harness at `ad5713e` (`regress-r2.log`, fresh containers; the
same harness as the first run):

```

== P: per-visitor scope (container none, no Stripe key) ==
PASS  P1  A first request: 200 and hb_visitor Set-Cookie  [200]
PASS  P2  cookie flags: HttpOnly, SameSite=Lax, Path=/, Max-Age=2592000, Secure  [hb_visitor=<v4>; Path=/; Expires=Mon, 19 Oct 2026 08:54:27 GMT; Max-Age=2592000; Secure; HttpOnly; SameSite=lax]
PASS  P3  A id is a lowercase v4 UUID  [v4]
PASS  P4  A second request keeps its id (no new hb_visitor Set-Cookie)  [0 set-cookie]
PASS  P5  B gets its own distinct valid id  [distinct]
PASS  P6  A creates a reservation through the real API -> 201  [201 HR-WT58Z]
PASS  P7  A reservation row is tagged with A visitor id  [tag==A]
PASS  P8  B creates its own reservation -> 201, tagged B  [201 HR-VYUY5]
PASS  P9  cookieless create -> 201, sets HttpOnly SameSite=Lax cookie, row tagged with that minted id  [201]
INFO  A order HB-A7CDF (received), HB-C7CDF (completed); B order HB-B7CDF; legacy HB-LGCYN / RS-LGCYN (visitor_id NULL); A res HR-WT58Z; B res HR-VYUY5
INFO  unknown-id bodies: api={"error":"Order not found"} adminOrder={"error":"Order not found"} adminRes={"error":"Reservation not found"}
PASS  P10  A: own /reservations/<id> 200 with own name  [200]
PASS  P11  A: own /order/confirmation/<id> 200 showing the order (item line)  [200]
PASS  P12  A: own /api/orders/<id> 200, returns no PII fields  [id,status,statusLabel,fulfillment,updatedAt]
PASS  P13  A: /admin/orders lists A orders (active + recent) and seed  [A_ORD,A_ORD2,seed]
PASS  P14  A: /admin/reservations lists A booking and seed  []
PASS  P15  A: never sees B data (admin orders/reservations)  []
PASS  P16  A: B reservation detail 404  []
PASS  P17  A: legacy NULL rows hidden from A admin views  []
PASS  P18  A: legacy order /api/orders -> 404 and admin POST -> 404  []
PASS  P19  A: legacy reservation detail 404 and admin POST 404  []
PASS  P20  header counts are scoped: A active = B active (B has 1 own received order too), cookieless = seed-only = B - 1  [A=11 B=11]
PASS  X1a  B (own valid cookie): A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X1b  B (own valid cookie): /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X1c  B (own valid cookie): admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X2a  cookieless: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X2b  cookieless: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X2c  cookieless: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X3a  forged seed: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X3b  forged seed: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X3c  forged seed: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X4a  forged SEED: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X4b  forged SEED: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X4c  forged SEED: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X5a  forged url-encoded seed: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X5b  forged url-encoded seed: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X5c  forged url-encoded seed: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X6a  foreign random v4: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X6b  foreign random v4: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X6c  foreign random v4: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X7a  A id uppercased: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X7b  A id uppercased: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X7c  A id uppercased: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X8a  A id, version nibble 1: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X8b  A id, version nibble 1: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X8c  A id, version nibble 1: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X9a  A id with suffix: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X9b  A id with suffix: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X9c  A id with suffix: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X10a  dup: seed then foreign v4: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X10b  dup: seed then foreign v4: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X10c  dup: seed then foreign v4: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X11a  dup: foreign v4 then seed: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X11b  dup: foreign v4 then seed: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X11c  dup: foreign v4 then seed: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X12a  empty value: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X12b  empty value: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X12c  empty value: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X13a  4 KB junk: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X13b  4 KB junk: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X13c  4 KB junk: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X14a  SQL-shaped: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X14b  SQL-shaped: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X14c  SQL-shaped: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  P21  after the attack matrix A order is still received and A booking still confirmed, tags unchanged  [received/confirmed]
INFO  harness: stale keep-alive socket on GET /api/orders/HB-VN8NX, retried once
PASS  P22  B: 200 random guessed order codes, 0 non-seed foreign orders resolved  [foreign hits=0]
PASS  P23  A: admin POST advance on own order -> 200 preparing  [{"id":"HB-A7CDF","status":"preparing","statusLabel":"Preparing"}]
PASS  P24  A: admin POST seat own booking -> 200 seated  [{"id":"HR-WT58Z","status":"seated"}]
PASS  P25  B: admin POST on a seed order -> 200 (staff demo still works)  [{"id":"HB-8BAWJ","status":"preparing","statusLabel":"Preparing"}]
PASS  P26  every row written in this run is tagged: the only NULL rows are the 2 deliberate legacy inserts  [orders NULL=1 reservations NULL=1]
INFO  static: SELECT ... FROM orders|reservations without the scope predicate: src\lib\orders.ts:296, src\lib\orders.ts:312, src\lib\orders.ts:332, src\lib\reservations.ts:42
PASS  P27  static: only 4 unscoped reads remain (getOrderUnscoped, getOrderByCheckoutSession, slot counts, and the PR #31 unusedOrderId existence probe that returns no row data)  [src\lib\orders.ts:296 src\lib\orders.ts:312 src\lib\orders.ts:332 src\lib\reservations.ts:42]

== K: Stripe test-key guard (per container) ==
INFO  harness: stale keep-alive socket on GET /, retried once
PASS  K-none-1  none: valid checkout -> 503 "not configured"  [503 {"error":"Online payment is not configured in this environment. Set STRIPE_SECRET_KEY (test mode) to enable checkout."}]
PASS  K-none-2  none: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 24->24]
PASS  K-none-3  none: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-live-1  live: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-live-2  live: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-live-3  live: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-rk-1  rk: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-rk-2  rk: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-rk-3  rk: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-rklive-1  rklive: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-rklive-2  rklive: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-rklive-3  rklive: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-pklive-1  pklive: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-pklive-2  pklive: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-pklive-3  pklive: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-live-4  live: boot log carries the [startup] refusal  []
PASS  K-rk-4  rk: boot log carries the [startup] refusal  []
PASS  K-rklive-4  rklive: boot log carries the [startup] refusal  []
PASS  K-pklive-4  pklive: boot log carries the [startup] refusal  []
PASS  K-none-4  none: no [startup] refusal (missing key is not a live key), checkout says not configured  []
PASS  K-test-1  test (fake sk_test_): checkout passes the guard and DOES try Stripe (blocked at the pinned host)  [status 503, hits 0->2]
INFO  K-test checkout response: 503 {"error":"The payment service is temporarily unavailable, so your order was not placed. Please try again in a moment."}
PASS  K-test-2  test (PR #31): blocked Stripe -> 503 JSON and no order row written (was: pending row left behind)  [503 orders 20->20]
PASS  K-test-3  test: B on A pending order with ?session_id -> 404 and 0 Stripe connections (scope check runs before reconcile)  [404 hits 2->2]
PASS  K-test-4  test: A on own pending order with ?session_id -> 200, reconcile attempted, fails soft (pending state shown)  [200 hits 2->4]
PASS  K-test-5  test: invalid checkout body -> 400 before any Stripe call  [400]
PASS  K-none-scan  none: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-test-scan  test: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-live-scan  live: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-rk-scan  rk: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-rklive-scan  rklive: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-pklive-scan  pklive: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]

== M: in-place migration of a pre-tagging database (container legacy) ==
PASS  M1  prep ran on a DB without visitor_id (boot log)  []
PASS  M2  server boot added visitor_id to orders and reservations  []
PASS  M3  ISO-timestamp seed rows backfilled to seed (20 orders, 15 reservations)  [20/15]
PASS  M4  app-style legacy rows kept with visitor_id NULL (2 orders, 2 reservations, incl. the 48h-old ones: not purged at boot)  [[{"id":"HB-LGCY2","v":null},{"id":"HB-LGCY3","v":null}][{"id":"RS-LGCY2","v":null},{"id":"RS-LGCY3","v":null}]]
PASS  M5  visitor indexes created  [2]
PASS  M6  fresh visitor: legacy names absent from admin views, seed shown  []
PASS  M7  legacy rows: detail, API and admin POST all 404 (fresh and forged-seed cookies)  [404/404/404/404/404]
PASS  M8  post-migration visitor write -> 201 and tagged  [201]

== T: 24h retention purge (container ret) ==
INFO  inserted per table: V25A (app format, -25h), V25B (ISO, -25h), V23 (-23h), S100 (seed, -100h), N100 (NULL, -100h); created_at V25A=2026-09-18 08:05:47 V25B=2026-09-18T08:05:47.540Z
PASS  T1  hourly gate: 6 requests after insert do not purge (boot run already happened this hour); all 5+5 rows present  [5/5]
PASS  T2  after restart (boot purge): orders -25h rows gone in both timestamp formats; -23h, seed -100h, NULL -100h kept  [N100,S100,V23]
PASS  T3  after restart: reservations same outcome  [N100,S100,V23]
PASS  T4  fresh visitor booking made minutes ago survives  [HR-6CUK6]
PASS  T5  boot log: "[retention] deleted 2 orders and 2 reservations"  [[retention] deleted 2 orders and 2 reservations created by visitors before 2026-09-18T09:05:52.764Z]
PASS  T6  seed rows untouched (20 + 1 orders, 15 + 1 reservations incl. the -100h seed probes)  [21/16]

== E: edge sweep (container none) ==
PASS  E1  reservations: no body -> 400  [400 {"error":"Invalid JSON"}]
PASS  E2  reservations: garbage JSON -> 400  [400 {"error":"Invalid JSON"}]
PASS  E3  reservations: missing fields -> 400  [400 {"error":"name, phone, partySize, date, and time are required"}]
PASS  E4  reservations: partySize as string -> 400  [400 {"error":"partySize must be 1-12"}]
PASS  E5  reservations: partySize 13 -> 400  [400 {"error":"partySize must be 1-12"}]
PASS  E6  reservations: bad date format -> 400  [400 {"error":"date must be YYYY-MM-DD"}]
PASS  E7  reservations: closed Monday -> 409  [409 {"error":"That time slot is no longer available"}]
PASS  E8  reservations: time not a slot (03:00) -> 409  [409 {"error":"That time slot is no longer available"}]
PASS  E9  reservations (PR #31): 1 MB name -> 413 (was 201 stored)  [413 {"error":"Request body is too large"}]
PASS  E9b  reservations: nothing stored for the 1 MB name  [19]
PASS  E10  reservations: HTML/unicode/apostrophes in name -> 201  [201 {"id":"HR-8FFC7"}]
PASS  E11  owner confirmation and admin escape HTML (no raw <script>alert(1) or <img src=x), unicode intact  []
PASS  E12  20 concurrent same-slot bookings: 201 count = remaining capacity (6 - existing), rest 409, slot never over 6  [existing 0, 201 x6, 409 x14, now 6]
PASS  E13  20 concurrent cookieless first requests -> 20 distinct valid v4 ids  [20]
PASS  E14  admin orders POST garbage JSON -> 400  [400 {"error":"Invalid JSON"}]
PASS  E15  admin orders POST unknown action -> 400  [400 {"error":"action must be \"advance\" or \"cancel\""}]
PASS  E16  admin reservations POST status "confirmed" (not allowed) -> 400  [400 {"error":"status must be one of seated, completed, cancelled"}]
PASS  E17  admin orders GET -> 405  [405]
PASS  E18  SQL-shaped ids on /api/orders and admin POST -> 404  [404/404]
PASS  E19  matcher-skipped path /api/orders/<A>.png -> 404 for B and cookieless  [404/404]
PASS  E20  unicode reservation id -> 404, not 500  [404]
PASS  E21  owner illegal transition completed -> cancelled -> 409 (not 404, not 500)  [409 {"error":"Reservation HR-WT58Z cannot move from \"completed\" to \"cancelled\""}]
PASS  E22  checkout 1 MB body with no key -> 503, no crash  [503]
PASS  E23  4 KB cookie value -> 200 and replaced by a fresh v4 id  [200]

== H: headless Chromium (390x844, container none) ==
PASS  H0  browser A holds hb_visitor: httpOnly, secure, sameSite Lax, v4  [true/true/Lax]
PASS  H0b  browser A keeps the same id across navigations (cookie sent back over http://127.0.0.1)  []
PASS  H1  /reservations shows the demo notice (visible)  []
PASS  H2  /order checkout form (cart with 1 item) shows the demo notice (visible)  []
INFO  H2b checkout submit from UI: 503
PASS  H2b  UI checkout submit with no key -> /api/checkout 503 and the not-configured message is shown in the page, no crash  [503]
PASS  H3  browser A books through the UI and lands on its confirmation with its name  [/reservations/HR-QKFDG]
PASS  H4  browser B opens A confirmation URL -> 404, A name absent  [404]
PASS  H5  browser B /admin/reservations: A booking absent, scope note shown  []
PASS  H6  browser A /admin/reservations: own booking present  []
PASS  H7  browser A: no console errors across home, menu, reservations, order, booking, admin (the one expected 503 resource error from H2b excluded)  [Failed to load resource: the server responded with a status of 503 (Service Unavailable)]
PASS  H8  browser B: only console error is the expected 404 resource load  [Failed to load resource: the server responded with a status of 404 (Not Found)]

== Q: repo's own assertions (verify/smoke.yml, assertions/home.yml, assertions/reservations.yml) against container none ==
PASS  Q1  smoke.yml / http_status 200  [200]
PASS  Q2  smoke.yml / text_present Dinner by the water, minus the production  []
PASS  Q3  smoke.yml / text_present Harbor Bistro  []
PASS  Q4  smoke.yml / text_present Coastal-inspired, locally sourced  []
PASS  Q5  smoke.yml / selector_present main  []
PASS  Q6  smoke.yml / selector_present a[href='/reservations']  []
PASS  Q7  smoke.yml / selector_present a[href='/menu']  []
N/A  Q8  smoke.yml / header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q9  smoke.yml /menu http_status 200  [200]
PASS  Q10  smoke.yml /menu text_present The Menu  []
PASS  Q11  smoke.yml /menu text_present cooked to order  []
PASS  Q12  smoke.yml /menu selector_present main  []
N/A  Q13  smoke.yml /menu header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q14  smoke.yml /reservations http_status 200  [200]
PASS  Q15  smoke.yml /reservations text_present Reserve a Table  []
PASS  Q16  smoke.yml /reservations text_present Tables for 1 to 12  []
PASS  Q17  smoke.yml /reservations selector_present form  []
PASS  Q18  smoke.yml /reservations selector_present input#date  []
PASS  Q19  smoke.yml /reservations selector_present select#partySize  []
PASS  Q20  smoke.yml /reservations selector_present input#name  []
PASS  Q21  smoke.yml /reservations selector_present input#phone  []
N/A  Q22  smoke.yml /reservations header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q23  smoke.yml /order http_status 200  [200]
PASS  Q24  smoke.yml /order text_present cart  []
PASS  Q25  smoke.yml /order selector_present main  []
N/A  Q26  smoke.yml /order header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q27  smoke.yml /about http_status 200  [200]
PASS  Q28  smoke.yml /about text_present Harbor Bistro  []
PASS  Q29  smoke.yml /about selector_present main  []
N/A  Q30  smoke.yml /about header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q31  smoke.yml /api/reservations?date=2026-07-04 http_status 200  [200]
PASS  Q32  smoke.yml /api/reservations?date=2026-07-04 json_path_equals $.slots  [["16:00","16:30","17:00","17:30","18:00","18:30","19:00","19]
PASS  Q33  assertions/home.yml / http_status 200  [200]
N/A  Q34  assertions/home.yml / header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q35  assertions/home.yml / text_present Dinner by the water, minus the production  []
PASS  Q36  assertions/home.yml / text_present Coastal-inspired, locally sourced, weeknight-easy.  []
PASS  Q37  assertions/home.yml / text_present Reserve a Table  []
PASS  Q38  assertions/home.yml / text_present See the Menu  []
PASS  Q39  assertions/home.yml / text_present This week  []
PASS  Q40  assertions/home.yml / text_present Good fish, short menu, honest hours  []
PASS  Q41  assertions/home.yml / text_present 412 Harborline Drive  []
PASS  Q42  assertions/home.yml / text_present Tue-Sun from 4pm  []
PASS  Q43  assertions/home.yml / text_present Harbor Bistro  []
PASS  Q44  assertions/home.yml / selector_present main  []
PASS  Q45  assertions/home.yml / selector_present section  []
PASS  Q46  assertions/home.yml / selector_present a[href='/reservations']  []
PASS  Q47  assertions/home.yml / selector_present a[href='/menu']  []
PASS  Q48  assertions/home.yml / selector_present ul li a[href^='/menu/']  []
PASS  Q49  assertions/home.yml / selector_present header  []
PASS  Q50  assertions/home.yml / selector_present [data-testid='demo-banner'], footer, [class*='DemoBanner'], [class*='demo']  []
PASS  Q51  assertions/home.yml / lcp_under_ms 1500 (local origin)  [140 ms]
PASS  Q52  assertions/home.yml / no_console_errors   []
SKIP  Q53  assertions/home.yml / axe_no_critical   [axe-core not in harness]
PASS  Q54  assertions/reservations.yml /reservations http_status 200  [200]
N/A  Q55  assertions/reservations.yml /reservations header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q56  assertions/reservations.yml /reservations text_present Reserve a Table  []
PASS  Q57  assertions/reservations.yml /reservations text_present Tables for 1 to 12  []
PASS  Q58  assertions/reservations.yml /reservations text_present Walk-ins always welcome at the bar  []
PASS  Q59  assertions/reservations.yml /reservations text_present Hours  []
PASS  Q60  assertions/reservations.yml /reservations text_present Tuesday  []
PASS  Q61  assertions/reservations.yml /reservations selector_present form  []
PASS  Q62  assertions/reservations.yml /reservations selector_present input#date  []
PASS  Q63  assertions/reservations.yml /reservations selector_present select#partySize  []
PASS  Q64  assertions/reservations.yml /reservations selector_present input#name  []
PASS  Q65  assertions/reservations.yml /reservations selector_present input#phone  []
PASS  Q66  assertions/reservations.yml /reservations selector_present input#email  []
PASS  Q67  assertions/reservations.yml /reservations selector_present textarea#notes  []
PASS  Q68  assertions/reservations.yml /reservations selector_present button[type='submit']  []
PASS  Q69  assertions/reservations.yml /reservations selector_present select#partySize option[value='12']  []
PASS  Q70  assertions/reservations.yml /api/reservations?date=2026-07-07 json_path_equals $.isClosed  [false]
PASS  Q71  assertions/reservations.yml /api/reservations?date=2026-07-06 json_path_equals $.isClosed  [true]
PASS  Q72  assertions/reservations.yml /reservations no_console_errors   []
SKIP  Q73  assertions/reservations.yml /reservations axe_no_critical   [axe-core not in harness]

== R: runtime ==
PASS  R-none  none: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-test  test: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-live  live: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-rk  rk: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-rklive  rklive: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-pklive  pklive: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-ret  ret: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-legacy  legacy: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]

TOTAL 221/221 passed  ({"PASS":221,"FAIL":0,"N/A":7,"SKIP":2})
```

Isolation probe for the resets in B-R7 (`b7probe.mjs`: 8 waves of 20
concurrent 9 MB uploads, then 40 sequential ones, against `dv31-none`):

```
{
 "413|server-end": 123,
 "413|response-complete": 35,
 "413|error:ECONNRESET": 1,
 "null|error:ECONNRESET": 1,
 "example": "closedBy=error:ECONNRESET tClose=199 written=983189 raw=\"\""
}
sequential {"413|server-end":39,"413|error:ECANCELED":1}
```

Re-verify combined TOTAL: **337 of 340 checks passed** (attack 116/119,
regression 221/221), plus 7 N/A, 2 SKIP, 136/136 unit tests, 4/4 probe
checks, and 6/6 on the builder's server suite (warm).

### 0.6 Theater Check (re-verify claims)

| Builder claimed (fix commit) | Verification found | Verdict |
|---|---|---|
| B1: the middleware matcher skips `api/`, so the cap acts on a real server | compiled matcher confirmed. On the production image: declared 1 MB gets 413 in 6 ms with 0 body bytes sent (B-R2); endless chunked gets 413 in 7 ms after 64 KB, on reservations (B-R1) and checkout (B-R4); a 1 KB / 300 ms trickle gets 413 at 8262 bytes (B-R8); declared 5 MB on checkout, both admin routes and the portal gets 413 in 5 to 7 ms (B-R9); 12 MB gets 413 in 6 ms with no Next clone warning (B-R6); 200 x 9 MB over 16 s kept memory at 70 to 84 MiB (B-R7) | CONFIRMED |
| `middlewareClientMaxBodySize` 64kb as defence in depth | present in the built server (65536). With the old matcher it does not stop the hang (old middleware + 64kb: 4/6 suite failures) | CONFIRMED as described (limits memory only) |
| /api works without the middleware | routes mint and set `hb_visitor` with the full attributes, and tag rows with it (A2, A3); a valid cookie is kept (A4); 8 forged cookie variants each get a fresh v4, and never write seed or NULL rows (A5, A6); GET and admin scoping hold (A7 to A9); webhook still fails closed (A10); GET /api sets no cookie while pages still do (A1); PR #28 regression 221/221 | CONFIRMED |
| W2: Stripe timeout 10 s, 1 retry | hung fake Stripe: 503, no row, 20.5 s, 2 attempts (C12) | CONFIRMED |
| W3: `unusedOrderId` wrapped (JSON 500) | V4 now returns the JSON 500 with 0 Stripe calls | CONFIRMED |
| W4: `parseTipCents`, a non-negative integer no larger than 100000, else 400 | exactly so, before Stripe, with no row (D1 to D8b) | CONFIRMED as specified; **but see U7: it breaks the form's own default tip on large orders** |
| W5: add-on ids de-duplicated | x200 equals x1 in price and in stored selections (D9) | CONFIRMED |
| real-server suite: 4 of 6 fail against main's middleware | 4 of 6 failed with both old-middleware builds; 6 of 6 at head when warm | CONFIRMED (cold-start flake noted) |
| 136 unit tests, plus 6 server tests | 136/136; server suite as above | CONFIRMED |

### 0.7 Re-verify Blockers

**RB1. The tip cap refuses the order form's own default tip on large orders
(new in `ad5713e`).**
- **Where:** `src/app/order/page.tsx` computes
  `tipCents = Math.round(subtotalCents * tipPct)` with presets 0 / 15 / 18 /
  20% and 18% preselected. It does not know about `MAX_TIP_CENTS`.
- **Threshold:** any cart over $5,555.56 at the default 18% (over $5,000 at
  20%) now fails checkout with a 400 whose message ("Tip must be a whole
  number of cents from 0 to 100000") is shown to the visitor.
- **Reachable through the UI:** 12 of each of 27 dishes gets there (U7). The
  cart allows 12 per line. D10's cart (50 lines x 12 of one $14 dish) is
  $8,400; its log label calls that the "largest legal cart", which
  overstates it, since carts of pricier dishes go higher.
- **Before this commit:** the same order went to Stripe and succeeded.
- **Recommended fix:** make the server bound relative to the order, for
  example `tip <= max(MAX_TIP_CENTS, subtotalCents)`, which no preset can
  exceed. Or clamp the form's tip to `MAX_TIP_CENTS` and show the clamped
  amount. Either way, add a test that the largest legal cart with the 20%
  preset checks out.
- **Agent tier:** Tier-2 implementer. The merge stays Tier-3, with a
  re-verify of D10 and U7.

### 0.8 Re-verify Warnings

- **Over-cap uploads under load sometimes see a TCP reset instead of the 413
  (B-R7).**
  - 12 of 200 in the 16 s run, and 1 of 160 in the isolation probe.
    Sequential uploads always read the 413.
  - Every upload ended within 2.1 s, none succeeded or hung, and memory
    stayed flat. So this is not a cap failure.
  - Cause: the server closes a socket that still has unread upload data, and
    the kernel sends a reset that can discard the response.
  - Only over-cap clients see it. The form limits keep legitimate requests
    far under the caps.
  - The check failed on my own thresholds (2% and 2 s), which I set before
    running and did not tune afterwards.
  - Optional fix: read and discard a bounded amount (for example 64 KB)
    before closing, or accept the behaviour. Tier-2 implementer, low
    priority.
- **The server suite has a cold-start timing flake.** Its first case failed
  at 1401 ms against a 1000 ms limit on the first run after a build, then
  passed 3 out of 3. Fix: warm the POST route in `beforeAll` (one small
  valid POST), or allow 2 s. Tier-1 implementer.
- **No CI runs vitest.** Neither the 136 unit tests nor the server suite run
  in `verify.yml`, so the real-server gate only protects a merge if someone
  runs it by hand. Recommend a CI job: `npm ci` (needs the GitHub Packages
  token as a secret for `@paradigm-codes/auth`), `npm test`,
  `npm run build`, then the server suite. Tier-2 implementer; the workflow
  change is Drew-gated.
- **The CI deep-verify gate is still the any-report version** (first-run
  warning). It stays green on this PR despite this FAIL report. Merge
  `chore/deep-gate-per-pr` first.
- **Future middleware on `/api/` would silently bring back the hang.** The
  64kb setting does not prevent it (0.4). The suite's
  "middleware on pages but not /api/" case is the guard, which is one more
  reason to wire it into CI.

### 0.9 Re-verify coverage gaps

Unchanged from the first run:
- headed Chrome not run;
- real Stripe not run (the fake Stripe covered the success, error, hang and
  collision paths);
- live proxy not probed;
- axe skipped;
- Chromium only.

### 0.10 Re-verify cleanup

- All `dv31-*` containers and the `demo-harborbistro:dv31` image were
  removed.
- The npmrc was deleted after the build.
- The temporary probe test file and the temporary middleware and config
  swaps were removed or restored, and `git status --porcelain` was empty
  before the commit.
- The local `.next` build was rebuilt at head.
- The builder's server suite stops its own server process in `afterAll`.
- This report is the only file in the commit.

---

# History: first run at 0a83724 (2026-09-19)

Everything below is the original report, kept unchanged except for its
header lines. That run's verdict was FAIL (tested SHA
`0a837249dd04a476928880164f831044b6a5e2cb`). Its blocker B1 and warnings W2 to
W5 are addressed by `ad5713e`, as shown above.


## Deep Verify: PR #31 checkout 503 with no order row, public request body caps (2026-09-19) [first run]

First-run verdict: FAIL
First-run tested commit: 0a837249dd04a476928880164f831044b6a5e2cb

Claim (1), the payment path, held under every attack: when Stripe is refused,
reset, rejects, errors, returns garbage, returns no URL or never answers,
checkout gives the fixed JSON 503, writes no order row and leaks nothing. The
row is written only after Stripe hands back a session, proven by a fake Stripe
that looked in the database while it was being called. Field limits, the
non-string refusal, the 50-line cart cap and the exact byte boundaries of all
four routes also held, and PR #28's guarantees did not regress (221 of 221).

**Claim (2) did not hold on the real production server.** The byte cap is
applied only after the whole upload has arrived. The PR says that
`readJsonBody` "refuses a declared Content-Length over the cap" and that
"a chunked or understated upload is cut off with 413". On `next start`
(standalone, NODE_ENV=production) neither happens. A never-ending chunked
upload got no response at all, and neither did a request declaring
`Content-Length: 1000000`. Next's middleware runs on every `/api/` route, and
it clones and buffers the request body (up to 10 MB) and waits for the body to
end before the route handler runs. So the handler's streaming cap never gets a
chance. The outcome guarantees still hold: every over-cap request ends in 413
and nothing is stored. But the "enforced while reading" mechanism is theater
outside the in-process unit tests. A diagnostic run of the same image with the
middleware told to skip `/api/` restored the claimed behaviour (413 after 68 ms
mid-upload, and 11 ms for an oversized declared length). That points straight
at the fix; see Blockers.

Totals: the PR #31 attack harness passed 93 of 97. Of its 4 FAILs, 3 are the
defect above (B-R1, B-R2, B-R4), and 1 (B-R3) is withdrawn as evidence
because it cannot tell a working cap from a broken one (see "Harness
corrections"). The PR #28 regression harness passed 221 of 221, plus 7 N/A
(HSTS is edge-only) and 2 SKIP (axe). An in-process probe of the id-collision
logic passed 4 of 4. Layer 1 is clean. Nothing in this run reached the Stripe
API.

## 1. Target and scope

- **Target:** `Ginkobaloba/demo-harborbistro` PR #31, branch
  `fix/checkout-503-body-caps`, head `0a837249dd04a476928880164f831044b6a5e2cb`
  (the head did not move during the run). Worktree
  `C:\dev\demo-harborbistro-wt-fix`, clean before and after.
- **Tier:** Tier-3 (payment path). The PR carries the `tier-3` label, and
  `verify/tier_map.yml` marks `reservations` and `order-checkout` as tier 3.
- **Mode:** deep (`paradigm-verify`): layers 1, 2, 3, 4 and 6 plus a targeted
  adversarial sweep built from the builder's "please attack" list, points (a)
  to (f). **Layer 5 (headed Chrome) was not run** because other agents may be
  using the browser; it is listed as a coverage gap. The separate LLM
  adversarial generator was not run.
- **Run by:** a Claude Code agent (Opus 5) on DREWSPC, not a human, and not
  the agent that wrote the PR.
- **Environment:** one image, `demo-harborbistro:dv31`, built locally from the
  PR head with `docker build --secret id=npmrc,...`. The npmrc was a temp file
  holding the agent token; it was never printed and was deleted right after
  the build. The build ran `npm run db:seed` ("60 menu items, 20 orders, 15
  reservations"), `npm run db:verify` ("Seed verification passed") and
  `next build` ("Compiled successfully"). Nine throwaway containers ran from it
  on the runtime env file
  `C:\Users\Drama\.secrets\demo_env_harborbistro.local.txt`, with the Stripe
  keys overridden per container:

  | Container | Port | STRIPE_SECRET_KEY | Publishable key | Purpose |
  |---|---|---|---|---|
  | dv31-none | 127.0.0.1:18411 | empty | empty | reservations, admin, portal caps; scope matrix; edge sweep; headless; repo assertions |
  | dv31-test | 127.0.0.1:18412 | fake `sk_test_` | empty | Stripe connection reset (listener on 443); reconcile ordering |
  | dv31-live | 127.0.0.1:18413 | fake `sk_live_` | empty | guard refuses |
  | dv31-rk | 127.0.0.1:18414 | fake `rk_test_` | empty | guard refuses (later replaced by dv31-diag, below) |
  | dv31-rklive | 127.0.0.1:18415 | fake `rk_live_` | empty | guard refuses |
  | dv31-pklive | 127.0.0.1:18416 | fake `sk_test_` | fake `pk_live_` | guard refuses |
  | dv31-ret | 127.0.0.1:18417 | empty | empty | retention; slow-client probes |
  | dv31-legacy | 127.0.0.1:18418 | empty | empty | pre-tagging DB, in-place migration |
  | dv31-fake | 127.0.0.1:18419 | fake `sk_test_` | empty | **fake Stripe** (below): success, no URL, 400, 500, garbage, slow, hang, id collision |
  | dv31-diag | 127.0.0.1:18414 | empty | empty | DIAGNOSTIC ONLY: same image, compiled middleware matcher changed to skip `/api/` |

- **No Stripe API calls, enforced:**
  - Every container ran with `--add-host api.stripe.com:127.0.0.1`, and a
    probe in each one resolved `api.stripe.com -> 127.0.0.1`.
  - Every fake key was 24 random characters behind its prefix (32 in total).
    Probes checked the overrides by prefix and length only, and no key value
    was ever printed.
  - Eight containers ran PR #28's counting listener on `127.0.0.1:443`, which
    logs each connection attempt and drops it.
  - **The fake Stripe:** `dv31-fake` ran a small HTTPS server on
    `127.0.0.1:443` (`fakestripe.js`), presenting a throwaway certificate for
    `api.stripe.com`. The app trusted it only because this one container was
    started with `NODE_EXTRA_CA_CERTS` pointing at a throwaway CA made for
    this run. The app code and the Stripe SDK were not changed. For each
    `POST /v1/checkout/sessions` the fake logged the form body and **checked
    the database for the order id while the call was in flight**. It then
    answered according to a mode file: `ok`, `nourl`, `err400` (an
    `invalid_request_error` / `amount_too_large` whose message is a sentinel
    string holding a fake key, an IP, `ECONNREFUSED` and a stack marker),
    `err500`, `garbage` (a 200 with HTML), `slow:3000`, `hang` (never answers)
    or `collide` (inserts a row with the minted id before answering `ok`,
    which simulates a concurrent writer between `unusedOrderId()` and the
    INSERT). For connection refused (C1), the fake was stopped.
- The live `demo-harborbistro` container, the public URL, demo-proxy and
  `C:\dev\cloudflare-config` were not touched. One file under
  `cloudflare-config` (`nginx/conf.d/harborbistro.conf`) was **read** to check
  the proxy's body limits (see Warnings); nothing was changed.
- Evidence dir (not in the repo):
  `C:\Users\Drama\AppData\Local\Temp\claude\C--dev\c411ea0d-b7a5-4294-9c55-34d74f91e960\scratchpad\dv31\`
  (`attack.mjs`, `regress.mjs`, `rawprobe.mjs`, `fakestripe.js`, `slow.mjs`,
  `diag.mjs`, `setup.ps1`, `attack-final2.log`, `regress-final3.log`,
  `slow.log`, `diag.log`, `unitprobe.log`, `negcontrol.log`, `build.log`,
  `vitest.log`, `lint.log`). The logs below are the clean runs; earlier runs
  are explained under "Harness corrections".

## 2. Results by category

| Category | Result | Evidence |
|---|---|---|
| payment path (claim 1) | PASS | C1 to C12, U4, U5, K-test-1/2: 7 failure modes give the fixed JSON 503 and 0 rows; the row never exists during the Stripe call |
| request size caps, outcome (claim 2) | PASS | B-*-1/2/3, B-mb, B-1mb, B-R5 to B-R7: every over-cap request gets 413 (portal: `payload_too_large`), nothing stored, exact boundaries right on all 4 routes |
| request size caps, read-time enforcement (claim 2) | **FAIL** | B-R1, B-R2, B-R4 on the real server; mechanism shown by B-R6 (Next's 10 MB clone warning) and B-R7 (memory); fix direction shown by DIAG-1/2 |
| field limits and text types (claim 2) | PASS | F-*: every field at max and max+1, multibyte, trim, non-strings, worst-case encoding |
| error_handling | PASS | E1/E2 (35 malformed carts and bodies: no 5xx, all JSON); C9 (JSON 500 on insert failure) |
| auth_lifecycle (PR #28 regression) | PASS | regression P1 to P27, X1 to X14, H0 to H8 |
| payment guard (PR #28 regression) | PASS | regression K section |
| data retention, migration (PR #28 regression) | PASS | regression T1 to T6, M1 to M8 |
| data_crud | PASS | real bookings and checkouts through the API and the UI; admin transitions |
| edge_cases | PASS except read-time cap | attack sections D, E, F, B; regression E1 to E23 |
| smoke | PASS | repo assertions Q1 to Q73: 62 PASS, 7 N/A, 2 SKIP |
| navigation | PASS | headless menu, cart, order, reservations, confirmation, admin |
| performance | PASS (local) | home LCP under the 1.5 s assertion at the local origin; 150 open slow uploads did not slow `GET /` (S4) |
| mobile_responsive | PASS (partial) | every headless check ran at 390x844 |
| security_headers | N/A locally | HSTS is added at the Cloudflare edge |
| accessibility | SKIP | `axe_no_critical` (2): axe-core is not in the harness |
| visual_regression | SKIP | no baseline exists |
| cross_browser | SKIP | Chromium only; headed Chrome not run |

### Layer 1: code (at `0a83724`)

- `npx vitest run`: 16 files, **123 passed / 123**, as the PR states.
- `npx tsc --noEmit`: exit 0.
- `npm run lint`: 0 errors, 3 warnings, all `react-hooks/set-state-in-effect`
  in files this PR does not touch.
- `next build`, `db:seed`, `db:verify`: clean inside the Docker build.
- `git diff origin/main...HEAD -- src/app/api/webhooks` is empty, so the
  webhook is untouched as claimed.
- **Negative control reproduced:** the PR's `route.test.ts` run against
  `origin/main`'s `src/app/api/checkout/route.ts` gives "13 tests, 11 failed",
  as the PR says. The file was restored with `git checkout --` right after,
  and the worktree was clean.
- **In-process collision probe** (`zz-dv31-unused-order-id.test.ts`, created
  in the worktree only for the run, then deleted; copy kept in the evidence
  dir; `git status --porcelain` empty afterwards). `newOrderId` was mocked to
  return chosen ids. 4 of 4 passed:
  - V1: two taken ids are skipped and the third is returned, after 3 draws.
  - V2: it gives up after exactly 10 taken ids with "Could not mint an unused
    order id".
  - V3: a checkout after one collision gives 200, and Stripe and the row both
    carry the free id.
  - V4: when every draw collides, `POST` **throws** "Could not mint an unused
    order id", with 0 Stripe calls and 0 new rows. In Next, a thrown error is
    a bare 500 with an empty body (see Warnings).
- Static scope audit (regression P27): PR #31 adds exactly one new query with
  no scope predicate, `unusedOrderId`'s `SELECT 1 FROM orders WHERE id = ?`
  (orders.ts:269). It has to be global to detect collisions, and it returns no
  row data. The other three are the ones the #28 report listed.

### Layer 2: runtime

- All containers were `running` with `RestartCount=0` at the end, and each
  served `/` with 200 (R sections of both logs).
- The only error lines were the expected ones: the `[checkout] Stripe session
  create failed: ...` and `[checkout] could not save order ...` lines, the
  `[startup]` refusals, Next's "Request body exceeded 10MB" warning (B-R6),
  and `[Error: aborted] { code: 'ECONNRESET' }`. That last one is Next logging
  the uploads the harness abandoned on purpose: 3 on dv31-none and 1 on
  dv31-fake, matching the abandoned uploads.

### Layers 3 and 4: network and headless

- Repo assertions (`verify/smoke.yml`, `verify/assertions/home.yml`,
  `verify/assertions/reservations.yml`) against `dv31-none`:
  `{"PASS":62,"FAIL":0,"N/A":7,"SKIP":2}` (Q1 to Q73 in the regression log).
- Headless (U section, 390x844): the reservation and checkout inputs carry
  the claimed `maxLength` values; typing 150 characters keeps 100; a UI
  checkout while Stripe fails shows "The payment service is temporarily
  unavailable" with the page intact and no row; a UI checkout with Stripe up
  sends the browser to the session URL. That navigation was intercepted in
  Playwright and never reached Stripe.

### Layer 6: slow clients and the diagnostic run (not in the TOTALs)

`slow.mjs` against `dv31-ret` (`slow.log`, verbatim):

```
[5.2s] S4 with 150 open slow uploads, GET / x5: 200/115ms 200/23ms 200/14ms 200/14ms 200/12ms
[110.2s] S3 header trickle: closed (ECONNABORTED) after 110233 ms
[110.2s] S3 header trickle: closed (close) after 110233 ms
[329.4s] S1 body trickle (1 byte / 5 s, chunked): status=408 closedBy=server-end after 329364 ms
[329.4s] S2 body trickle (declared CL 5000, 1 byte / 5 s): status=408 closedBy=server-end after 329364 ms
[329.4s] S5 of 150 slow uploads still open at end: 150
```

So a trickled body is held for about 5.5 minutes until Node's default
`requestTimeout` answers 408, and trickled headers for about 110 s. 150 slow
uploads at once did not slow the server. S5 only means those sockets had not
yet reached their own 300 s limit when the probe stopped.

`diag.mjs` against `dv31-diag` (`diag.log`, verbatim). **This is the same
image with one compiled file changed**:
`.next/server/middleware-manifest.json`, whose matcher was changed from
`(?!_next\/static|...` to `(?!api\/|_next\/static|...`. It is not the PR's
code as shipped. It is here only to show where the defect is:

```
DIAG-1 never-ending chunked: 413 after 68 ms, 65554 bytes sent when the response arrived {"error":"Request body is too large"}
DIAG-2 Content-Length 1000000, no body: 413 after 11 ms
DIAG-3 Content-Length 1000000 streamed: 413, response after 1000000 bytes sent
DIAG-4 normal cookieless booking with the middleware skipped: 201 {"id":"HR-N78MR"}, route set hb_visitor itself: true
```

(An earlier DIAG-4 attempt picked a closed date and got 400; it was re-run on
an open date.)

### Layer 6: full check logs (verbatim)

Attack harness (`attack-final2.log`), run on freshly created containers.
Section key: C is the payment path (C12 is Stripe hanging), D is tipCents, E
is malformed carts, F is field limits and multibyte, B is byte caps over raw
sockets, U is headless Chromium, K is key material, R is runtime.

```

== C: checkout payment path, Stripe failure modes (fake Stripe in dv31-fake, reset listener in dv31-test) ==
PASS  C1a  Stripe unreachable, connection refused: 503 JSON with exactly the fixed message  [503 1114 ms {"error":"The payment service is temporarily unavailable, so your order was not ]
PASS  C1b  connection refused: NO order row written  [orders 20->20]
PASS  C1c  connection refused: response leaks no internals  [none]
PASS  C2a  Stripe connection reset mid-handshake (dv31-test listener): 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C2b  Stripe connection reset mid-handshake (dv31-test listener): Stripe was actually attempted, and NO order row was written  [stripe calls 0->3, orders 20->20]
PASS  C2c  Stripe connection reset mid-handshake (dv31-test listener): response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C3a  Stripe 400 invalid_request_error carrying a sentinel message: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C3b  Stripe 400 invalid_request_error carrying a sentinel message: Stripe was actually attempted, and NO order row was written  [stripe calls 0->1, orders 20->20]
PASS  C3c  Stripe 400 invalid_request_error carrying a sentinel message: response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C4a  Stripe 500 api_error: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C4b  Stripe 500 api_error: Stripe was actually attempted, and NO order row was written  [stripe calls 1->4, orders 20->20]
PASS  C4c  Stripe 500 api_error: response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C5a  Stripe 200 with a non-JSON body: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C5b  Stripe 200 with a non-JSON body: Stripe was actually attempted, and NO order row was written  [stripe calls 4->5, orders 20->20]
PASS  C5c  Stripe 200 with a non-JSON body: response leaks no internals (sentinel, host, errno, key, stack)  [none]
PASS  C6a  Stripe session with url null: 503, JSON content-type, body is exactly the fixed message  [503 application/json {"error":"The payment service is temporarily unavailable, so your order was not placed. Pl]
PASS  C6b  Stripe session with url null: Stripe was actually attempted, and NO order row was written  [stripe calls 5->6, orders 20->20]
PASS  C6c  Stripe session with url null: response leaks no internals (sentinel, host, errno, key, stack)  [none]
INFO  checkout log lines: [checkout] Stripe session create failed: StripeConnectionError | [checkout] Stripe session create failed: StripeInvalidRequestError (amount_too_large) | [checkout] Stripe session create failed: StripeAPIError | [checkout] Stripe session create failed: Error
PASS  C7  server log lines for Stripe failures carry only the error type/code: no sentinel message, no key, no host  [6 lines]
PASS  C7b  the 400 case is logged with its Stripe code (StripeInvalidRequestError / invalid_request_error (amount_too_large))  []
INFO  harness: stale keep-alive socket on GET /, retried once
PASS  C8a  ok session: 200 with { url, orderId }, url is the session URL  [200 HB-QC5HC]
PASS  C8b  ok session: the order row did NOT exist while Stripe was being called (checked by the fake from the DB)  [rowDuringCall=false]
PASS  C8c  ok session: exactly one new row, pending, tagged with the caller visitor id, session id stored in the same insert  [pending sess=true]
PASS  C8d  ok session: client_reference_id, metadata[order_id], payment_intent_data[metadata][order_id] all equal the returned orderId  [HB-QC5HC]
PASS  C8e  ok session: success_url and cancel_url carry the same orderId  [/order/confirmation/HB-QC5HC?session_id={CHECKOUT_SESSION_ID}]
PASS  C8f  ok session: totals agree (row subtotal + tip = row total = sum of Stripe line items); tip sent as its own line  [1400+250=1650, stripe 1650]
PASS  C9a  insert fails after Stripe succeeded: JSON 500 with the fixed "could not be saved" message (not an empty 500)  [500 application/json {"error":"Your order could not be saved. Please try again."}]
PASS  C9b  insert fails: the squatting row is untouched (not overwritten by the visitor), and no second row appears  [{"n":"Squatter Row dv31","v":"dv31-squatter","s":"received","sid":null}]
PASS  C9c  insert fails: the response carries no session URL, so the orphan test session cannot be paid by this visitor  [{"error":"Your order could not be saved. Please try again."}]
PASS  C9d  insert fails: log names the order id and error class only (no customer name or phone)  [[checkout] could not save order HB-8HW3Z: SqliteError]
PASS  C10  slow Stripe (3 s): 200 and a row, nothing written before the session came back  [200 3024 ms]
PASS  C11  20 concurrent checkouts: 20 x 200, 20 distinct order ids, 20 rows each tagged with its own visitor, no row existed during any Stripe call  [20 ok, 20 ids, 20 rows]

== D: tipCents (fake Stripe in ok mode unless noted) ==
PASS  D1  negative tip (-500): coerced to 0, no Tip line sent to Stripe, total == subtotal (cannot lower the total)  [{"status":200,"row":{"s":1400,"t":0,"tot":1400,"ty":"integer"},"sentTip":null}]
PASS  D2  tip -0.4: 0, total == subtotal  [{"status":200,"row":{"s":1400,"t":0,"tot":1400,"ty":"integer"},"sentTip":null}]
PASS  D3  tip 1e400 (JSON Infinity): coerced to 0  [{"status":200,"row":{"s":1400,"t":0,"tot":1400,"ty":"integer"},"sentTip":null}]
INFO  D4 tip 1e20 with a Stripe that accepts anything: {"status":200,"row":{"s":1400,"t":100000000000000000000,"tot":100000000000000000000,"ty":"real"},"sentTip":"100000000000000000000"} (the app itself sets no upper bound)
PASS  D4  tip 1e20: the app forwards it to Stripe unbounded; only Stripe acceptance could store it (recorded, see D5)  [{"status":200,"row":{"s":1400,"t":100000000000000000000,"tot":100000000000000000000,"ty":"real"},"sentTip":"100000000000000000000"}]
INFO  harness: stale keep-alive socket on POST /api/checkout, retried once
PASS  D5  tip 1e20 when Stripe rejects the amount (as real Stripe does above 99999999): 503 and NO row  [{"status":503,"row":null,"sentTip":"100000000000000000000"}]
INFO  D6 tip 2^53+1: {"status":200,"row":{"s":1400,"t":9007199254740992,"tot":9007199254742392,"ty":"integer"},"sentTip":"9007199254740992"}
INFO  harness: stale keep-alive socket on POST /api/checkout, retried once
INFO  harness: stale keep-alive socket on POST /api/checkout, retried once
INFO  harness: stale keep-alive socket on POST /api/checkout, retried once
INFO  D7 quirks: "abc"->0 true->1 [5]->5 " 7 "->7 0.5->1
PASS  D8  across every tip tried, no stored order has a negative tip or a total below its subtotal  [0 bad rows]
INFO  harness: stale keep-alive socket on POST /api/checkout, retried once
INFO  D9 harbor-smash-burger with "bacon" x200 in extras: 200, subtotal 61700 vs 1700 plain (pre-existing: duplicate add-on ids are each charged)
PASS  D9  duplicate add-on ids can only raise the price (never below the plain item)  [61700 >= 1700]

== E: malformed carts and bodies (looking for any bare or non-JSON 500) ==
INFO  E statuses: lines [null]:400, lines [1]:400, lines ["x"]:400, lines [[]]:400, slug object:400, quantity "1":200, quantity 1.5:400, quantity -1:400, quantity 13:400, selections "abc":400, selections 5:200, selections []:200, selections null:200, selections __proto__:400, selections constructor:400, burger bun array:400, burger bun null:400, burger extras object:400, burger extras [null]:400, burger extras "bacon":200, lines array-like object:400, 51 lines:400, 50 lines:200, fulfillment object:400, customerName object:400, customerName array:400, customerPhone number:400, body null:400, body []:400, body "str":400, body 123:400, body true:400, empty body:400, huge slug 30 KB:400, unicode slug:400
PASS  E1  35 malformed carts/bodies against a working Stripe: no 5xx, every response is JSON  [none]
PASS  E2  51 lines -> 400 and 50 lines accepted  [51 lines:400,50 lines:200]

== F: field limits after trim, UTF-16 units vs UTF-8 bytes, non-string values (reservations on dv31-none, checkout on dv31-fake) ==
PASS  F-name  reservation name: 100 ASCII accepted and stored whole; 101 -> 400 "Name must be at most 100 characters", nothing stored  [201/400]
PASS  F-phone  reservation phone: 32 ASCII accepted and stored whole; 33 -> 400 "Phone must be at most 32 characters", nothing stored  [201/400]
PASS  F-email  reservation email: 254 ASCII accepted and stored whole; 255 -> 400 "Email must be at most 254 characters", nothing stored  [201/400]
PASS  F-notes  reservation notes: 500 ASCII accepted and stored whole; 501 -> 400 "Notes must be at most 500 characters", nothing stored  [201/400]
PASS  F-mb1  reservation name: 100 x e-acute (2 bytes each) accepted, stored intact  [201 units=100 bytes=200]
PASS  F-mb2  reservation name: 50 emoji (100 UTF-16 units, 200 bytes) accepted, stored intact  [201 units=100 bytes=200]
PASS  F-mb3  reservation name: 51 emoji (102 units) -> 400  [400 units=102 bytes=204]
PASS  F-mb4  reservation name: 100 CJK (300 bytes) accepted  [201 units=100 bytes=300]
PASS  F-mb5  reservation name: 101 CJK -> 400  [400 units=101 bytes=303]
PASS  F-mb6  reservation name: 99 ASCII + 1 emoji (101 units, what maxLength also blocks) -> 400  [400 units=101 bytes=103]
PASS  F-mb7  reservation name: 50 decomposed e + combining accent (100 units) accepted  [201 units=100 bytes=150]
PASS  F-worst  reservation: every field at its limit with the worst-case JSON encoding (\u escapes) is 5409 bytes, under 8192, and is accepted and stored intact  [201 5409 bytes]
PASS  F-trim  reservation name: 100 chars wrapped in ASCII and ideographic whitespace accepted, stored trimmed at 100  [201]
PASS  F-trim2  reservation name of only whitespace -> 400 (required), nothing stored  [400 {"error":"name, phone, partySize, date, and time are require]
PASS  F-types  reservation: non-string name/phone/email/notes -> 400 "<Field> must be text", nothing stored (no "[object Object]" rows)  [name=123:400:Name must be text | name={"a":1}:400:Name must be text | phone=["555"]:400:Phone must be text | email=true:400:Email must be text | notes={"toStrin]
INFO  F-lone lone high surrogate in name: 201 stored="Lone ��� surrogate 803cf9"
PASS  F-lone  reservation name with a lone UTF-16 surrogate: handled (201 or 400), not a 500  [201]
PASS  F-ck-customerName  checkout customerName: 50 emoji (100 units) accepted and stored intact; 101 units -> 400 "Name must be at most 100 characters" with NO Stripe call and no row  [400/200 stripe 48->48]
PASS  F-ck-customerPhone  checkout customerPhone: 16 emoji (32 units) accepted and stored intact; 33 units -> 400 "Phone must be at most 32 characters" with NO Stripe call and no row  [400/200 stripe 49->49]
PASS  F-ck-customerEmail  checkout customerEmail: 127 emoji (254 units) accepted and stored intact; 255 units -> 400 "Email must be at most 254 characters" with NO Stripe call and no row  [400/200 stripe 50->50]
PASS  F-ck-deliveryAddress  checkout deliveryAddress: 150 emoji (300 units) accepted and stored intact; 301 units -> 400 "Delivery address must be at most 300 characters" with NO Stripe call and no row  [400/200 stripe 51->51]
PASS  F-ck-types  checkout: object customerName -> 400 "Name must be text", no Stripe call  [400]

== B: byte caps on the running production server (raw sockets, dv31-none and dv31-fake) ==
PASS  B-res-1  /api/reservations: exactly 8192 bytes with Content-Length handled normally (201), 8193 -> 413 {"error":"Request body is too large"}  [201/413 {"error":"Request body is too large"}]
PASS  B-res-2  /api/reservations: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 201 then 413  [201/413]
PASS  B-res-3  /api/reservations: exactly 2 rows from the two at-cap requests, none from the over-cap ones  [26->28]
PASS  B-ck-1  /api/checkout: exactly 32768 bytes with Content-Length handled normally (200), 32769 -> 413 {"error":"Request body is too large"}  [200/413 {"error":"Request body is too large"}]
PASS  B-ck-2  /api/checkout: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 200 then 413  [200/413]
PASS  B-ck-3  /api/checkout: exactly 2 rows from the two at-cap requests, none from the over-cap ones  [65->67]
PASS  B-admO-1  /api/admin/orders/<id>: exactly 1024 bytes with Content-Length handled normally (400), 1025 -> 413 {"error":"Request body is too large"}  [400/413 {"error":"Request body is too large"}]
PASS  B-admO-2  /api/admin/orders/<id>: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 400 then 413  [400/413]
PASS  B-admR-1  /api/admin/reservations/<id>: exactly 1024 bytes with Content-Length handled normally (400), 1025 -> 413 {"error":"Request body is too large"}  [400/413 {"error":"Request body is too large"}]
PASS  B-admR-2  /api/admin/reservations/<id>: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 400 then 413  [400/413]
PASS  B-portal-1  /api/auth/portal-handoff: exactly 16384 bytes with Content-Length handled normally (400/401/403/503), 16385 -> 413 {"ok":false,"error":"payload_too_large"}  [401/413 {"ok":false,"error":"payload_too_large"}]
PASS  B-portal-2  /api/auth/portal-handoff: same boundary over chunked transfer with no Content-Length (1000-byte chunks): 400/401/403/503 then 413  [401/413]
INFO  B-mb bodies 8192 / 8193 bytes, notes 2698 UTF-16 units of CJK
PASS  B-mb  reservation notes of CJK: 8192-byte body in 7-byte chunks (splitting characters) -> not 413; 8193 bytes -> 413  [400 {"error":"Notes must be at most 500 characters"} / 413]
PASS  B-under  understated Content-Length (12) with a 40 KB body: server reads 12 bytes -> 400, the rest is not a valid request, nothing stored, server fine  [400 ]
PASS  B-over  overstated Content-Length (5000) with a short valid body, client gives up: no response, nothing stored, server fine  [null client-timeout]
PASS  B-gzip  gzip "bomb" (4908 bytes on the wire, 5 MB inflated) -> 400, not inflated, nothing stored  [400]
INFO  B-te-cl Content-Length together with Transfer-Encoding: 400
PASS  B-1mb  the #28 repro over chunked transfer: 1 MB name -> 413 JSON, nothing stored  [413]
FAIL  B-R1  READ-TIME CAP: a chunked upload that passes 8 KB and keeps going gets its 413 while still uploading (claim: "abandoned as soon as the running total passes the cap")  [no response after 15009 ms and 184570 bytes sent (client-timeout)]
FAIL  B-R2  READ-TIME CAP: a declared Content-Length of 1,000,000 is refused up front, before the body is sent (claim: "refused up front (413)")  [no response after 10031 ms (client-timeout)]
FAIL  B-R3  READ-TIME CAP: with Content-Length 1,000,000 streamed, the 413 arrives before the whole megabyte has been sent  [413 after 1000000 of 1000000 bytes]
FAIL  B-R4  READ-TIME CAP (checkout, 32 KB): a never-ending chunked upload gets a 413 while still uploading  [no response after 15004 ms and 184578 bytes (client-timeout)]
PASS  B-R5  after B-R1..B-R4 nothing was stored and the server still answers  []
INFO  B-R6 12 MB chunked: 413 after 1380 ms, first response byte after 12584666 bytes sent; server log: Request body exceeded 10MB for /api/reservations. Only the first 10MB will be available unless configured. See https://nextjs.org/docs/app/api-referen
PASS  B-R6  12 MB chunked upload still ends in 413 with nothing stored (outcome), and Next logs its 10 MB middleware body-clone warning (mechanism)  [413]
INFO  B-R7 20 concurrent 9 MB chunked uploads: statuses 413; dv31-none memory 105.3MiB before, peak 388.6MiB during
PASS  B-R7  20 concurrent 9 MB uploads all end in 413 and the server survives (outcome)  [413]

== U: headless Chromium (390x844): form limits and the 503 message ==
PASS  U1  /reservations inputs carry maxLength name 100, phone 32, email 254, notes 500  [[100,32,254,500]]
PASS  U2  typing 150 characters into the reservation name keeps 100  [100]
PASS  U3  /order checkout inputs carry maxLength name 100, phone 32, email 254, address 300  [text:100,tel:32,email:254,radio:-1,radio:-1,text:300]
PASS  U4  UI checkout while Stripe fails: /api/checkout 503, the "payment service is temporarily unavailable" message is shown, page intact, no row  [503 rows 67->67]
PASS  U5  UI checkout with Stripe up: 200, the browser is sent to the session URL (intercepted, never reaches Stripe), one pending row  [200 https://checkout.stripe.com/c/pay/cs_test_dv31_f5be4b89025c5]
PASS  U6  no uncaught page errors in the UI run  []

== C12: Stripe accepts the TLS connection and never answers (timeout path) ==
INFO  C12 hang: 503 after 241.0 s, 3 Stripe attempt(s)
PASS  C12  Stripe that never answers: checkout still ends in the JSON 503 with no row (however long it takes)  [503 after 241.0 s, 3 attempts]

== K: key material ==
PASS  K1  the fake sk_test_ keys never appear in either container log  [fake:clean test:clean]

== R: runtime ==
INFO  R-none request-aborted log lines from the harness's deliberately abandoned uploads: 3
PASS  R-none  none: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
INFO  R-test request-aborted log lines from the harness's deliberately abandoned uploads: 0
PASS  R-test  test: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
INFO  R-fake request-aborted log lines from the harness's deliberately abandoned uploads: 1
PASS  R-fake  fake: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]

TOTAL 93/97 passed  ({"PASS":93,"FAIL":4})
```

Regression harness (`regress-final3.log`): PR #28's harness, renamed to the
dv31 containers and run again on freshly created containers. Three checks
were changed on purpose, because PR #31 changes the behaviour they pinned:
K-test-2 now requires a 503 and **no** row (it used to require the pending
row); the reconcile-ordering probes K-test-3/4 use a pending row inserted
directly, since checkout can no longer leave one behind; and E9 now requires
413 with nothing stored (E9b) instead of accepting 201. P27 expects PR #31's
one new existence probe. Everything else is unchanged.

```

== P: per-visitor scope (container none, no Stripe key) ==
PASS  P1  A first request: 200 and hb_visitor Set-Cookie  [200]
PASS  P2  cookie flags: HttpOnly, SameSite=Lax, Path=/, Max-Age=2592000, Secure  [hb_visitor=<v4>; Path=/; Expires=Mon, 19 Oct 2026 08:19:39 GMT; Max-Age=2592000; Secure; HttpOnly; SameSite=lax]
PASS  P3  A id is a lowercase v4 UUID  [v4]
PASS  P4  A second request keeps its id (no new hb_visitor Set-Cookie)  [0 set-cookie]
PASS  P5  B gets its own distinct valid id  [distinct]
PASS  P6  A creates a reservation through the real API -> 201  [201 HR-YU2BY]
PASS  P7  A reservation row is tagged with A visitor id  [tag==A]
PASS  P8  B creates its own reservation -> 201, tagged B  [201 HR-XBMJQ]
PASS  P9  cookieless create -> 201, sets HttpOnly SameSite=Lax cookie, row tagged with that minted id  [201]
INFO  A order HB-A742D (received), HB-C742D (completed); B order HB-B742D; legacy HB-LGCYN / RS-LGCYN (visitor_id NULL); A res HR-YU2BY; B res HR-XBMJQ
INFO  unknown-id bodies: api={"error":"Order not found"} adminOrder={"error":"Order not found"} adminRes={"error":"Reservation not found"}
PASS  P10  A: own /reservations/<id> 200 with own name  [200]
PASS  P11  A: own /order/confirmation/<id> 200 showing the order (item line)  [200]
PASS  P12  A: own /api/orders/<id> 200, returns no PII fields  [id,status,statusLabel,fulfillment,updatedAt]
PASS  P13  A: /admin/orders lists A orders (active + recent) and seed  [A_ORD,A_ORD2,seed]
PASS  P14  A: /admin/reservations lists A booking and seed  []
PASS  P15  A: never sees B data (admin orders/reservations)  []
PASS  P16  A: B reservation detail 404  []
PASS  P17  A: legacy NULL rows hidden from A admin views  []
PASS  P18  A: legacy order /api/orders -> 404 and admin POST -> 404  []
PASS  P19  A: legacy reservation detail 404 and admin POST 404  []
PASS  P20  header counts are scoped: A active = B active (B has 1 own received order too), cookieless = seed-only = B - 1  [A=11 B=11]
PASS  X1a  B (own valid cookie): A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X1b  B (own valid cookie): /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X1c  B (own valid cookie): admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X2a  cookieless: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X2b  cookieless: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X2c  cookieless: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X3a  forged seed: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X3b  forged seed: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X3c  forged seed: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X4a  forged SEED: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X4b  forged SEED: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X4c  forged SEED: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X5a  forged url-encoded seed: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X5b  forged url-encoded seed: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X5c  forged url-encoded seed: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X6a  foreign random v4: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X6b  foreign random v4: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X6c  foreign random v4: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X7a  A id uppercased: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X7b  A id uppercased: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X7c  A id uppercased: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X8a  A id, version nibble 1: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X8b  A id, version nibble 1: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X8c  A id, version nibble 1: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X9a  A id with suffix: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X9b  A id with suffix: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X9c  A id with suffix: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X10a  dup: seed then foreign v4: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X10b  dup: seed then foreign v4: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X10c  dup: seed then foreign v4: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X11a  dup: foreign v4 then seed: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X11b  dup: foreign v4 then seed: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X11c  dup: foreign v4 then seed: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X12a  empty value: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X12b  empty value: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X12c  empty value: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X13a  4 KB junk: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X13b  4 KB junk: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X13c  4 KB junk: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  X14a  SQL-shaped: A detail routes (reservation page, order confirmation, /api/orders) all 404, no A data  [404/404/404 pii-leaks=0]
PASS  X14b  SQL-shaped: /admin, /admin/orders, /admin/reservations 200, 0 A records, seed shown, legacy hidden  [200/200/200 leaks= seed=true legacyHidden=true]
PASS  X14c  SQL-shaped: admin POST advance/cancel on A order and cancel on A booking -> 404, body identical to unknown id  [404/404/404]
PASS  P21  after the attack matrix A order is still received and A booking still confirmed, tags unchanged  [received/confirmed]
PASS  P22  B: 200 random guessed order codes, 0 non-seed foreign orders resolved  [foreign hits=0]
PASS  P23  A: admin POST advance on own order -> 200 preparing  [{"id":"HB-A742D","status":"preparing","statusLabel":"Preparing"}]
PASS  P24  A: admin POST seat own booking -> 200 seated  [{"id":"HR-YU2BY","status":"seated"}]
PASS  P25  B: admin POST on a seed order -> 200 (staff demo still works)  [{"id":"HB-AE4K3","status":"preparing","statusLabel":"Preparing"}]
PASS  P26  every row written in this run is tagged: the only NULL rows are the 2 deliberate legacy inserts  [orders NULL=1 reservations NULL=1]
INFO  static: SELECT ... FROM orders|reservations without the scope predicate: src\lib\orders.ts:269, src\lib\orders.ts:285, src\lib\orders.ts:305, src\lib\reservations.ts:42
PASS  P27  static: only 4 unscoped reads remain (getOrderUnscoped, getOrderByCheckoutSession, slot counts, and the PR #31 unusedOrderId existence probe that returns no row data)  [src\lib\orders.ts:269 src\lib\orders.ts:285 src\lib\orders.ts:305 src\lib\reservations.ts:42]

== K: Stripe test-key guard (per container) ==
PASS  K-none-1  none: valid checkout -> 503 "not configured"  [503 {"error":"Online payment is not configured in this environment. Set STRIPE_SECRET_KEY (test mode) to enable checkout."}]
PASS  K-none-2  none: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 24->24]
PASS  K-none-3  none: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-live-1  live: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-live-2  live: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-live-3  live: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-rk-1  rk: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-rk-2  rk: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-rk-3  rk: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-rklive-1  rklive: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-rklive-2  rklive: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-rklive-3  rklive: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-pklive-1  pklive: valid checkout -> 503 "test-mode keys"  [503 {"error":"Online payment is disabled: this demo only runs with Stripe test-mode keys."}]
PASS  K-pklive-2  pklive: 0 connections to api.stripe.com (443 listener) and no order row written  [hits 0->0 orders 20->20]
PASS  K-pklive-3  pklive: garbage body -> 503 (guard runs before parsing), no crash  [503]
PASS  K-live-4  live: boot log carries the [startup] refusal  []
PASS  K-rk-4  rk: boot log carries the [startup] refusal  []
PASS  K-rklive-4  rklive: boot log carries the [startup] refusal  []
PASS  K-pklive-4  pklive: boot log carries the [startup] refusal  []
PASS  K-none-4  none: no [startup] refusal (missing key is not a live key), checkout says not configured  []
PASS  K-test-1  test (fake sk_test_): checkout passes the guard and DOES try Stripe (blocked at the pinned host)  [status 503, hits 0->3]
INFO  K-test checkout response: 503 {"error":"The payment service is temporarily unavailable, so your order was not placed. Please try again in a moment."}
PASS  K-test-2  test (PR #31): blocked Stripe -> 503 JSON and no order row written (was: pending row left behind)  [503 orders 20->20]
INFO  harness: stale keep-alive socket on GET /, retried once
PASS  K-test-3  test: B on A pending order with ?session_id -> 404 and 0 Stripe connections (scope check runs before reconcile)  [404 hits 3->3]
PASS  K-test-4  test: A on own pending order with ?session_id -> 200, reconcile attempted, fails soft (pending state shown)  [200 hits 3->6]
PASS  K-test-5  test: invalid checkout body -> 400 before any Stripe call  [400]
PASS  K-none-scan  none: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-test-scan  test: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-live-scan  live: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-rk-scan  rk: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-rklive-scan  rklive: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]
PASS  K-pklive-scan  pklive: 0 sk_/rk_ keys and 0 pk_live_ in 10 pages + 17 JS chunks + 503 body; 0 exact env key values  [sk/rk x0, pk_live x0, exact x0]

== M: in-place migration of a pre-tagging database (container legacy) ==
PASS  M1  prep ran on a DB without visitor_id (boot log)  []
PASS  M2  server boot added visitor_id to orders and reservations  []
PASS  M3  ISO-timestamp seed rows backfilled to seed (20 orders, 15 reservations)  [20/15]
PASS  M4  app-style legacy rows kept with visitor_id NULL (2 orders, 2 reservations, incl. the 48h-old ones: not purged at boot)  [[{"id":"HB-LGCY2","v":null},{"id":"HB-LGCY3","v":null}][{"id":"RS-LGCY2","v":null},{"id":"RS-LGCY3","v":null}]]
PASS  M5  visitor indexes created  [2]
PASS  M6  fresh visitor: legacy names absent from admin views, seed shown  []
PASS  M7  legacy rows: detail, API and admin POST all 404 (fresh and forged-seed cookies)  [404/404/404/404/404]
PASS  M8  post-migration visitor write -> 201 and tagged  [201]

== T: 24h retention purge (container ret) ==
INFO  inserted per table: V25A (app format, -25h), V25B (ISO, -25h), V23 (-23h), S100 (seed, -100h), N100 (NULL, -100h); created_at V25A=2026-09-18 07:20:27 V25B=2026-09-18T07:20:28.248Z
PASS  T1  hourly gate: 6 requests after insert do not purge (boot run already happened this hour); all 5+5 rows present  [5/5]
PASS  T2  after restart (boot purge): orders -25h rows gone in both timestamp formats; -23h, seed -100h, NULL -100h kept  [N100,S100,V23]
PASS  T3  after restart: reservations same outcome  [N100,S100,V23]
PASS  T4  fresh visitor booking made minutes ago survives  [HR-H44P7]
PASS  T5  boot log: "[retention] deleted 2 orders and 2 reservations"  [[retention] deleted 2 orders and 2 reservations created by visitors before 2026-09-18T08:20:40.295Z]
PASS  T6  seed rows untouched (20 + 1 orders, 15 + 1 reservations incl. the -100h seed probes)  [21/16]

== E: edge sweep (container none) ==
PASS  E1  reservations: no body -> 400  [400 {"error":"Invalid JSON"}]
PASS  E2  reservations: garbage JSON -> 400  [400 {"error":"Invalid JSON"}]
PASS  E3  reservations: missing fields -> 400  [400 {"error":"name, phone, partySize, date, and time are required"}]
PASS  E4  reservations: partySize as string -> 400  [400 {"error":"partySize must be 1-12"}]
PASS  E5  reservations: partySize 13 -> 400  [400 {"error":"partySize must be 1-12"}]
PASS  E6  reservations: bad date format -> 400  [400 {"error":"date must be YYYY-MM-DD"}]
PASS  E7  reservations: closed Monday -> 409  [409 {"error":"That time slot is no longer available"}]
PASS  E8  reservations: time not a slot (03:00) -> 409  [409 {"error":"That time slot is no longer available"}]
PASS  E9  reservations (PR #31): 1 MB name -> 413 (was 201 stored)  [413 {"error":"Request body is too large"}]
PASS  E9b  reservations: nothing stored for the 1 MB name  [19]
PASS  E10  reservations: HTML/unicode/apostrophes in name -> 201  [201 {"id":"HR-4PC9A"}]
PASS  E11  owner confirmation and admin escape HTML (no raw <script>alert(1) or <img src=x), unicode intact  []
PASS  E12  20 concurrent same-slot bookings: 201 count = remaining capacity (6 - existing), rest 409, slot never over 6  [existing 0, 201 x6, 409 x14, now 6]
PASS  E13  20 concurrent cookieless first requests -> 20 distinct valid v4 ids  [20]
PASS  E14  admin orders POST garbage JSON -> 400  [400 {"error":"Invalid JSON"}]
PASS  E15  admin orders POST unknown action -> 400  [400 {"error":"action must be \"advance\" or \"cancel\""}]
PASS  E16  admin reservations POST status "confirmed" (not allowed) -> 400  [400 {"error":"status must be one of seated, completed, cancelled"}]
PASS  E17  admin orders GET -> 405  [405]
PASS  E18  SQL-shaped ids on /api/orders and admin POST -> 404  [404/404]
PASS  E19  matcher-skipped path /api/orders/<A>.png -> 404 for B and cookieless  [404/404]
PASS  E20  unicode reservation id -> 404, not 500  [404]
PASS  E21  owner illegal transition completed -> cancelled -> 409 (not 404, not 500)  [409 {"error":"Reservation HR-YU2BY cannot move from \"completed\" to \"cancelled\""}]
PASS  E22  checkout 1 MB body with no key -> 503, no crash  [503]
PASS  E23  4 KB cookie value -> 200 and replaced by a fresh v4 id  [200]

== H: headless Chromium (390x844, container none) ==
PASS  H0  browser A holds hb_visitor: httpOnly, secure, sameSite Lax, v4  [true/true/Lax]
PASS  H0b  browser A keeps the same id across navigations (cookie sent back over http://127.0.0.1)  []
PASS  H1  /reservations shows the demo notice (visible)  []
PASS  H2  /order checkout form (cart with 1 item) shows the demo notice (visible)  []
INFO  H2b checkout submit from UI: 503
PASS  H2b  UI checkout submit with no key -> /api/checkout 503 and the not-configured message is shown in the page, no crash  [503]
PASS  H3  browser A books through the UI and lands on its confirmation with its name  [/reservations/HR-WTGMF]
PASS  H4  browser B opens A confirmation URL -> 404, A name absent  [404]
PASS  H5  browser B /admin/reservations: A booking absent, scope note shown  []
PASS  H6  browser A /admin/reservations: own booking present  []
PASS  H7  browser A: no console errors across home, menu, reservations, order, booking, admin (the one expected 503 resource error from H2b excluded)  [Failed to load resource: the server responded with a status of 503 (Service Unavailable)]
PASS  H8  browser B: only console error is the expected 404 resource load  [Failed to load resource: the server responded with a status of 404 (Not Found)]

== Q: repo's own assertions (verify/smoke.yml, assertions/home.yml, assertions/reservations.yml) against container none ==
PASS  Q1  smoke.yml / http_status 200  [200]
PASS  Q2  smoke.yml / text_present Dinner by the water, minus the production  []
PASS  Q3  smoke.yml / text_present Harbor Bistro  []
PASS  Q4  smoke.yml / text_present Coastal-inspired, locally sourced  []
PASS  Q5  smoke.yml / selector_present main  []
PASS  Q6  smoke.yml / selector_present a[href='/reservations']  []
PASS  Q7  smoke.yml / selector_present a[href='/menu']  []
N/A  Q8  smoke.yml / header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q9  smoke.yml /menu http_status 200  [200]
PASS  Q10  smoke.yml /menu text_present The Menu  []
PASS  Q11  smoke.yml /menu text_present cooked to order  []
PASS  Q12  smoke.yml /menu selector_present main  []
N/A  Q13  smoke.yml /menu header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q14  smoke.yml /reservations http_status 200  [200]
PASS  Q15  smoke.yml /reservations text_present Reserve a Table  []
PASS  Q16  smoke.yml /reservations text_present Tables for 1 to 12  []
PASS  Q17  smoke.yml /reservations selector_present form  []
PASS  Q18  smoke.yml /reservations selector_present input#date  []
PASS  Q19  smoke.yml /reservations selector_present select#partySize  []
PASS  Q20  smoke.yml /reservations selector_present input#name  []
PASS  Q21  smoke.yml /reservations selector_present input#phone  []
N/A  Q22  smoke.yml /reservations header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q23  smoke.yml /order http_status 200  [200]
PASS  Q24  smoke.yml /order text_present cart  []
PASS  Q25  smoke.yml /order selector_present main  []
N/A  Q26  smoke.yml /order header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q27  smoke.yml /about http_status 200  [200]
PASS  Q28  smoke.yml /about text_present Harbor Bistro  []
PASS  Q29  smoke.yml /about selector_present main  []
N/A  Q30  smoke.yml /about header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q31  smoke.yml /api/reservations?date=2026-07-04 http_status 200  [200]
PASS  Q32  smoke.yml /api/reservations?date=2026-07-04 json_path_equals $.slots  [["16:00","16:30","17:00","17:30","18:00","18:30","19:00","19]
PASS  Q33  assertions/home.yml / http_status 200  [200]
N/A  Q34  assertions/home.yml / header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q35  assertions/home.yml / text_present Dinner by the water, minus the production  []
PASS  Q36  assertions/home.yml / text_present Coastal-inspired, locally sourced, weeknight-easy.  []
PASS  Q37  assertions/home.yml / text_present Reserve a Table  []
PASS  Q38  assertions/home.yml / text_present See the Menu  []
PASS  Q39  assertions/home.yml / text_present This week  []
PASS  Q40  assertions/home.yml / text_present Good fish, short menu, honest hours  []
PASS  Q41  assertions/home.yml / text_present 412 Harborline Drive  []
PASS  Q42  assertions/home.yml / text_present Tue-Sun from 4pm  []
PASS  Q43  assertions/home.yml / text_present Harbor Bistro  []
PASS  Q44  assertions/home.yml / selector_present main  []
PASS  Q45  assertions/home.yml / selector_present section  []
PASS  Q46  assertions/home.yml / selector_present a[href='/reservations']  []
PASS  Q47  assertions/home.yml / selector_present a[href='/menu']  []
PASS  Q48  assertions/home.yml / selector_present ul li a[href^='/menu/']  []
PASS  Q49  assertions/home.yml / selector_present header  []
PASS  Q50  assertions/home.yml / selector_present [data-testid='demo-banner'], footer, [class*='DemoBanner'], [class*='demo']  []
PASS  Q51  assertions/home.yml / lcp_under_ms 1500 (local origin)  [120 ms]
PASS  Q52  assertions/home.yml / no_console_errors   []
SKIP  Q53  assertions/home.yml / axe_no_critical   [axe-core not in harness]
PASS  Q54  assertions/reservations.yml /reservations http_status 200  [200]
N/A  Q55  assertions/reservations.yml /reservations header_present Strict-Transport-Security  [HSTS is added at the Cloudflare edge]
PASS  Q56  assertions/reservations.yml /reservations text_present Reserve a Table  []
PASS  Q57  assertions/reservations.yml /reservations text_present Tables for 1 to 12  []
PASS  Q58  assertions/reservations.yml /reservations text_present Walk-ins always welcome at the bar  []
PASS  Q59  assertions/reservations.yml /reservations text_present Hours  []
PASS  Q60  assertions/reservations.yml /reservations text_present Tuesday  []
PASS  Q61  assertions/reservations.yml /reservations selector_present form  []
PASS  Q62  assertions/reservations.yml /reservations selector_present input#date  []
PASS  Q63  assertions/reservations.yml /reservations selector_present select#partySize  []
PASS  Q64  assertions/reservations.yml /reservations selector_present input#name  []
PASS  Q65  assertions/reservations.yml /reservations selector_present input#phone  []
PASS  Q66  assertions/reservations.yml /reservations selector_present input#email  []
PASS  Q67  assertions/reservations.yml /reservations selector_present textarea#notes  []
PASS  Q68  assertions/reservations.yml /reservations selector_present button[type='submit']  []
PASS  Q69  assertions/reservations.yml /reservations selector_present select#partySize option[value='12']  []
PASS  Q70  assertions/reservations.yml /api/reservations?date=2026-07-07 json_path_equals $.isClosed  [false]
PASS  Q71  assertions/reservations.yml /api/reservations?date=2026-07-06 json_path_equals $.isClosed  [true]
PASS  Q72  assertions/reservations.yml /reservations no_console_errors   []
SKIP  Q73  assertions/reservations.yml /reservations axe_no_critical   [axe-core not in harness]

== R: runtime ==
PASS  R-none  none: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-test  test: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-live  live: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-rk  rk: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-rklive  rklive: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-pklive  pklive: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-ret  ret: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]
PASS  R-legacy  legacy: running, 0 restarts, / 200, no unexpected error lines  [running 0; / 200; unexpected x0 ]

TOTAL 221/221 passed  ({"PASS":221,"FAIL":0,"N/A":7,"SKIP":2})
```

Combined TOTAL: **314 of 318 checks passed** (attack 93/97, regression
221/221), plus 7 N/A, 2 SKIP and 4 of 4 in-process probes. Of the 4 FAILs, 3
stand (B-R1, B-R2, B-R4) and 1 is withdrawn (B-R3).

Curated edge categories covered: missing and malformed input (35 cart and
body shapes, non-string fields, empty and non-object bodies), max inputs
(every field at max and max+1, exact byte caps, 1 MB, 9 MB, 12 MB, a
never-ending stream), special characters (emoji, CJK, combining marks, lone
surrogates, ideographic whitespace, gzip bodies), race conditions (20
concurrent checkouts, the insert-time id collision, 20 concurrent same-slot
bookings), slow network (slow Stripe, hanging Stripe, trickled headers and
bodies, 150 slow uploads) and denied permissions (the whole PR #28 X matrix).

## 3. Theater Check

| PR #31 claimed | Verification found | Verdict |
|---|---|---|
| Stripe unreachable or failing gives a JSON 503 with a fixed message | refused (C1), reset (C2), 400 with a sentinel (C3), 500 (C4), non-JSON 200 (C5), no URL (C6) and a hang (C12, after 241 s): every one is 503 with exactly `{"error":"The payment service is temporarily unavailable, ..."}` and JSON content-type; the UI shows it (U4) | CONFIRMED |
| No order row is written when Stripe fails | 0 new rows in all 7 failure modes (C1b to C6b, C12, U4); regression K-test-2 | CONFIRMED |
| The row is written only after Stripe returns a session with a URL | the fake Stripe checked the DB during each call: the row was absent every time (C8b, C10, 20 of 20 in C11); a session with no URL leaves no row (C6); exactly one pending, tagged row with the session id appears afterwards (C8c) | CONFIRMED |
| The client never sees error internals; the log carries only the type or code | 0 leak markers in every 503 body (C*c); log lines are `StripeConnectionError`, `StripeInvalidRequestError (amount_too_large)`, `StripeAPIError`, `Error`, with no sentinel, key or host (C7, C7b); fake keys never in the logs (K1) | CONFIRMED |
| The session carries the pre-minted id (client reference, metadata, URLs) | all four carry the returned `orderId`, and the totals match the line items (C8d to C8f) | CONFIRMED |
| `unusedOrderId` checks that the id is free | skips taken ids and gives up after 10 (V1 to V3) | CONFIRMED; the give-up path is a bare 500 (V4, Warnings) |
| Insert fails after Stripe succeeded: JSON 500, and the test session expires on its own | a real concurrent-writer collision gives the JSON 500 "could not be saved", the squatting row is untouched, no session URL is returned, and the log carries the id and `SqliteError` only (C9a to C9d). "Expires on its own" is Stripe behaviour that cannot be observed without a Stripe account | CONFIRMED (JSON 500); expiry UNVERIFIED |
| `readJsonBody` refuses a declared Content-Length over the cap up front | on the running server, `Content-Length: 1000000` with no body got **no response in 10 s** (B-R2). It does work in-process (unit test) and when the middleware skips `/api/` (DIAG-2, 11 ms) | **THEATER on the real server** |
| It counts the stream while reading and cuts a chunked or understated upload off with 413 | the 413 itself: CONFIRMED on every route over Content-Length and chunked transfer, at the exact byte (B-*-1/2, B-mb, B-1mb). "Cut off": a never-ending chunked upload got **no response in 15 s** on reservations (B-R1) and checkout (B-R4); a 12 MB upload was answered only after all 12.5 MB were sent, with Next's own log saying it buffered 10 MB (B-R6); 20 concurrent 9 MB uploads took the container from 105 MiB to a peak of 389 MiB (B-R7) | **THEATER** (mechanism); outcome CONFIRMED |
| Caps: checkout 32 KB, reservations 8 KB, admin actions 1 KB, portal 16 KB; the portal keeps `{ ok:false, error:"payload_too_large" }` | exact cap accepted and cap+1 refused, over Content-Length and chunked, on all five endpoints (B-*-1/2) | CONFIRMED |
| Field limits after trim: name 100, phone 32, email 254, address 300, notes 500 | max accepted and stored whole, max+1 is 400 with the stated message, on reservations and checkout; whitespace trimmed first (F-*, F-trim) | CONFIRMED |
| Limits count UTF-16 units, the byte cap counts UTF-8 bytes | emoji, CJK and combining marks behave by UTF-16 units (F-mb1 to F-mb7); an 8192-byte CJK body in 7-byte chunks is not 413, and 8193 is (B-mb); the worst-case legal reservation is 5409 bytes, so a legal form can never hit the byte cap (F-worst) | CONFIRMED |
| Non-strings refused instead of stored as "[object Object]" | 400 "<Field> must be text" for numbers, objects, arrays, booleans; 0 rows; no `[object Object]` anywhere (F-types, F-ck-types) | CONFIRMED |
| Cart capped at 50 lines | 51 is 400, 50 is 200 (E2) | CONFIRMED |
| Over-cap requests get 413 or 400 and nothing is stored | row counts unchanged across every over-cap, understated, overstated and gzip request (B-*-3, B-under, B-over, B-gzip, B-R5, B-R6) | CONFIRMED |
| Forms mirror the limits with maxLength and show the server's error text | U1 to U4 | CONFIRMED |
| Stripe webhook untouched | empty diff on `src/app/api/webhooks` | CONFIRMED |
| 123/123 tests, tsc clean, lint 0 errors / 3 warnings, build succeeds; negative control 11 of 13 fail on main | reproduced exactly (Layer 1) | CONFIRMED |
| (from #28, regression) visitor scoping, Stripe key guard, retention, migration | 221 of 221 (regression log) | CONFIRMED |

## 4. Blockers

### B1. The byte cap does not act while reading on the production server (claim 2)

**What:** `src/middleware.ts` matches every path except static assets, so it
runs on `POST /api/checkout`, `/api/reservations`, `/api/admin/*` and
`/api/auth/portal-handoff`. When middleware runs on a request with a body,
Next 15.5 (`next/dist/server/body-streams.js`, `getCloneableBody`) reads the
entire incoming body. It keeps up to `middlewareClientMaxBodySize` (default
10 MB) in memory and discards the rest. `sandbox.js` then `await`s
`finalize()`, which waits for the request to **end** before the route handler
runs. So `readJsonBody`'s Content-Length check and its streaming counter only
ever see a finished (and at most 10 MB) body.

**Effect:**
- the 413 comes only after the whole upload;
- a never-ending or slow upload gets no answer until Node's 300 s
  `requestTimeout` (S1: 408 after 329 s);
- each in-flight upload can pin up to 10 MB (B-R7).

Nothing is ever stored, so this is a resource and honesty problem, not a
data one. It is **not a regression**: `main` has the same middleware. But it
is the core mechanism claim of D-017 and of the PR, and the unit tests cannot
see it because they call the handler directly, without Next's server.

**Recommended fix** (proven by DIAG-1/2/4):
- Exclude `/api/` from the middleware matcher, for example by adding `api/` to
  the negative lookahead. The write routes already mint and set `hb_visitor`
  themselves through `visitorIdForWrite` (DIAG-4: 201 plus the cookie). The
  admin POSTs fall back to seed-only scope without a cookie. GET routes under
  `/api/` keep working the same way, because they read the cookie the browser
  already holds.
- If you want defence in depth, also set
  `experimental.middlewareClientMaxBodySize` low (for example `64kb`) in
  `next.config.mjs`.
- Add one test that runs against a real `next start` server: a chunked upload
  that never ends must get 413 within a second.
- Update D-017 and the PR text to say what the cap does once this lands.

**Agent tier:** Tier-2 implementer (Sonnet-class). It is a small matcher and
config change plus a server-level test. The PR stays Tier-3 for the merge,
and it needs a re-verify of B-R1 to B-R7 on the new head.

## 5. Warnings

### CI "Deep Verify" is green on this PR without any report for it (process)

`gh pr checks 31` shows "Deep Verify (tier-3 PRs only): pass". That is the
old gate on `main`, which accepts "Overall: PASS" from **any** file in
`verify/reports/`, here the PR #25 report. The per-PR gate that checks the PR
number and `Tested-SHA` lives on the unmerged branch
`origin/chore/deep-gate-per-pr`. **This FAIL report does not turn the current
check red.** Do not merge on CI alone. Recommend merging the per-PR gate
chore before PR #31 (Tier-2 implementer, Drew merges).

### Stripe timeouts are longer than the proxy's (payment UX)

With a Stripe that accepts the connection and never answers, the app's 503
came after **241 s** (3 attempts of the SDK default 80 s; C12).
`cloudflare-config/nginx/conf.d/harborbistro.conf` sets
`proxy_read_timeout 60s`, so a real visitor would get the proxy's 504 at 60 s,
not the friendly 503. The order form catches that and shows "Could not reach
the payment service". Still no row, so it is safe. But a Stripe call that
succeeds between 60 s and 240 s would leave a pending, tagged row that the
visitor never saw (purged after 24 h). Recommend
`new Stripe(key, { timeout: 10_000, maxNetworkRetries: 1 })` in
`src/lib/stripe.ts` (Tier-2 implementer).

### `unusedOrderId` exhaustion is a bare 500 (minor)

`unusedOrderId()` is called outside the try/catch, so its "Could not mint"
error (or any SQLite error there) becomes Next's empty 500 (V4). There is no
row and no Stripe call, and the odds of it happening are negligible (10
straight collisions in a space of about 28.6 million ids). Recommend moving
the call inside a try that returns the same JSON 500 as the insert path
(Tier-3 is overkill; Tier-1/2 implementer).

### tipCents has no upper bound and loose typing (pre-existing, point (d))

- A negative tip cannot lower the total: -500, -0.4 and `1e400` all become 0,
  no Tip line is sent, and across every tip tried no row has a negative tip or
  a total below its subtotal (D1 to D3, D8).
- There is **no upper bound**: 1e20 is forwarded to Stripe as the string
  `100000000000000000000`. With a Stripe that accepts anything it was stored
  as a REAL `tip_cents` (D4). With Stripe rejecting it, which is what real
  Stripe does above its maximum amount, the result is 503 and no row (D5). So
  in practice Stripe is the only bound.
- 2^53+1 loses precision (D6), and loose coercion accepts `true` (1 cent),
  `[5]` and `" 7 "` (D7).
- No overflow can make the total negative.

Recommend accepting only a non-negative integer `number` with a sane cap, for
example no more than the subtotal or 100000 cents, and returning 400 above it
(Tier-2 implementer). Not introduced by this PR.

### Duplicate add-on ids are each charged (pre-existing)

`extras: ["bacon" x 200]` on the smash burger priced the line at $617.00
against $17.00 plain (D9). It can only raise the price the visitor pays
themselves, and the 32 KB cap bounds it now. Recommend de-duplicating
multi-select ids in `normalizeSelections` (Tier-1/2 implementer).

### Deployment note: the proxy already caps bodies (unverified live)

The harborbistro vhost sets no `client_max_body_size`, so nginx's 1 MB
default applies, along with its default request buffering and
`client_body_timeout`. In the deployed topology, oversized uploads should be
stopped at the proxy before they reach Next. This lowers the real-world
impact of B1. It was read from config only; the live proxy was not probed
(out of bounds for this run).

### Minor

- A lone UTF-16 surrogate in a name is stored as replacement characters
  (F-lone: 201, no 500). Fine for a demo.
- The address limit is enforced even for pickup orders. The form cannot send
  more than 300 characters, so this is only visible to API callers.
- An understated Content-Length is caught by HTTP framing (Node reads that
  many bytes, JSON fails, 400; B-under), not by the byte counter. The unit
  test's "understated Content-Length returns 413" only holds in-process.
- The fixed 503 message says "payment service" for a Stripe-side 400 too
  (C3), for example amount too large. That is accurate enough for a visitor;
  the log has the real code.

## 6. Coverage gaps (stated so this report is not overclaimed)

- **Layer 5 (headed Chrome) was not run** (browser possibly in use by other
  agents). Headless Chromium covered the UI flows.
- **Real Stripe never ran.** The success path, the 4xx/5xx paths and the hang
  were driven by a fake Stripe trusted through `NODE_EXTRA_CA_CERTS`, with
  real `stripe@22.2.1` SDK code in between. Real Stripe's error shapes, its
  amount limit, session expiry and the webhook were not exercised.
- The live proxy's body limits and timeouts were read from config, not
  tested.
- The recommended fix was tested only as a patched compiled matcher in a
  throwaway container (dv31-diag), not as source.
- axe (2 assertions) skipped, HSTS (7) edge-only, Chromium only, no
  adversarial generator.

## 7. Harness corrections (earlier runs)

Recorded so the clean totals above are auditable:

- **B-R3 is withdrawn.** The diagnostic container, where the cap provably
  acts mid-stream (DIAG-1, DIAG-2), gives the same result (DIAG-3): the
  client pushes 1 MB into local socket buffers before it reads the 413. So
  the check cannot tell a working cap from a broken one. The verdict rests on
  B-R1, B-R2 and B-R4, with B-R6 and B-R7 as mechanism evidence.
- Attack runs 1 to 3: a stale keep-alive socket (the server's
  `Keep-Alive: timeout=5`) crashed the harness. The client now retries once
  on `UND_ERR_SOCKET`, and each retry is logged as an INFO line. The C7b regex
  expected `invalid_request_error`, but the app logs the SDK class name
  (`StripeInvalidRequestError`), which still carries the Stripe code. U5 read
  the response body after the page had already navigated away. C7 and C9d
  counted log lines left by earlier runs in the same container. The R checks
  flagged Next's `aborted` log lines from uploads the harness abandoned on
  purpose; these are now counted as INFO.
- Regression run 1: stale keep-alive crash (same fix). P27 expected 3
  unscoped queries and PR #31 adds a fourth (reviewed above). Run 2: the
  retention check used `id LIKE 'HB-T%'`, and this image's seed happens to
  include the seed order `HB-THQQF` (visitor `seed`). Retention kept it, which
  is correct, but the check counted it. The query now lists the probe ids
  exactly.
- The final attack run and the final regression run each started on freshly
  created containers.

## 8. Cleanup

All `dv31-*` containers (including `dv31-diag`) and the
`demo-harborbistro:dv31` image were removed after the run. The temporary
npmrc was deleted right after the build. The temporary in-process test file
and the temporary swap of `route.ts` for the negative control were removed
from the worktree before this commit. This report is the only file committed.
