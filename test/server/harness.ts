import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

/**
 * Starts the BUILT standalone server (the same `server.js` the container
 * runs) for the real-server suites. Needs a fresh `npm run build`.
 */
export const ROOT = path.resolve(__dirname, "..", "..");
export const SERVER = path.join(ROOT, ".next", "standalone", "server.js");

export type Reply = { status: number; headers: http.IncomingHttpHeaders; body: string };

export interface RunningServer {
  port: number;
  log: () => string;
  stop: () => Promise<void>;
  request: (
    method: string,
    pathname: string,
    opts?: { cookie?: string; json?: unknown },
  ) => Promise<Reply>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

function send(
  port: number,
  method: string,
  pathname: string,
  opts: { cookie?: string; json?: unknown } = {},
): Promise<Reply> {
  const data = opts.json === undefined ? undefined : JSON.stringify(opts.json);
  const headers: Record<string, string> = {};
  if (opts.cookie) headers.cookie = opts.cookie;
  if (data !== undefined) {
    headers["content-type"] = "application/json";
    headers["content-length"] = String(Buffer.byteLength(data));
  }
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: pathname, method, headers }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end(data);
  });
}

/**
 * Start the standalone server with `env` layered over the test process's
 * environment. Keys listed in `unset` are removed AFTER the merge, so a value
 * inherited from the developer's shell can never leak in.
 */
export async function startServer(
  env: Record<string, string>,
  unset: string[] = [],
): Promise<RunningServer> {
  if (!fs.existsSync(SERVER)) {
    throw new Error(`No standalone build at ${SERVER}. Run \`npm run build\` first.`);
  }
  const port = await freePort();
  const merged: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    NEXT_TELEMETRY_DISABLED: "1",
    ...env,
  };
  for (const key of unset) delete merged[key];

  let log = "";
  const child: ChildProcess = spawn(process.execPath, [SERVER], {
    cwd: path.dirname(SERVER),
    env: merged,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => (log += String(d)));
  child.stderr?.on("data", (d) => (log += String(d)));

  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      await send(port, "GET", "/api/reservations?date=2030-01-05");
      break;
    } catch {
      if (Date.now() > deadline) {
        child.kill();
        throw new Error(`server did not come up. Log:\n${log}`);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return {
    port,
    log: () => log,
    request: (method, pathname, opts) => send(port, method, pathname, opts),
    stop: async () => {
      if (child.exitCode === null) {
        child.kill();
        await new Promise((r) => child.once("exit", r));
      }
    },
  };
}
