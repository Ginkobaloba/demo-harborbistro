# Harbor /admin gate (D-022): the live evidence, recorded BEFORE the fix ships

Measured 2026-09-25 against the running `demo-harborbistro` container and the
public hostname. Recorded now because after the deploy this is unrecoverable.

## The before-state, both layers

| path | public (`harborbistro.projectnexuscode.org`) | container (`127.0.0.1:8104`) |
|---|---|---|
| `/` | 200 | 200 |
| `/admin` | **404** | **200** |
| `/admin/orders` | **404** | **200** |
| `/admin/reservations` | **404** | **200** |
| `/api/admin/orders/1` | **404** | (not probed; POST-only) |

**The app was never gated. nginx was the only control.** That is why the
"URGENT live exposure" framing was wrong AND why the fix is still needed: one
misplaced location block, one container exposed on another route, one person
running it locally, and the 404 disappears with nothing else changing.

## Why the obvious post-deploy check is worthless

Checking `https://harborbistro.projectnexuscode.org/admin` after the deploy
returns 404 **whether or not the gate shipped**, because nginx answers first.
It would be a green check that measures the containment, not the fix.

**The only falsifiable check is the container port**, which bypasses nginx:

    curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8104/admin

- before deploy: `200` (recorded above)
- after deploy, flag unset: must be `404`
- after deploy, with `HARBOR_ADMIN_ENABLED=1`: must be `200` again

That third line matters. A gate that 404s because the deploy is broken looks
identical to a gate that 404s because it works. Flipping the flag and seeing
200 return is what separates them.

## Order of operations (the nginx containment stays)

**The nginx /admin 404 is documented NOWHERE in `docs/decisions.md`.** It was
called D-017 in the brief; D-017 is actually checkout ordering and body caps.
So the control that is currently the ONLY thing hiding /admin has no decision
record. Give it one when the containment is removed.

The nginx 404 is NOT removed in the same change. Two controls, removed one at
a time, with the app gate proven at the container first. Removing both at once
means a single mistake is a live exposure with no second layer.

## The part the "URGENT exposure" framing hid: /admin was INTENDED to be open

README before this PR, verbatim:

> `/admin` is open so anyone can try the staff view, but each browser only
> sees the fictional seed records plus the orders and reservations it created
> itself.

So the staff view was a deliberate demo feature (D-016), made safe by
**visitor-scoping**, not by auth. Three layers currently disagree:

1. **Documented intent:** /admin open, anyone can try it.
2. **App:** serves it, ungated -- consistent with (1).
3. **nginx:** 404s it publicly -- contradicts (1). **Nobody can try the staff
   view today, and the README has been wrong about that for a while.**

PR #50 resolves the contradiction by choosing default-closed and rewriting the
README to match. That is the right engineering default. **But it is a product
choice, not purely a security fix**, and it should be named as one:

**Open question for Drew: should the deployed harbor demo set
`HARBOR_ADMIN_ENABLED=1` and put the staff view back?**

- Arguments for ON: the staff view is a sales asset; D-016 visitor-scoping is
  the real control and it works; the README promised it.
- Arguments for OFF: nothing links to /admin from the site, so no visitor
  finds it anyway; a demo surface that mutates state is a liability nobody is
  watching; off is recoverable with one env var.

**Deploying with the flag OFF changes no observable public behaviour**, since
nginx already answers 404. That makes the deploy itself risk-free and lets the
product question be answered later without blocking the fix.

## Operational rule learned here

`docker inspect --format '{{range .Config.Env}}...'` prints the container's
**live secrets** (SESSION_SECRET, Stripe keys). It is the same hazard as
`docker compose config` inlining `env_file`, which was already a standing
rule -- the rule named only the compose form. **Both forms print secrets.**
To check whether one variable is set without reading values:

    docker inspect <c> --format '{{range .Config.Env}}{{println .}}{{end}}' \
      | cut -d= -f1 | grep -x HARBOR_ADMIN_ENABLED

## Independent spot-check of the builder's mutation table

Two subagent reports were confidently wrong earlier this session, so the
"five genuine reds" claim was checked rather than relayed. The question that
decides it: does the gate test exercise the PAGES, or only the function?

`src/app/admin/admin-gate.test.tsx` imports `renderToStaticMarkup` and the
page modules, and asserts `rejects.toThrow(NOT_FOUND)`. So deleting
`if (!adminSurfacesEnabled()) notFound();` from a page really does turn that
test red. **The table is structurally credible.** Had the test only called
`adminSurfacesEnabled()`, a removed page gate would have passed it and only
the server test could have caught it.

It also does `delete process.env.HARBOR_ADMIN_ENABLED` at module scope and
stubs per case, and `vitest.config.ts` sets no global env -- so the gate
assertions are not silently satisfied by another test file's setup.

## Post-deploy verification (run all of it, not just the first line)

    # 1. the gate bites, bypassing nginx
    curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8104/admin   # want 404
    curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8104/        # want 200

    # 2. the deploy actually happened (a 404 from a dead container looks the same)
    docker inspect demo-harborbistro --format '{{.Image}}'
    docker exec demo-harborbistro cat .next/BUILD_ID

    # 3. the flag still opens it (proves 404 is the gate, not breakage)
    #    temporarily, then put it back

Step 2 exists because `[[setjti-is-not-a-deploy-signal]]`: a post-deploy check
that passes for the wrong reason is worse than no check. Resolve the image ID
and BUILD_ID, do not infer the deploy from the status code.
