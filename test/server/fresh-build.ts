import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * A test or deploy path that starts the built standalone server and just
 * trusts whatever is sitting in `.next/standalone` is a false-green class:
 * a stale build means the suite either tests old code as if it were
 * current, or serves a pre-fix page while the checkout has moved on. A
 * comment telling the human to rebuild first ("Needs a fresh `npm run
 * build`") is not a check (D-019, docs/decisions.md).
 *
 * `assertFreshBuild` reads the stamp `scripts/build-stamp.mjs` writes as
 * `postbuild` (`.next/BUILD_STAMP.json`) and throws BEFORE any server is
 * spawned when it does not prove the build matches the current checkout.
 * Every real-server suite calls this first.
 */

export interface BuildStamp {
  sha: string | null;
  dirty: boolean | null;
  builtAt: string;
  reason?: string;
}

function stampPath(root: string): string {
  return path.join(root, ".next", "BUILD_STAMP.json");
}

function currentHeadSha(root: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch (err) {
    throw new Error(
      `could not read the current git HEAD to check the build stamp (${(err as Error).message.split("\n")[0]}). ` +
        `The real-server suite needs to run from a git checkout.`,
    );
  }
}

function workingTreeIsDirtyNow(root: string): boolean {
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  return status.trim().length > 0;
}

export function assertFreshBuild(root: string): void {
  const file = stampPath(root);
  if (!fs.existsSync(file)) {
    throw new Error("no build stamp: run npm run build");
  }

  let stamp: BuildStamp;
  try {
    stamp = JSON.parse(fs.readFileSync(file, "utf8")) as BuildStamp;
  } catch (err) {
    throw new Error(
      `build stamp at ${file} is not valid JSON (${(err as Error).message.split("\n")[0]}): run npm run build`,
    );
  }

  const headSha = currentHeadSha(root);

  if (!stamp.sha) {
    throw new Error(
      `build stamp has no usable sha${stamp.reason ? ` (${stamp.reason})` : ""}, checkout is ${headSha}: ` +
        `run npm run build from a git checkout so the freshness check has something to compare against`,
    );
  }

  if (stamp.sha !== headSha) {
    throw new Error(`stale build: build is from ${stamp.sha}, checkout is ${headSha}. Run npm run build.`);
  }

  if (stamp.dirty) {
    throw new Error(
      `build at ${stamp.sha} was made from a dirty working tree (uncommitted changes were present when ` +
        `npm run build ran): commit or discard those changes, then run npm run build again.`,
    );
  }

  if (workingTreeIsDirtyNow(root)) {
    throw new Error(
      `working tree is dirty: build ${stamp.sha} was clean when built, but the checkout at HEAD ${headSha} ` +
        `now has uncommitted changes on top of it. Commit or discard them, then run npm run build.`,
    );
  }
}
