// Workflow orchestration. This is the only module that combines revisions,
// tokens, uploads, and the DB. Route handlers call only this module (plus
// `revisions.recordDecision` from the client decision route).
import { get, query, transaction } from "./db";
import * as tokens from "./approval-tokens";

export type Status =
  | "queued" | "in_progress" | "awaiting_approval" | "approved" | "delivered";

export type CommissionRow = {
  id: string;
  artist_id: string;
  client_name: string;
  client_email: string | null;
  title: string;
  status: Status;
  approval_token_hash: string;
  approval_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

const TOKEN_TTL_DAYS = 30;

function tokenExpiry(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + TOKEN_TTL_DAYS);
  return d.toISOString();
}

export function create(input: {
  artistId: string;
  clientName: string;
  clientEmail: string | null;
  title: string;
}): { commission: CommissionRow; rawToken: string } {
  const rawToken = tokens.generateToken();
  const hash = tokens.hashToken(rawToken);
  const id = cryptoRandomId();
  const expiresAt = tokenExpiry();
  transaction((tx) => {
    tx.run(
      `INSERT INTO commissions
         (id, artist_id, client_name, client_email, title, approval_token_hash, approval_token_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.artistId, input.clientName, input.clientEmail, input.title, hash, expiresAt]
    );
  });
  const commission = get<CommissionRow>(`SELECT * FROM commissions WHERE id = ?`, [id])!;
  return { commission, rawToken };
}

// Reject expired tokens. NULL expires_at is "no expiry" (legacy tokens);
// non-NULL in the past is rejected.
export function findByTokenHash(hash: string): CommissionRow | undefined {
  return get<CommissionRow>(
    `SELECT * FROM commissions
      WHERE approval_token_hash = ?
        AND (approval_token_expires_at IS NULL
             OR approval_token_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    [hash]
  );
}

export function rotateApprovalToken(commissionId: string): string {
  const raw = tokens.generateToken();
  const hash = tokens.hashToken(raw);
  const expiresAt = tokenExpiry();
  transaction((tx) => {
    const r = tx.run(
      `UPDATE commissions
          SET approval_token_hash = ?,
              approval_token_expires_at = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?`,
      [hash, expiresAt, commissionId]
    );
    if (r.changes !== 1) throw new Error("commission not found");
  });
  return raw;
}

export function markDelivered(commissionId: string): void {
  transaction((tx) => {
    const r = tx.run(
      `UPDATE commissions
          SET status = 'delivered',
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ? AND status = 'approved'`,
      [commissionId]
    );
    if (r.changes !== 1) throw new Error("commission is not in 'approved' state");
  });
}

export function listForArtist(artistId: string): CommissionRow[] {
  return query<CommissionRow>(
    `SELECT * FROM commissions WHERE artist_id = ? ORDER BY updated_at DESC`,
    [artistId]
  );
}

export function getById(commissionId: string): CommissionRow | undefined {
  return get<CommissionRow>(`SELECT * FROM commissions WHERE id = ?`, [commissionId]);
}

export function deleteCommission(commissionId: string): void {
  transaction((tx) => {
    const r = tx.run(`DELETE FROM commissions WHERE id = ?`, [commissionId]);
    if (r.changes !== 1) throw new Error("commission not found");
    // revisions cascade via FK. Uploaded files in data/uploads/ are not
    // deleted — the sha256-named design means re-uploading the same bytes
    // is free, and losing a few KB to an orphaned blob is cheaper than
    // making delete depend on filesystem operations.
  });
}

// Single-artist install: scoped to currentArtistId(). If multi-artist orgs
// are ever added, this needs an ownership check at the call site — see the
// dashboard page's comment.
export function deleteAllForArtist(artistId: string): number {
  return transaction((tx) => {
    const r = tx.run(`DELETE FROM commissions WHERE artist_id = ?`, [artistId]);
    return r.changes;
  });
}

function cryptoRandomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
