import { randomInt } from "node:crypto";

/**
 * Short human-readable codes for orders and reservations (docs/decisions.md
 * D-005). Non-ambiguous alphabet: no 0/O, 1/I/L.
 */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function code(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export function newOrderId(): string {
  return `HB-${code(5)}`;
}

export function newReservationId(): string {
  return `HR-${code(5)}`;
}
