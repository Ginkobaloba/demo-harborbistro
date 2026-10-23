# 2026-10-01 12:05 CDT - move demo hostnames to paradigm.codes
- **Who:** Claude (subagent of the main session), for Drew, who authorized the move on 2026-10-01.
- **Change:** publicOrigin() accepts a comma-separated PUBLIC_BASE_URL and returns the listed origin matching the request host (first entry otherwise; an unlisted Host never becomes the origin), so Stripe returns a visitor to the host they left from; new origin.test.ts; SITE_URL, banner, README and verify/smoke.yml move to harborbistro.paradigm.codes.
- **Why:** projectnexuscode.org lapses around 2026-10-31. The demos move to <name>.paradigm.codes additively: both names serve, then the legacy names 301, then they are removed. Sequencing is in cloudflare-config docs/demos/MIGRATE_TO_PARADIGM_CODES_2026-10.md.
- **State after:** Not merged or deployed. At the next redeploy set PUBLIC_BASE_URL=https://harborbistro.paradigm.codes,https://harborbistro.projectnexuscode.org (before the legacy host is removed). vitest and next build pass.
- **Refs:** cloudflare-config docs/demos/MIGRATE_TO_PARADIGM_CODES_2026-10.md (runbook, step 3).
