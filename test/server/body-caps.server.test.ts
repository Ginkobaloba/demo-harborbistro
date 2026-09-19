import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Real-server proof of the D-017 byte cap. The unit tests call the route
 * handlers directly, which cannot see what Next.js does in front of them
 * (the #31 deep verify found middleware buffering whole uploads). This suite
 * starts the BUILT standalone server, the same `server.js` the container
 * runs, and talks raw HTTP to it.
 *
 * Run (needs a fresh build of the current tree):
 *   npm run build
 *   npx vitest run --config vitest.server.config.ts
 */
const ROOT = path.resolve(__dirname, "..", "..");
const SERVER = path.join(ROOT, ".next", "standalone", "server.js");
const DB = path.join(os.tmpdir(), `harbor-server-test-${process.pid}.db`);
const RESERVATION_CAP = 8 * 1024;

let child: ChildProcess;
let port: number;
let serverLog = "";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port: p } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(p));
    });
  });
}

async function waitForServer(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await get("/api/reservations?date=2030-01-05");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`server did not come up in ${timeoutMs} ms. Log:\n${serverLog}`);
}

type Reply = { status: number; headers: http.IncomingHttpHeaders; body: string; ms: number };

function get(pathname: string, headers: Record<string, string> = {}): Promise<Reply> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pathname, method: "GET", headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body, ms: Date.now() - started }));
    });
    req.on("error", reject);
    req.end();
  });
}

function postJson(pathname: string, payload: unknown): Promise<Reply> {
  const data = JSON.stringify(payload);
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: pathname,
        method: "POST",
        headers: { "content-type": "application/json", "content-length": String(Buffer.byteLength(data)) },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body, ms: Date.now() - started }));
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}

/**
 * Start an upload that never finishes on its own and resolve with the first
 * response. `mode` "declared" sends a large Content-Length and then trickles;
 * "chunked" streams 16 KB chunks with no Content-Length at all. The upload is
 * torn down as soon as a response arrives (or after `giveUpMs`).
 */
function neverEndingUpload(
  pathname: string,
  mode: "declared" | "chunked",
  giveUpMs: number,
): Promise<{ status: number | null; ms: number; bytesSent: number }> {
  const started = Date.now();
  let bytesSent = 0;
  return new Promise((resolve) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (mode === "declared") headers["content-length"] = "1000000";
    const req = http.request({ host: "127.0.0.1", port, path: pathname, method: "POST", headers });
    const timers: { tick?: NodeJS.Timeout; giveUp?: NodeJS.Timeout } = {};
    const finish = (status: number | null) => {
      clearInterval(timers.tick);
      clearTimeout(timers.giveUp);
      req.destroy();
      resolve({ status, ms: Date.now() - started, bytesSent });
    };
    req.on("response", (res) => {
      res.resume();
      finish(res.statusCode ?? null);
    });
    req.on("error", () => finish(null));
    if (mode === "chunked") req.setHeader("transfer-encoding", "chunked");
    const chunk = Buffer.alloc(mode === "chunked" ? 16 * 1024 : 16, 0x78);
    req.write('{"name":"');
    timers.tick = setInterval(() => {
      if (mode === "declared" && bytesSent + chunk.length >= 1000000 - 16) return;
      req.write(chunk);
      bytesSent += chunk.length;
    }, 20);
    timers.giveUp = setTimeout(() => finish(null), giveUpMs);
  });
}

/**
 * Send `bytes` of a chunked body just past the cap, then STOP writing while
 * keeping the socket open (a stalled sender). Resolves with the first
 * response, or null status if none arrives within `giveUpMs`.
 */
function stalledChunkedUpload(
  pathname: string,
  bytes: number,
  giveUpMs: number,
): Promise<{ status: number | null; ms: number }> {
  const started = Date.now();
  return new Promise((resolve) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: pathname,
      method: "POST",
      headers: { "content-type": "application/json", "transfer-encoding": "chunked" },
    });
    const finish = (status: number | null) => {
      clearTimeout(giveUp);
      req.destroy();
      resolve({ status, ms: Date.now() - started });
    };
    const giveUp = setTimeout(() => finish(null), giveUpMs);
    req.on("response", (res) => {
      res.resume();
      finish(res.statusCode ?? null);
    });
    req.on("error", () => finish(null));
    req.write('{"name":"' + "x".repeat(bytes - 9));
    // No further writes and no req.end(): the upload stalls here.
  });
}

function reservationRows(): number {
  if (!fs.existsSync(DB)) return 0;
  const db = new Database(DB, { readonly: true, fileMustExist: true });
  try {
    return (db.prepare("SELECT COUNT(*) AS c FROM reservations WHERE visitor_id != 'seed' OR visitor_id IS NULL").get() as { c: number }).c;
  } finally {
    db.close();
  }
}

/** A Saturday one to two weeks out: open, with an 18:00 slot. */
function nextSaturday(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7 + ((6 - d.getDay() + 7) % 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

beforeAll(async () => {
  if (!fs.existsSync(SERVER)) {
    throw new Error(`No standalone build at ${SERVER}. Run \`npm run build\` first.`);
  }
  for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(`${DB}${suffix}`, { force: true });
  port = await freePort();
  child = spawn(process.execPath, [SERVER], {
    cwd: path.dirname(SERVER),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      HARBOR_DB_PATH: DB,
      HARBOR_RETENTION_DISABLED: "1",
      // Placeholder test-mode key: never used, no request reaches Stripe.
      STRIPE_SECRET_KEY: "sk_test_server_suite_placeholder",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
      // The signed visitor cookie needs a usable secret, or every public
      // write is 503 (D-018). Test-only value.
      SESSION_SECRET: "server-suite-secret-".padEnd(48, "x"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => (serverLog += String(d)));
  child.stderr?.on("data", (d) => (serverLog += String(d)));
  await waitForServer(30_000);
  // Warm the POST routes: the first request to a route compiles/loads its
  // module, which once pushed a cold case past the timing bound.
  for (const route of ["/api/reservations", "/api/checkout"]) {
    await postJson(route, {});
  }
}, 40_000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((r) => child.once("exit", r));
  }
  for (const suffix of ["", "-wal", "-shm", "-journal"]) fs.rmSync(`${DB}${suffix}`, { force: true });
});

describe("byte cap on the real standalone server", () => {
  it("answers 413 up front for a declared Content-Length over the cap, without waiting for the upload", async () => {
    const r = await neverEndingUpload("/api/reservations", "declared", 10_000);
    expect(r.status).toBe(413);
    expect(r.ms).toBeLessThan(2_000);
    expect(reservationRows()).toBe(0);
  });

  it("cuts off an endless chunked upload (no Content-Length) at the cap with 413", async () => {
    const r = await neverEndingUpload("/api/reservations", "chunked", 10_000);
    expect(r.status).toBe(413);
    expect(r.ms).toBeLessThan(2_000);
    // The server answered long before anything like the old 10 MB buffer.
    expect(r.bytesSent).toBeLessThan(1024 * 1024);
    expect(reservationRows()).toBe(0);
  });

  it("answers 413 fast to a sender that crosses the cap slightly and then stalls", async () => {
    const r = await stalledChunkedUpload("/api/reservations", 9 * 1024, 5_000);
    expect(r.status).toBe(413);
    expect(r.ms).toBeLessThan(1_000);
    expect(reservationRows()).toBe(0);
  });

  it("answers 413 fast on /api/checkout to a stalled sender just over its cap", async () => {
    const r = await stalledChunkedUpload("/api/checkout", 33 * 1024, 5_000);
    expect(r.status).toBe(413);
    expect(r.ms).toBeLessThan(1_000);
  });

  it("does the same on /api/checkout (declared and chunked), with no Stripe call", async () => {
    // A syntactically valid test key gets past the Stripe guard, so the cap
    // is what answers; the body never parses, so Stripe is never contacted.
    const declared = await neverEndingUpload("/api/checkout", "declared", 10_000);
    expect(declared.status).toBe(413);
    expect(declared.ms).toBeLessThan(2_000);
    const chunked = await neverEndingUpload("/api/checkout", "chunked", 10_000);
    expect(chunked.status).toBe(413);
    expect(chunked.ms).toBeLessThan(2_000);
  });

  it("still books a normal cookieless reservation, and the route sets hb_visitor itself", async () => {
    const r = await postJson("/api/reservations", {
      name: "Server Test",
      phone: "555-0100",
      partySize: 2,
      date: nextSaturday(),
      time: "18:00",
    });
    expect(r.status).toBe(201);
    expect(String(r.headers["set-cookie"] ?? "")).toMatch(/hb_visitor=[0-9a-f-]{36}\.[A-Za-z0-9_-]{43};/);
    expect(reservationRows()).toBe(1);
  });

  it("accepts a body of exactly the reservation cap and refuses one byte more", async () => {
    const base = { name: "Edge Case", phone: "555-0101", partySize: 2, date: nextSaturday(), time: "18:00", pad: "" };
    const padTo = RESERVATION_CAP - JSON.stringify(base).length;
    const over = await postJson("/api/reservations", { ...base, pad: "p".repeat(padTo + 1) });
    expect(over.status).toBe(413);
    const at = await postJson("/api/reservations", { ...base, pad: "p".repeat(padTo) });
    expect(at.status).toBe(201);
  });

  it("runs the visitor middleware on pages but not on /api/", async () => {
    const page = await get("/visit");
    expect(page.status).toBe(200);
    expect(String(page.headers["set-cookie"] ?? "")).toContain("hb_visitor=");
    const api = await get("/api/reservations?date=2030-01-05");
    expect(api.status).toBe(200);
    expect(api.headers["set-cookie"]).toBeUndefined();
  });
});
