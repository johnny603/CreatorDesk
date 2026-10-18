// Revision lifecycle. Every mutation here pairs a revision write with a
// commission-status write inside one transaction. Do not split them: any code
// path that advances a commission without inserting/deciding a revision (or
// vice versa) breaks the state machine even if the schema accepts the rows.
import { transaction, get, query, type Tx } from "./db";

export type Decision = "approved" | "changes_requested";

export type DecisionFailureReason =
  | "not_found"
  | "not_latest"
  | "already_decided"
  | "wrong_state";

export type DecisionResult =
  | { ok: true }
  | { ok: false; reason: DecisionFailureReason };

export type RevisionRow = {
  id: string;
  commission_id: string;
  version_number: number;
  file_path: string;
  artist_message: string | null;
  decision: "pending" | Decision;
  client_feedback: string | null;
  created_at: string;
  decided_at: string | null;
};

// Snapshot of the revision history as the client should see it. Same rows as
// listForCommission, but with the semantics a client cares about (who decided,
// what they said) rather than the artist view (which needs file paths to
// render thumbnails).
export type ClientRevisionSummary = {
  version_number: number;
  decision: "pending" | Decision;
  artist_message: string | null;
  client_feedback: string | null;
  decided_at: string | null;
};

export function submitRevision(input: {
  commissionId: string;
  filePath: string;
  artistMessage: string | null;
}): RevisionRow {
  return transaction((tx) => {
    const commission = tx.get<{ id: string; status: string }>(
      `SELECT id, status FROM commissions WHERE id = ?`,
      [input.commissionId]
    );
    if (!commission) throw new Error("commission not found");

    const { v } = tx.get<{ v: number }>(
      `SELECT COALESCE(MAX(version_number), 0) AS v FROM revisions WHERE commission_id = ?`,
      [input.commissionId]
    )!;

    const id = cryptoRandomId();
    tx.run(
      `INSERT INTO revisions (id, commission_id, version_number, file_path, artist_message)
       VALUES (?, ?, ?, ?, ?)`,
      [id, input.commissionId, v + 1, input.filePath, input.artistMessage]
    );

    // 'delivered' is the only state that blocks a new upload.
    const advanced = tx.run(
      `UPDATE commissions
          SET status = 'awaiting_approval',
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ? AND status IN ('queued','in_progress','awaiting_approval','approved')`,
      [input.commissionId]
    );
    if (advanced.changes !== 1) {
      throw new Error(`cannot submit revision from status '${commission.status}'`);
    }

    return tx.get<RevisionRow>(`SELECT * FROM revisions WHERE id = ?`, [id])!;
  });
}

export function recordDecision(
  revisionId: string,
  decision: Decision,
  feedback: string | null
): DecisionResult {
  return transaction((tx) => {
    const claimed = tx.run(
      `UPDATE revisions
          SET decision = ?,
              client_feedback = ?,
              decided_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?
          AND decision = 'pending'
          AND version_number = (
            SELECT MAX(version_number) FROM revisions WHERE commission_id =
              (SELECT commission_id FROM revisions WHERE id = ?)
          )
          AND EXISTS (
            SELECT 1 FROM commissions c
            JOIN revisions r ON r.commission_id = c.id
            WHERE r.id = ? AND c.status = 'awaiting_approval'
          )`,
      [decision, feedback, revisionId, revisionId, revisionId]
    );

    if (claimed.changes === 0) {
      return { ok: false, reason: classifyFailure(tx, revisionId) };
    }

    const newStatus = decision === "approved" ? "approved" : "in_progress";
    const advanced = tx.run(
      `UPDATE commissions
          SET status = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = (SELECT commission_id FROM revisions WHERE id = ?)
          AND status = 'awaiting_approval'`,
      [newStatus, revisionId]
    );
    if (advanced.changes !== 1) {
      throw new Error("commission update affected 0 rows after successful claim");
    }

    return { ok: true };
  });
}

// Order matters: revision state before commission state, so already_decided
// is reachable when the commission has already moved on.
function classifyFailure(tx: Tx, revisionId: string): DecisionFailureReason {
  const rev = tx.get<{
    decision: string;
    version_number: number;
    commission_id: string;
    status: string;
  }>(
    `SELECT r.decision, r.version_number, r.commission_id, c.status
       FROM revisions r JOIN commissions c ON c.id = r.commission_id
      WHERE r.id = ?`,
    [revisionId]
  );
  if (!rev) return "not_found";
  if (rev.decision !== "pending") return "already_decided";
  if (rev.status !== "awaiting_approval") return "wrong_state";
  const latest = tx.get<{ v: number }>(
    `SELECT MAX(version_number) AS v FROM revisions WHERE commission_id = ?`,
    [rev.commission_id]
  )!;
  if (latest.v !== rev.version_number) return "not_latest";
  throw new Error("decision claim failed without a classified reason");
}

export function latestPendingForCommission(commissionId: string): RevisionRow | undefined {
  return get<RevisionRow>(
    `SELECT * FROM revisions
      WHERE commission_id = ? AND decision = 'pending'
      ORDER BY version_number DESC LIMIT 1`,
    [commissionId]
  );
}

export function listForCommission(commissionId: string): RevisionRow[] {
  return query<RevisionRow>(
    `SELECT * FROM revisions WHERE commission_id = ?
      ORDER BY version_number DESC`,
    [commissionId]
  );
}

// Client-facing history. Excludes file paths — the client page shows context,
// not thumbnails of past revisions (that's the artist's view).
export function clientRevisionHistory(commissionId: string): ClientRevisionSummary[] {
  return query<ClientRevisionSummary>(
    `SELECT version_number, decision, artist_message, client_feedback, decided_at
       FROM revisions WHERE commission_id = ?
      ORDER BY version_number ASC`,
    [commissionId]
  );
}

function cryptoRandomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
