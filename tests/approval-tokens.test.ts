// The security boundary. If any of these fail, tokens are guessable, the
// stored hash doesn't match what the route computes, or a malformed token
// reaches the DB. All three are auth bypasses.

import { describe, it, expect } from "vitest";
import {
  generateToken,
  hashToken,
  tokenMatches,
  isWellFormed,
} from "@/lib/approval-tokens";

describe("generateToken", () => {
  it("produces a base64url string", () => {
    const t = generateToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t.length).toBeGreaterThanOrEqual(40);
    expect(t.length).toBeLessThanOrEqual(64);
  });

  it("is well-formed by its own predicate", () => {
    for (let i = 0; i < 20; i++) {
      expect(isWellFormed(generateToken())).toBe(true);
    }
  });

  it("is unique across many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateToken());
    expect(seen.size).toBe(1000);
  });
});

describe("hashToken", () => {
  it("is deterministic", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
  });

  it("is sha256 hex (64 chars, lowercase)", () => {
    expect(hashToken("hello")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the known sha256 of the empty string", () => {
    // Ensures we're hashing bytes as UTF-8, not doing something exotic.
    expect(hashToken("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  it("differs for tokens that differ in one character", () => {
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

describe("tokenMatches", () => {
  it("returns true for a token against its own hash", () => {
    const t = generateToken();
    expect(tokenMatches(t, hashToken(t))).toBe(true);
  });

  it("returns false for a different token", () => {
    const a = generateToken();
    const b = generateToken();
    expect(tokenMatches(a, hashToken(b))).toBe(false);
  });

  it("returns false for a hash of the wrong length without throwing", () => {
    const t = generateToken();
    expect(tokenMatches(t, "deadbeef")).toBe(false);
    expect(tokenMatches(t, "")).toBe(false);
  });
});

describe("isWellFormed", () => {
  it("rejects empty, short, long, and non-base64url strings", () => {
    expect(isWellFormed("")).toBe(false);
    expect(isWellFormed("short")).toBe(false);
    expect(isWellFormed("a".repeat(39))).toBe(false);        // too short (39 < 40)
    expect(isWellFormed("a".repeat(41) + "=")).toBe(false);  // padding — not base64url
    expect(isWellFormed("a".repeat(41) + "!")).toBe(false);  // bad char
    expect(isWellFormed("a".repeat(200))).toBe(false);       // too long
  });

  it("accepts a generated token", () => {
    expect(isWellFormed(generateToken())).toBe(true);
  });

  it("rejects non-strings", () => {
    // @ts-expect-error — deliberately wrong type
    expect(isWellFormed(undefined)).toBe(false);
    // @ts-expect-error
    expect(isWellFormed(null)).toBe(false);
  });
});
