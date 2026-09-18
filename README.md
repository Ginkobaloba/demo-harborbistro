# Harbor Bistro

Demo restaurant site + online ordering for **Harbor Bistro**, a fictional
upscale-casual coastal-American restaurant in a Great Lakes city. Built as
a portfolio demonstration by Paradigm Coding Solutions; Harbor Bistro is
positioned as a client, so it carries its own brand identity.

Live at https://harborbistro.projectnexuscode.org (all orders and
reservations are demo-only and not real).

## Stack

- Next.js 14 (App Router), TypeScript, Tailwind CSS
- SQLite via better-sqlite3, baked into the image at build time
- Stripe Test Mode for checkout (test card 4242 4242 4242 4242)
- Single standalone-output container, deployed behind the shared
  Cloudflare tunnel (port 8104, see `C:\dev\DEMOS_RUNNING_HANDOFF.md`)

## Develop

```bash
npm install
npm run db:seed   # create + seed the local SQLite database
npm run dev
```

## Environment

Copy `.env.example` for local work. Runtime-only (never needed by `next build`):

| Variable | Required | Purpose |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | for checkout | Stripe **test** key (`sk_test_...`). Checkout returns 503 without it. |
| `STRIPE_WEBHOOK_SECRET` | for the webhook | Signing secret (`whsec_...`) for `/api/webhooks/stripe`. Without it the webhook **fails closed** (503, no event is processed). |
| `PUBLIC_BASE_URL` | optional | Override for the public origin used in Stripe success/cancel URLs. |
| `SESSION_SECRET`, `PORTAL_*` | for portal sign-in | See `.env.example`. |

### Stripe webhook

The webhook only acts on events whose `Stripe-Signature` verifies against
`STRIPE_WEBHOOK_SECRET`; unsigned or forged requests are rejected (400), and
with no secret configured every request gets 503. Handling is idempotent
(transitions only apply to `pending` orders), so Stripe retries and replays
are harmless. Orders also reconcile on the confirmation page via
`checkout.sessions.retrieve`, so the site works while the webhook is off.

To enable it for the deployed demo (Stripe **test mode**):

1. Stripe Dashboard (test mode) > Developers > Webhooks > Add endpoint:
   `https://harborbistro.projectnexuscode.org/api/webhooks/stripe`
2. Select events `checkout.session.completed` and `checkout.session.expired`.
3. Reveal the endpoint's signing secret and put it in the deploy env file as
   `STRIPE_WEBHOOK_SECRET=whsec_...`, then redeploy the container.

Locally: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
prints a `whsec_` to use as `STRIPE_WEBHOOK_SECRET`.

## Pages

`/` home, `/menu` (+ `/menu/[slug]`), `/order` cart + checkout,
`/order/confirmation/[id]`, `/reservations`
(+ `/reservations/[id]` confirmation), `/about`, `/visit`, `/private-events`.

## Project docs

- Design decisions: `docs/decisions.md`
- Session handoffs: `docs/handoffs/`

## Verification

This repo carries a `verify/` suite (see `verify/README.md` for full details).

**Quick smoke** -- run on every PR via CI, checks HTTP status, key copy, and
security headers against the live deploy at
`https://harborbistro.projectnexuscode.org`:

```
/verify verify/smoke.yml
```

**Deep verify** -- required before merging any PR that touches a tier-3 surface
(reservations or order/checkout). Runs richer assertions including DOM selectors,
accessibility, and LCP; layers 5-6 run locally with a headed browser:

```
/verify deep verify/assertions/reservations.yml
/verify deep verify/assertions/home.yml
```

**CI behavior** -- GitHub Actions runs quick smoke on every PR
(`.github/workflows/verify.yml`). PRs labelled `tier-3` additionally require
`deep-verify` to pass (a committed report under `verify/reports/` recording
`Overall: PASS`). Add `deep-verify` as a required status check in branch
protection to enforce the gate.
