#!/usr/bin/env node
// Records the build's git identity into .next/BUILD_STAMP.json so the
// real-server test suite (test/server/*.server.test.ts) can refuse to run
// against a stale build (D-019, docs/decisions.md). "Stale" means the
// standalone server.js the suite would start was built from a different
// commit than the one currently checked out, or from a dirty tree -- either
// way, the suite would be testing something other than the code in front of
// it, and would report green (or red) for the wrong reason.
//
// Runs automatically:
//   prebuild  -> node scripts/build-stamp.mjs clean   (removes any old stamp
//                first, so a `next build` that fails partway through can
//                never leave a stamp claiming a fresher build than actually
//                happened)
//   postbuild -> node scripts/build-stamp.mjs write    (writes the stamp
//                after a build completes)
//
// Manual: node scripts/build-stamp.mjs write | clean

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const STAMP_PATH = join(ROOT, ".next", "BUILD_STAMP.json");

function git(args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

/**
 * Writes the stamp. If git is unavailable (for example inside the Docker
 * build stage, where .dockerignore excludes .git on purpose) the stamp
 * still gets written, with sha/dirty as null and a reason recorded, instead
 * of failing the build. A null sha is refused later by the freshness check
 * (test/server/fresh-build.ts), which is the correct failure mode: unknown
 * provenance is never treated as fresh.
 */
export function write() {
  let sha = null;
  let dirty = null;
  let reason;
  try {
    sha = git(["rev-parse", "HEAD"]);
    dirty = git(["status", "--porcelain"]).length > 0;
  } catch (err) {
    reason = `git unavailable at build time: ${String(err.message).split("\n")[0]}`;
  }
  mkdirSync(dirname(STAMP_PATH), { recursive: true });
  const stamp = { sha, dirty, builtAt: new Date().toISOString() };
  if (reason) stamp.reason = reason;
  writeFileSync(STAMP_PATH, `${JSON.stringify(stamp, null, 2)}\n`);
  console.log(`build-stamp: wrote ${STAMP_PATH} (sha=${sha ?? "null"}, dirty=${dirty ?? "null"})`);
  return stamp;
}

export function clean() {
  if (existsSync(STAMP_PATH)) rmSync(STAMP_PATH, { force: true });
}

function main() {
  const cmd = process.argv[2] ?? "write";
  if (cmd === "write") {
    write();
    return 0;
  }
  if (cmd === "clean") {
    clean();
    return 0;
  }
  console.error("usage: node scripts/build-stamp.mjs <write|clean>");
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main();
}
