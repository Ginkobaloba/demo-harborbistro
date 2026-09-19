/**
 * The one reader of SESSION_SECRET (D-018).
 *
 * Two things are keyed by it: the portal `hb_session` JWT (portal-session.ts)
 * and, through a derived key, the signed `hb_visitor` cookie (visitor.ts).
 * Both apply the same rule, which is the rule the portal session has always
 * used: set, and at least 32 characters. The published `.env.example`
 * placeholder is refused by name as well, in case it is ever lengthened.
 *
 * Deliberately free of Node-only imports: the Edge middleware reads it too.
 */

export const MIN_SESSION_SECRET_LENGTH = 32;

/** The .env.example placeholder is public, so it must never sign anything. */
const PLACEHOLDER_SECRETS = new Set(["replace-with-48-bytes-of-random"]);

export type SessionSecretProblem = "missing" | "too_short" | "placeholder";

export function sessionSecretProblem(value: string | undefined): SessionSecretProblem | null {
  if (!value) return "missing";
  if (PLACEHOLDER_SECRETS.has(value)) return "placeholder";
  if (value.length < MIN_SESSION_SECRET_LENGTH) return "too_short";
  return null;
}

const PROBLEM_MESSAGES: Record<SessionSecretProblem, string> = {
  missing: "SESSION_SECRET is not set",
  too_short: `SESSION_SECRET is shorter than ${MIN_SESSION_SECRET_LENGTH} characters`,
  placeholder: "SESSION_SECRET is still the published .env.example placeholder",
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
