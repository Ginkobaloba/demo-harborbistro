# Deep Verify: PR #37 require exp, iat, and sub on the customer session token (2026-09-19)

Overall: PASS
Tested-SHA: ca44c7c81b0ba727aa2fb61ad24311b9412d4710

Independent deep verify of `Ginkobaloba/demo-harborbistro` PR #37 (branch
`fix/customer-session-claims`, label `tier-3`). The verifier did not write the
PR and attacked it rather than reading it.

Everything below was run against the FETCHED ref. `git fetch origin --prune`
ran first, the worktree `C:\dev\demo-harborbistro-wt-csc` was confirmed at
`ca44c7c8` with an empty `git status --porcelain`, and `origin/fix/customer-session-claims`
resolves to the same `ca44c7c8`. No local-only state fed any finding.

**Result: PASS.** Every claim in the PR reproduced under independent
re-signing, both reported mutation numbers reproduced exactly, and the
caller-enumeration caveat was confirmed both statically and at runtime.

## Target and scope

| Item | Value |
|---|---|
| Repo | Ginkobaloba/demo-harborbistro |
| PR | #37, `fix/customer-session-claims` |
| Head tested | `ca44c7c81b0ba727aa2fb61ad24311b9412d4710` |
| Base | `origin/main` = `bdf154594e4bb60481cb2f236f674046f7e8f76d` |
| Tier | 3 (`tier-3` label present; `verify/tier_map.yml` present) |
| Mode | DEEP REQUESTED, LAYER 5 UNAVAILABLE |

Layers 1, 2, 3, 4 and 6 ran. **Layer 5 (headed real-Chrome run) did not
run**: the dispatch prohibits headed Chrome. Per the skill's stop gate this
is stated rather than silently downgraded. Layer 5 would have added nothing
here in any case, because the changed function has no browser-reachable
surface (see Caller enumeration).

### A note on tier_map coverage

`verify/tier_map.yml` exists, so the Tier-3 gate is well formed. It lists
`reservations`, `order-checkout`, `home`, `menu`, `about`, `visit` and
`private-events`. The surface this PR changes, the `hb_session` customer
session, **is not an enumerated surface in that file**. The PR is labeled
tier-3 by hand and the label is defensible (auth code), but the tier map
does not itself classify this surface. Recorded as a warning, not a blocker.

## Pass/fail per category

| Category | Verdict | Evidence |
|---|---|---|
| smoke | PASS | Built standalone server started on 127.0.0.1:18971, `GET /` returned 200, stderr log empty |
| navigation | PASS | `/reservations`, `/admin/reservations`, `/admin/orders`, `/order/confirmation/[id]` all served during the 25-check scope run |
| auth_lifecycle | PASS | 17 of 17 in `src/lib/portal-session.test.ts`, plus 35 of 35 independent probes (below) |
| data_crud | PASS | Reservation create returned 201 and read back scoped to its own visitor; order advance returned 200 for the owner |
| visual_regression | SKIPPED | No rendering change in the diff; only `src/lib/portal-session.ts`, its test and `docs/decisions.md` changed |
| performance | SKIPPED | No performance-relevant change; the diff adds two jose options and one integer comparison |
| accessibility | SKIPPED | No markup change in the diff |
| security_headers | SKIPPED | No header or middleware change in the diff; `src/middleware.ts` is untouched |
| mobile_responsive | SKIPPED | No markup or CSS change in the diff |
| error_handling | PASS | Every malformed token returns `null` rather than throwing; 18 raw and structural edge shapes all refused with no uncaught exception |
| cross_browser | SKIPPED | No client-side code in the diff |
| edge_cases | PASS | 35 of 35 independent probes; see below |

### Layer 1 detail

| Check | Result |
|---|---|
| `npx vitest run` | 19 files, **195 of 195 passed** |
| `npx vitest run src/lib/portal-session.test.ts` | **17 of 17 passed** |
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | exit 0, 4 warnings, **0 errors**. All 4 pre-exist in files this PR does not touch (`ParadigmBanner.tsx` and siblings, `react-hooks/set-state-in-effect`) |
| `npx next build` | exit 0 |
| `npx vitest run --config vitest.server.config.ts` | 2 files, **18 of 18 passed** (real built server) |

## Caller enumeration: CONFIRMED, independently

The builder states the fixed function has zero production callers today. I
enumerated callers myself from the fetched refs rather than trusting that,
using `git grep` against `ca44c7c8` and against `origin/main`, not a working
tree.

Every import of the module across the whole branch tree:

```
ca44c7c8:src/app/api/auth/portal-handoff/handler.ts:11:} from "@/lib/portal-session";
ca44c7c8:src/app/api/auth/portal-handoff/route.test.ts:10:import { verifyHarborSession, harborSessionCookieName } from "@/lib/portal-session";
```

Only two importers exist in `src/`, and one of them is a test.

- `handler.ts` imports **only** `mintHarborSession` and
  `harborSessionCookieAttributes`. It is the mint side. It never calls
  `verifyHarborSession` or `readHarborSession`.
- `route.test.ts` imports `verifyHarborSession`, but it is a test file.
- `readHarborSession` has **zero callers anywhere in the repo**, tests
  included. It is referenced only by its own definition and by prose in
  `docs/decisions.md`.
- `src/middleware.ts` does not touch `hb_session` at all. It handles the
  `hb_visitor` signed cookie and nothing else. Confirmed by reading the file
  from `ca44c7c8`, not from disk.

**Verdict: the builder's caveat is CONFIRMED, not refuted.** There is no live
production caller in either direction.

Runtime corroboration, so this does not rest on grep alone. Against the built
server on 127.0.0.1:18971:

```
no cookie            -> 200, bytes=65376
forged hb_session    -> 200, bytes=65376
empty hb_session     -> 200, bytes=65376
```

A forged `hb_session` value that is not even a JWT produces a byte-identical
response. Nothing reads it.

**What that means for risk, stated plainly:** this fix is correct and it is
also inert today. It hardens a function that nothing in production calls, so
it cannot regress a live surface, and it also does not currently protect one.
Its value is that the next caller of `verifyHarborSession` or
`readHarborSession` inherits a verifier that is already correct. That is a
good reason to merge it and a bad reason to believe a live hole was just
closed. The report says PASS on the code, not on a security improvement to
the running demo.

The related claim that requiring `jti`, `iss` or `aud` would reject every real
session is also CONFIRMED by reading `mintHarborSession` at `ca44c7c8`: it
calls `setSubject`, `setIssuedAt` and `setExpirationTime` only. There is no
`setJti`, `setIssuer` or `setAudience`.

## Attack 1: the 12 claimed cases, re-signed by the verifier

I did not run the PR's test file for this and call it proof. I wrote my own
probe suite with my own `handSign` helper, my own payload shapes and my own
expectations, then ran it against the unmodified branch code. Probe file
`src/lib/zz-verify-probe.test.ts`, deleted after the run.

| # | Shape | Expected | Observed |
|---|---|---|---|
| 01 | missing `exp` | refuse | REJECTED |
| 02 | missing `iat` | refuse | REJECTED |
| 03 | missing `sub` | refuse | REJECTED |
| 04 | `exp` a century out | refuse | REJECTED |
| 05 | `iat` in the future | refuse | REJECTED |
| 06 | `iat` after `exp` | refuse | REJECTED |
| 07 | fractional `exp` | refuse | REJECTED |
| 08 | fractional `iat` | refuse | REJECTED |
| 09 | lifetime over TTL | refuse | REJECTED |
| 10 | positive control, all claims correct | accept | ACCEPTED, `sub=a@b.com` |
| 11 | boundary `exp - iat == TTL` | accept | ACCEPTED |
| 12 | boundary `exp - iat == TTL + 1` | refuse | REJECTED |

All 12 reproduce. **Total for the probe suite: 35 of 35 passed.**

## Attack 2: the shapes the builder says are UNTESTED

The builder listed these as not covered. None of them is a hole. Each row is
my own probe, with the exact value the verifier saw.

| Shape | How it was produced | Observed |
|---|---|---|
| `exp: NaN` | JS value through `SignJWT`; `JSON.stringify` emits `null` | REJECTED |
| `iat: NaN` | same | REJECTED |
| literal `NaN` token | raw bytes via `CompactSign`, `"exp":NaN` (invalid JSON) | REJECTED |
| `exp: Infinity` | JS value, serializes to `null` | REJECTED |
| `iat: -Infinity` | JS value, serializes to `null` | REJECTED |
| literal `Infinity` | raw bytes, `"exp":Infinity` | REJECTED |
| `exp` past MAX_SAFE_INTEGER | `exp: 9007199254740994` | REJECTED |
| `iat` past MAX_SAFE_INTEGER with `exp - iat == TTL` | `iat: 9007199254740994` | REJECTED |
| string-typed `exp` | raw bytes, `"exp":"1789858518"` | REJECTED |
| string-typed `iat` | raw bytes, `"iat":"1789857918"` | REJECTED |
| exponent notation, huge | raw bytes, `"exp":1e21` | REJECTED |
| exponent notation, fractional in range | raw bytes, `"exp":17898585.185e2` parsing to `1789858518.5` | REJECTED |
| negative `iat`, `exp - iat == TTL` | `iat: -1000` | REJECTED |
| negative `iat`, `exp` in the future | `iat: -1000` | REJECTED |
| empty-string `sub` | `sub: ""` | REJECTED |
| numeric `sub` | raw bytes, `"sub":123` | REJECTED |
| explicit `null` `exp` | raw bytes, `"exp":null` | REJECTED |
| negative zero `exp` | raw bytes, `"exp":-0` | REJECTED |

A discrimination control was added so the exponent-notation row means
something. The same notation carrying an integer, in-range value must be
accepted, otherwise "REJECTED" would only prove the parser dislikes the
notation:

```
PROBE_RAW_JSON_FRAC={"sub":"a@b.com","iat":1789857918,"exp":17898585.185e2,...} parses_to=1789858518.5
PROBE_EDGE exp-exponent-fractional = REJECTED
PROBE_RAW_JSON_OK={"sub":"a@b.com","iat":1789857918,"exp":17898585.18e2,...} parses_to=1789858518
PROBE_EDGE exp-exponent-integer-inrange = ACCEPTED sub=a@b.com
```

The rejection came from fractionality, not from the notation. That is the
behavior the code claims.

Note on the mechanism, because it matters for the next reader: `NaN` and
`Infinity` never reach the integer check as such. `JSON.stringify` turns
them into `null`, `requiredClaims` is satisfied because the key is present,
and the rejection comes from the `typeof exp !== "number"` guard. The raw
`"exp":NaN` variant dies earlier still, in jose's `JSON.parse`. Three
different mechanisms, one outcome.

## Attack 3: both mutation results, reproduced

Run by editing `src/lib/portal-session.ts` in the worktree, running the PR's
own test file, and restoring the file from the original bytes. `git status
--porcelain` was empty afterwards and is empty now.

| Mutation | Builder reported | I measured | Match |
|---|---|---|---|
| delete `requiredClaims` line | 0 of 17 red | **0 of 17 red** | CONFIRMED |
| delete the `exp - iat` block | 5 of 17 red | **5 of 17 red** | CONFIRMED |

The exp-iat mutation turned red exactly these five, which is the set the
decisions entry names:

```
x exp far in the future (100 years, iat now)
x fractional exp
x fractional iat (in the past, isolated from the future-iat rejection)
x lifetime over the TTL (iat now, exp one hour past the 12h TTL)
x boundary: exp - iat one second over the TTL is refused
```

`iat in the future` and `iat after exp` stayed green under that mutation,
which is correct: jose's own `exp` and `maxTokenAge` checks catch them, not
the explicit block. The builder's accounting is right.

I also ran the mutation the builder did not report, because 0 of 17 for
`requiredClaims` invites the question of what each layer actually buys:

| Extra mutation | Result |
|---|---|
| delete `maxTokenAge` | **1 of 17 red**, exactly `iat in the future` |

Against my own 35-case probe the same mutation turned 2 red: `iat in the
future` and `iat past MAX_SAFE_INTEGER with exp - iat == TTL`, which is the
same defect wearing a bigger number. So `maxTokenAge` is load-bearing and
buys exactly one thing: it stops a token minted with a future `iat` from
living TTL seconds past that future point.

`requiredClaims` at 0 of 17 is the honest, unflattering number and it is
correct. Deleting it turned nothing red in the PR suite and nothing red in
my 35 probes either. In this codebase it is genuinely redundant with the
`typeof` and `Number.isInteger` guards. The decisions entry says exactly
this rather than overselling it, which is to the builder's credit.

## Attack 4: the TTL constant is load-bearing, proven by moving it

Not a grep. `SESSION_TTL_SECONDS` was changed from `12 * 60 * 60` to `60` in
the worktree, and probes with **hardcoded** lifetimes (not derived from the
imported constant, which would track the change and prove nothing) were run
before and after.

| Probe | Stock TTL (43200) | TTL mutated to 60 |
|---|---|---|
| `PROBE_TTL` | 43200 | 60 |
| hardcoded lifetime 43200 | ACCEPTED | **REJECTED** |
| hardcoded lifetime 43201 | REJECTED | REJECTED |
| hardcoded lifetime 60 | ACCEPTED | ACCEPTED |
| hardcoded lifetime 61 | ACCEPTED | **REJECTED** |

The enforced bound moved with the constant. The constant is genuinely
load-bearing. File restored; `git status --porcelain` empty.

## Attack 5: regression

| PR | Surface | Evidence | Verdict |
|---|---|---|---|
| #28 | visitor-scoped admin | `npx tsx scripts/verify-visitor-scope.ts` against the built server on 127.0.0.1:18971, **25 passed, 0 failed**, exit 0 | PASS |
| #31 | request byte caps | `test/server/body-caps.server.test.ts` via `vitest.server.config.ts` against the real built server | PASS |
| #36 | signed visitor cookie | `test/server/visitor-cookie.server.test.ts`, same run; 2 files, **18 of 18** | PASS |

The #28 run is the strong one: it is the repo's own two-cookie-jar check and
it exercised cross-visitor isolation on reservations, admin reservations,
admin orders, the orders API and the confirmation page, including the
negative cases (`B: A's /reservations/[id] is 404`, `B: admin POST on A's
reservation is 404`).

## Attack 6: diff review

`git diff --name-status origin/main...ca44c7c8`:

```
M	docs/decisions.md
M	src/lib/portal-session.test.ts
M	src/lib/portal-session.ts
```

Three files, exactly the stated set. No config, no CI, no route, no
middleware, no lockfile. Two commits, both conventionally named.

Dash sweep over the full diff, counted by code point rather than by eye:
**em-dash count 0, en-dash count 0.**

The `docs/decisions.md` addition (D-019) was read line by line against the
code. Every factual claim in it is accurate, including the 0/17 and 5/17
mutation numbers, the reason `jti`/`iss`/`aud` are excluded, and the claim
that the exported constant keeps test and runtime TTLs from drifting. It
does not overclaim.

## Theater Check

| Agent claimed | Verification found | Verdict |
|---|---|---|
| Verifier passes `requiredClaims: ["sub","iat","exp"]` | Present at `src/lib/portal-session.ts:94`, read from the fetched ref | CONFIRMED |
| `maxTokenAge` comes from the repo's own exported TTL constant | `maxTokenAge: SESSION_TTL_SECONDS`, and the constant is now exported at line 18 | CONFIRMED |
| Harbor TTL is 12h | `PROBE_TTL=43200` = 12 * 60 * 60 | CONFIRMED |
| Explicit post-verify check that `exp - iat` is a positive integer no greater than TTL | Lines 100 to 110; behavior proven by the boundary probes and by moving the constant | CONFIRMED |
| Requiring `jti`/`iss`/`aud` would reject every real session | `mintHarborSession` sets subject, issued-at and expiry only; no `setJti`/`setIssuer`/`setAudience` | CONFIRMED |
| 12 hand-signed test cases | 12 cases present, all 12 reproduced under independent re-signing | CONFIRMED (see warning on duplication) |
| Deleting `requiredClaims` turns 0 of 17 red | Measured 0 of 17, and 0 of my 35 | CONFIRMED |
| Deleting the `exp - iat` block turns 5 of 17 red | Measured 5 of 17, and the exact five named | CONFIRMED |
| `verifyHarborSession` and `readHarborSession` have no production callers | Enumerated from fetched refs: two importers in `src/`, one a test, and the non-test one imports only the mint helpers. `readHarborSession` has zero callers anywhere. Corroborated at runtime by a byte-identical response to a forged cookie | CONFIRMED |
| The named shapes are untested | True as stated, and all 18 of them are nevertheless refused. Untested is not the same as unhandled | CONFIRMED, and the gap is cosmetic |

No theater found. Every claim the builder made was reproducible, including
the two that make the change look less impressive than it could have been
made to sound.

## Blockers

None.

## Warnings

1. **The fix is inert today.** Zero production callers, confirmed statically
   and at runtime. Merging this closes no live hole in the running demo. It
   makes the verifier correct for whoever calls it next. Do not record this
   as a production security fix.

2. **Two of the twelve cases are the same token.** "positive control:
   hand-signed with every claim correct is accepted" and "boundary: exp - iat
   exactly equal to the TTL is accepted" build an identical payload
   (`iat: now, exp: now + TTL`) and assert the same outcome. The suite has 12
   cases but **11 distinct shapes**. Harmless, but the count is slightly
   generous.

3. **`requiredClaims` is decorative in this file.** 0 of 17 and 0 of 35 under
   deletion. It is defensible as defense in depth and the decisions entry is
   honest about it, but anyone reading the diff should know the `typeof` and
   `Number.isInteger` guards are what actually enforce presence.

4. **Two branches in the guard are unreachable in practice.** Given jose
   rejects `exp <= now` and, with `maxTokenAge` set, rejects `iat > now`, the
   `exp - iat <= 0` branch cannot be reached by a token that survives jose.
   Defense in depth, not a defect, but it is not carrying weight.

5. **The changed surface is not in `verify/tier_map.yml`.** The tier-3 label
   is applied by hand and is reasonable, but the tier map does not enumerate
   the `hb_session` surface, so the gate is protecting something the map does
   not describe. Worth adding a surface entry.

6. **CI is red on this PR and will stay red until this report reaches the PR
   branch.** `Deep Verify (tier-3 PRs only)` fails with `missing report for
   pr37`. `verify/ci/deep_gate.sh` reads reports from **the PR head's tree**.
   This report is committed to a separate branch as instructed, so the gate
   does not see it yet. Merging `verify/pr37-customer-session-claims` into
   `fix/customer-session-claims` will satisfy it: the Tested-SHA is the PR
   head, and the only file added is under `verify/reports/`, which the gate
   explicitly allows.

## Evidence and cleanup

Commands ran from Windows PowerShell. No file under `C:\Users\Drama\.secrets`
and no `.env*` was opened. The npm credentials file was passed to
`docker build` by path only, never read. Throwaway secrets only
(`SESSION_SECRET` was a 48-character local throwaway). No live container,
public URL, demo-proxy or cloudflare-config was touched. No headed Chrome.

Cleaned up: the probe file `src/lib/zz-verify-probe.test.ts` was deleted, the
temporary scope database was removed, and the server on 127.0.0.1:18971 was
stopped (listener confirmed gone). All mutations were reverted from the
original bytes. `git status --porcelain` in the worktree is **empty**, and
HEAD is still `ca44c7c81b0ba727aa2fb61ad24311b9412d4710`.

No code was edited on the PR branch and nothing was merged.
