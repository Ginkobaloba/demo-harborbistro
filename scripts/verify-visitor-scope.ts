/**
 * Two-browser check of the per-visitor demo scope (docs/decisions.md D-016)
 * against a running server. Each "browser" is its own cookie jar, the same
 * isolation two Playwright browser contexts give.
 *
 *   npm run build
 *   SESSION_SECRET=<32+ random chars> HARBOR_DB_PATH=<copy of a seeded db> npx next start -p 3107
 *   BASE_URL=http://localhost:3107 HARBOR_DB_PATH=<same path> npm run verify:visitor-scope
 *
 * Local servers only: it books a reservation and (when HARBOR_DB_PATH is set)
 * inserts test orders directly into that database, so it refuses any
 * non-localhost BASE_URL. Exits nonzero on any failure.
 */
import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3107";
const host = new URL(BASE).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  console.error(`Refusing to run against ${BASE}: this check writes data and is for local servers only.`);
  process.exit(2);
}

const NOTICE = "This is a demo. Please don&#x27;t enter real personal details.";
const failures: string[] = [];
let passed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ""}`);
  }
}

/** A browser: a cookie jar plus fetch. */
class Browser {
  cookies = new Map<string, string>();
  constructor(readonly name: string) {}

  /** The bare visitor id: the cookie is <id>.<tag> (D-018), the database keeps the id. */
  get visitorId(): string | undefined {
    return this.cookies.get("hb_visitor")?.split(".")[0];
  }

  async fetch(path: string, init: RequestInit = {}): Promise<{ status: number; body: string }> {
    const headers = new Headers(init.headers);
    if (this.cookies.size) {
      headers.set("cookie", [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "));
    }
    const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(";");
      const eq = pair.indexOf("=");
      this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return { status: res.status, body: await res.text() };
  }

  post(path: string, body: unknown) {
    return this.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
}

function nextOpenTuesday(): string {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  while (d.getDay() !== 2) d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  const a = new Browser("A");
  const b = new Browser("B");
  const anon = new Browser("no-cookie");
  const tag = randomBytes(3).toString("hex");

  console.log(`Visitor scope check against ${BASE}`);

  // --- cookie assignment + notice ----------------------------------------
  const resPage = await a.fetch("/reservations");
  check("A: /reservations is 200", resPage.status === 200);
  check("A: reservations form shows the demo notice", resPage.body.includes(NOTICE));
  await b.fetch("/");
  check("A and B each got a visitor cookie", Boolean(a.visitorId && b.visitorId));
  check("A and B have different visitor ids", a.visitorId !== b.visitorId);

  // --- A books a table ---------------------------------------------------
  const date = nextOpenTuesday();
  const slots = JSON.parse((await a.fetch(`/api/reservations?date=${date}`)).body) as { slots: string[] };
  const aName = `Scope Check A ${tag}`;
  const booked = await a.post("/api/reservations", {
    name: aName,
    phone: "555-0199",
    partySize: 2,
    date,
    time: slots.slots[0],
  });
  check("A: reservation created (201)", booked.status === 201, `got ${booked.status}`);
  const resId = (JSON.parse(booked.body) as { id: string }).id;

  // --- public detail route -----------------------------------------------
  const aDetail = await a.fetch(`/reservations/${resId}`);
  check("A: own /reservations/[id] is 200 with A's name", aDetail.status === 200 && aDetail.body.includes(aName));
  const bDetail = await b.fetch(`/reservations/${resId}`);
  check("B: A's /reservations/[id] is 404", bDetail.status === 404, `got ${bDetail.status}`);
  check("B: A's name is not in B's response", !bDetail.body.includes(aName));
  const anonDetail = await anon.fetch(`/reservations/${resId}`);
  check("no-cookie client: A's /reservations/[id] is 404", anonDetail.status === 404, `got ${anonDetail.status}`);
  check("no-cookie client: A's name not in response", !anonDetail.body.includes(aName));

  // --- admin views -------------------------------------------------------
  const aAdmin = await a.fetch("/admin/reservations");
  check("A: /admin/reservations is 200 and lists A's booking", aAdmin.status === 200 && aAdmin.body.includes(resId));
  const bAdmin = await b.fetch("/admin/reservations");
  check("B: /admin/reservations is 200 (staff view still open)", bAdmin.status === 200);
  check("B: /admin/reservations never contains A's booking", !bAdmin.body.includes(resId) && !bAdmin.body.includes(aName));
  check("B: /admin/reservations still shows seed bookings", /HR-[2-9A-Z]{5}/.test(bAdmin.body));

  // --- admin API ---------------------------------------------------------
  const bPost = await b.post(`/api/admin/reservations/${resId}`, { status: "cancelled" });
  check("B: admin POST on A's reservation is 404", bPost.status === 404, `got ${bPost.status}`);
  const aPost = await a.post(`/api/admin/reservations/${resId}`, { status: "seated" });
  check("A: admin POST on own reservation is 200 (was not cancelled by B)", aPost.status === 200 && aPost.body.includes("seated"));

  // --- orders (checkout needs Stripe, so insert A's order directly) -------
  const dbPath = process.env.HARBOR_DB_PATH;
  if (!dbPath) {
    console.log("  skip  order checks (set HARBOR_DB_PATH to the server's database to run them)");
  } else {
    const db = new Database(dbPath);
    const orderId = `HB-T${tag.slice(0, 4).toUpperCase()}`;
    const legacyId = `HB-L${tag.slice(0, 4).toUpperCase()}`;
    const insert = db.prepare(
      `INSERT INTO orders (id, customer_name, customer_phone, fulfillment, items,
         subtotal_cents, tip_cents, total_cents, status, visitor_id)
       VALUES (?, ?, '555-0198', 'pickup', '[]', 1000, 0, 1000, 'received', ?)`,
    );
    insert.run(orderId, `Order Check A ${tag}`, a.visitorId);
    insert.run(legacyId, `Legacy Check ${tag}`, null);
    db.close();

    const aOrders = await a.fetch("/admin/orders");
    check("A: /admin/orders lists A's order", aOrders.body.includes(orderId));
    const bOrders = await b.fetch("/admin/orders");
    check("B: /admin/orders never contains A's order", !bOrders.body.includes(orderId) && !bOrders.body.includes(`Order Check A ${tag}`));
    check("A and B: legacy untagged order is never shown", !aOrders.body.includes(legacyId) && !bOrders.body.includes(legacyId));

    check("A: GET /api/orders/[id] is 200", (await a.fetch(`/api/orders/${orderId}`)).status === 200);
    check("B: GET /api/orders/[id] for A's order is 404", (await b.fetch(`/api/orders/${orderId}`)).status === 404);
    check("A: /order/confirmation/[id] is 200", (await a.fetch(`/order/confirmation/${orderId}`)).status === 200);
    const bConf = await b.fetch(`/order/confirmation/${orderId}`);
    check("B: /order/confirmation/[id] for A's order is 404", bConf.status === 404, `got ${bConf.status}`);

    const bAdv = await b.post(`/api/admin/orders/${orderId}`, { action: "advance" });
    check("B: admin POST advance on A's order is 404", bAdv.status === 404, `got ${bAdv.status}`);
    const aAdv = await a.post(`/api/admin/orders/${orderId}`, { action: "advance" });
    check("A: admin POST advance on own order is 200 -> preparing", aAdv.status === 200 && aAdv.body.includes("preparing"));
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
