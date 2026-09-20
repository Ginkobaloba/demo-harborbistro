/**
 * The one reader of SESSION_SECRET (D-018).
 *
 * Two things are keyed by it: the portal `hb_session` JWT (portal-session.ts)
 * and, through a derived key, the signed `hb_visitor` cookie (visitor.ts).
 * Both apply the same rule, which is the rule the portal session has always
 * used: set, and at least 32 characters.
 *
 * There is deliberately no exact-string placeholder denylist here. One used
 * to exist, for the RETIRED `.env.example` placeholder
 * ("replace-with-48-bytes-of-random", 31 chars). It was removed because it
 * was provably redundant: that string is 31 characters, one short of
 * MIN_SESSION_SECRET_LENGTH, so the length floor below refuses it on its
 * own, with or without a denylist. A denylist earns its keep only when a
 * published placeholder is LONGER than the floor and the floor cannot catch
 * it alone; that is not the case here and must not become the case here.
 *
 * The structural rule going forward: every `.env.example` placeholder for
 * this variable must be kept under MIN_SESSION_SECRET_LENGTH, so it fails
 * the length rule outright no matter how it is edited short of supplying a
 * real secret. Do NOT reintroduce an exact-string denylist as a fix for a
 * future placeholder; shorten the placeholder instead. A denylist is
 * trivially defeated by editing a single character, which is exactly what a
 * person does when told a value is invalid, so it adds an illusion of a
 * second control without adding an actual one.
 *
 * Deliberately free of Node-only imports: the Edge middleware reads it too.
 */

export const MIN_SESSION_SECRET_LENGTH = 32;

export type SessionSecretProblem = "missing" | "too_short";

export function sessionSecretProblem(value: string | undefined): SessionSecretProblem | null {
  if (!value) return "missing";
  if (value.length < MIN_SESSION_SECRET_LENGTH) return "too_short";
  return null;
}

const PROBLEM_MESSAGES: Record<SessionSecretProblem, string> = {
  missing: "SESSION_SECRET is not set",
  too_short: `SESSION_SECRET is shorter than ${MIN_SESSION_SECRET_LENGTH} characters`,
};

const warned = new Set<SessionSecretProblem>();

/**
 * The raw secret as bytes, or null when it is unusable. Each problem is
 * logged once per process, naming the rule and never the value.
 */
export function readSessionSecret(): Uint8Array | null {
  const value = process.env.SESSION_SECRET;
  const problem = sessionSecretProblem(value);
  if (problem) {
    if (!warned.has(problem)) {
      warned.add(problem);
      console.warn(
        `[session-secret] ${PROBLEM_MESSAGES[problem]}: online ordering and reservations answer 503 and no visitor cookie is issued (D-018).`,
      );
    }
    return null;
  }
  return new TextEncoder().encode(value as string);
}

/** Thrown-error form for callers that cannot continue without the secret. */
export function requireSessionSecret(): Uint8Array {
  const secret = readSessionSecret();
  if (!secret) {
    throw new Error("SESSION_SECRET must be set to a value of at least 32 characters");
  }
  return secret;
}
