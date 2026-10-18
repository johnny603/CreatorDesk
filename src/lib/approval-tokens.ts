// The security boundary. Keep small, keep tested. Raw tokens are never stored
// or logged; only sha256(raw) is persisted on commissions.approval_token_hash.
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

const TOKEN_BYTES = 32;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Constant-time compare of a presented raw token against a stored hash.
 * The normal client-auth path does NOT call this: routes hash the presented
 * token and look it up by `approval_token_hash`, which is an indexed equality
 * query. Keep this for tests and any future in-memory comparison.
 */
export function tokenMatches(raw: string, storedHashHex: string): boolean {
  const a = Buffer.from(hashToken(raw), "hex");
  const b = Buffer.from(storedHashHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function isWellFormed(raw: string): boolean {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(raw);
}
