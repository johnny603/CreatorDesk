// The four race scenarios the whole design exists to resolve. Each test uses
// a fresh in-memory SQLite DB so no two tests can interfere. If any of these
// fail, the transaction contract is broken — do not "fix" the test.

import { describe, it, expect, beforeEach, vi } from "vitest";

// Redirect db.ts to an in-memory database BEFORE importing anything that
// touches it. This is the only place that knows the DB is in-memory.
vi.mock("@/lib/db", async () => {
  const Database = (await import("better-sqlite3")).default;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(
    fs.readFileSync(
      path.resolve(process.cwd(), "migrations/001_init.sql"),
      "utf8"
    )
  );
  const query = (sql: string, params: unknown[] = []) =>
    db.prepare(sql).all(...params);
  const get = (sql: string, params: unknown[] = []) =>
    db.prepare(sql).get(...params);
  const run = (sql: string, params: unknown[] = []) => {
    const info = db.prepare(sql).run(...params);
    return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
  };
  return {
    query,
    get,
    run,
    transaction: <T,>(fn: (tx: { query: typeof query; get: typeof get; run: typeof run }) => T) =>
      db.transaction(() => fn({ query, get, run }))(),
  };
});

import * as commissions from "@/lib/commissions";
import * as revisions from "@/lib/revisions";
import { generateToken, hashToken } from "@/lib/approval-tokens";
import { get, run } from "@/lib/db";

const ARTIST = "artist-test";

beforeEach(() => {
  run(`DELETE FROM revisions`);
  run(`DELETE FROM commissions`);
  run(`DELETE FROM artists`);
  run(
    `INSERT INTO artists (id, name, email, password_hash) VALUES (?, ?, ?, ?)`,
    [ARTIST, "Test Artist", "test@example.com", "!"]
  );
});

function newCommission(): { id: string; rawToken: string } {
  const { commission, rawToken } = commissions.create({
    artistId: ARTIST,
    clientName: "Client",
    clientEmail: null,
    title: "Test commission",
  });
  return { id: commission.id, rawToken };
}

function uploadRevision(commissionId: string, filePath = "fake.png") {
  return revisions.submitRevision({
    commissionId,
    filePath,
    artistMessage: null,
  });
}

// ---------------------------------------------------------------------------

describe("submitRevision", () => {
  it("creates v1 and moves commission to awaiting_approval", () => {
    const { id } = newCommission();
    const rev = uploadRevision(id);
    expect(rev.version_number).toBe(1);
    expect(rev.decision).toBe("pending");

    const c = get<{ status: string }>(`SELECT status FROM commissions WHERE id = ?`, [id]);
    expect(c?.status).toBe("awaiting_approval");
  });

  it("increments version_number on each upload", () => {
    const { id } = newCommission();
    expect(uploadRevision(id).version_number).toBe(1);
    expect(uploadRevision(id).version_number).toBe(2);
    expect(uploadRevision(id).version_number).toBe(3);
  });

  it("can upload from 'approved' (next stage after sign-off)", () => {
    const { id } = newCommission();
    const v1 = uploadRevision(id);
    revisions.recordDecision(v1.id, "approved", null);
    // Commission is now 'approved' — artist starts the next stage.
    const v2 = uploadRevision(id);
    expect(v2.version_number).toBe(2);
  });

  it("refuses to upload from 'delivered'", () => {
    const { id } = newCommission();
    const v1 = uploadRevision(id);
    revisions.recordDecision(v1.id, "approved", null);
    commissions.markDelivered(id);
    expect(() => uploadRevision(id)).toThrow(/cannot submit revision/);
  });
});

describe("recordDecision — happy path", () => {
  it("approves the latest pending revision and sets commission 'approved'", () => {
    const { id } = newCommission();
    const rev = uploadRevision(id);
    const result = revisions.recordDecision(rev.id, "approved", null);
    expect(result).toEqual({ ok: true });

    const r = get<{ decision: string; decided_at: string | null }>(
      `SELECT decision, decided_at FROM revisions WHERE id = ?`,
      [rev.id]
    );
    expect(r?.decision).toBe("approved");
    expect(r?.decided_at).not.toBeNull();

    const c = get<{ status: string }>(`SELECT status FROM commissions WHERE id = ?`, [id]);
    expect(c?.status).toBe("approved");
  });

  it("changes_requested sets commission back to 'in_progress'", () => {
    const { id } = newCommission();
    const rev = uploadRevision(id);
    const result = revisions.recordDecision(rev.id, "changes_requested", "make it blue");
    expect(result).toEqual({ ok: true });

    const c = get<{ status: string }>(`SELECT status FROM commissions WHERE id = ?`, [id]);
    expect(c?.status).toBe("in_progress");
  });

  it("allows a new revision after changes_requested", () => {
    const { id } = newCommission();
    const v1 = uploadRevision(id);
    revisions.recordDecision(v1.id, "changes_requested", "redo");
    const v2 = uploadRevision(id);
    expect(v2.version_number).toBe(2);
    expect(v2.decision).toBe("pending");
  });
});

describe("recordDecision — the four race scenarios", () => {
  it("duplicate decision on the same revision → already_decided", () => {
    const { id } = newCommission();
    const rev = uploadRevision(id);
    expect(revisions.recordDecision(rev.id, "approved", null)).toEqual({ ok: true });
    expect(revisions.recordDecision(rev.id, "changes_requested", null)).toEqual({
      ok: false,
      reason: "already_decided",
    });
    // Commission state must not have moved from the second call.
    const c = get<{ status: string }>(`SELECT status FROM commissions WHERE id = ?`, [id]);
    expect(c?.status).toBe("approved");
  });

  it("deciding a superseded revision → not_latest", () => {
    const { id } = newCommission();
    const v1 = uploadRevision(id);
    const v2 = uploadRevision(id);
    // The client, with a stale tab, tries to decide v1.
    expect(revisions.recordDecision(v1.id, "approved", null)).toEqual({
      ok: false,
      reason: "not_latest",
    });
    // Commission is still awaiting approval of v2, not approved.
    const c = get<{ status: string }>(`SELECT status FROM commissions WHERE id = ?`, [id]);
    expect(c?.status).toBe("awaiting_approval");
    // v1 must be untouched.
    const r1 = get<{ decision: string }>(`SELECT decision FROM revisions WHERE id = ?`, [v1.id]);
    expect(r1?.decision).toBe("pending");
    // v2 is still pending and decidable.
    expect(revisions.recordDecision(v2.id, "approved", null)).toEqual({ ok: true });
  });

  it("decision on a commission not in awaiting_approval → wrong_state", () => {
    const { id } = newCommission();
    const v1 = uploadRevision(id);
    revisions.recordDecision(v1.id, "approved", null);
    // Commission is now 'approved'. Upload v2 to get back to awaiting, then
    // manually force status to delivered to simulate a bad state.
    uploadRevision(id);
    run(`UPDATE commissions SET status = 'delivered' WHERE id = ?`, [id]);
    const pending = revisions.latestPendingForCommission(id);
    expect(pending).toBeDefined();
    expect(revisions.recordDecision(pending!.id, "approved", null)).toEqual({
      ok: false,
      reason: "wrong_state",
    });
  });

  it("decision on a nonexistent revision → not_found", () => {
    expect(revisions.recordDecision("no-such-revision", "approved", null)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("token scoping", () => {
  it("a token resolves to exactly one commission", () => {
    const a = newCommission();
    const b = newCommission();
    expect(commissions.findByTokenHash(hashToken(a.rawToken))?.id).toBe(a.id);
    expect(commissions.findByTokenHash(hashToken(b.rawToken))?.id).toBe(b.id);
    expect(commissions.findByTokenHash(hashToken(a.rawToken))?.id).not.toBe(b.id);
  });

  it("rotateApprovalToken invalidates the old token", () => {
    const { id, rawToken } = newCommission();
    expect(commissions.findByTokenHash(hashToken(rawToken))?.id).toBe(id);
    const newRaw = commissions.rotateApprovalToken(id);
    expect(commissions.findByTokenHash(hashToken(rawToken))).toBeUndefined();
    expect(commissions.findByTokenHash(hashToken(newRaw))?.id).toBe(id);
  });
});

describe("latestPendingForCommission", () => {
  it("returns undefined when no pending revision exists", () => {
    const { id } = newCommission();
    expect(revisions.latestPendingForCommission(id)).toBeUndefined();
  });

  it("returns the newest pending revision, not an older one", () => {
    const { id } = newCommission();
    const v1 = uploadRevision(id);
    const v2 = uploadRevision(id);
    // Both pending (artist uploaded twice before client reviewed).
    // The route decides on v2 only — v1 is superseded.
    expect(revisions.latestPendingForCommission(id)?.id).toBe(v2.id);
    expect(revisions.latestPendingForCommission(id)?.id).not.toBe(v1.id);
  });

  it("returns undefined after the latest revision is approved", () => {
    const { id } = newCommission();
    const v1 = uploadRevision(id);
    revisions.recordDecision(v1.id, "approved", null);
    expect(revisions.latestPendingForCommission(id)).toBeUndefined();
  });
});
