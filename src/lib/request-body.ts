/**
 * Bounded JSON body reading and free-text limits for the public write routes
 * (D-017).
 *
 * Every POST route a visitor can reach reads its body through readJsonBody,
 * which enforces a byte cap BEFORE anything is parsed or stored:
 *
 *   1. A declared Content-Length over the cap is refused up front (413).
 *   2. The body stream is then read chunk by chunk and abandoned as soon as
 *      the running total passes the cap (413). This is the real guard: a
 *      chunked request carries no Content-Length, and a client can lie in it.
 *   3. Only then is the text parsed as JSON (400 on garbage).
 *
 * The field limits below are the second layer: a body under the byte cap can
 * still hold a name no restaurant needs, so each free-text field has its own
 * maximum, checked after trimming. Lengths are counted in UTF-16 code units
 * (String.length), the same unit the browser's maxLength attribute uses, so
 * the form and the server agree on the boundary.
 */

/** Byte caps per route. Generous for real use, tiny next to an abuse payload. */
export const BODY_LIMITS = {
  /** Cart plus contact details. MAX_CART_LINES configured lines fit easily. */
  checkout: 32 * 1024,
  reservation: 8 * 1024,
  /** Operator actions: a single short enum field. */
  adminAction: 1024,
  /** A signed portal JWT; real tokens are well under 2 KB. */
  portalHandoff: 16 * 1024,
} as const;

/** Maximum lengths for visitor-entered free text, after trimming. */
export const FIELD_LIMITS = {
  name: 100,
  phone: 32,
  /** RFC 5321 path limit. */
  email: 254,
  address: 300,
  notes: 500,
} as const;

export type BodyReadResult =
  | { ok: true; body: unknown }
  | { ok: false; status: 400 | 413; error: string };

const TOO_LARGE = "Request body is too large";
const INVALID_JSON = "Invalid JSON";

/**
 * Read and parse a JSON request body, refusing anything over `maxBytes`.
 * Never throws for client input; the caller shapes the error response.
 */
export async function readJsonBody(req: Request, maxBytes: number): Promise<BodyReadResult> {
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > maxBytes) {
      return { ok: false, status: 413, error: TOO_LARGE };
    }
  }

  if (!req.body) return { ok: false, status: 400, error: INVALID_JSON };

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        // Nothing of the upload is kept. Swallow a little more of what is
        // already in flight so the client is likelier to read the 413 than
        // a TCP reset, then stop pulling.
        await drainBriefly(reader);
        await reader.cancel().catch(() => {});
        return { ok: false, status: 413, error: TOO_LARGE };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: INVALID_JSON };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, status: 400, error: INVALID_JSON };
  }
}

/** Upper bounds for the post-cap discard: never more than this, never longer. */
export const DRAIN_MAX_BYTES = 64 * 1024;
export const DRAIN_MAX_MS = 50;

/**
 * Read and DISCARD at most DRAIN_MAX_BYTES more, for at most DRAIN_MAX_MS.
 * Nothing is retained (no buffering), and a slow or endless sender cannot
 * hold the 413 back for longer than the time bound.
 */
async function drainBriefly(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  const deadline = Date.now() + DRAIN_MAX_MS;
  let drained = 0;
  while (drained < DRAIN_MAX_BYTES) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), remaining);
    });
    try {
      const next = await Promise.race([reader.read(), timeout]);
      if (next === "timeout" || next.done) return;
      drained += next.value.byteLength;
    } catch {
      return;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** A JSON object body as a plain record, or null for arrays and primitives. */
export function asRecord(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export type TextFieldResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Validate one optional-or-required free-text field: absent/null reads as "",
 * anything that is not a string is refused (no "[object Object]" rows), and
 * the trimmed value must be at most `max` characters.
 */
export function textField(value: unknown, label: string, max: number): TextFieldResult {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false, error: `${label} must be text` };
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { ok: false, error: `${label} must be at most ${max} characters` };
  }
  return { ok: true, value: trimmed };
}
