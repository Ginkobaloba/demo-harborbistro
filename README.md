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

## Pages

`/` home, `/menu` (+ `/menu/[slug]`), `/order` cart + checkout,
`/order/confirmation/[id]`, `/order/status/[id]`, `/reserve`
(+ confirmation), `/about`, `/visit`, `/private-events`.

## Project docs

- Design decisions: `docs/decisions.md`
- Session handoffs: `docs/handoffs/`
