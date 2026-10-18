-- CreatorDesk schema v1
-- Three entities. Revision history is treated as append-only by the application:
-- no code path updates a revision's file_path or deletes a revision row. The
-- schema does NOT enforce this; a BEFORE UPDATE / BEFORE DELETE trigger could,
-- but triggers hide state transitions and this project's design goal is that
-- every transition is visible in application code. Revisit if a second writer
-- (a sync job, an importer) is ever added.
--
-- Never edit after first run; add 002_*.sql instead.

PRAGMA foreign_keys = ON;

CREATE TABLE artists (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE commissions (
  id                  TEXT PRIMARY KEY,
  artist_id           TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  client_name         TEXT NOT NULL,
  client_email        TEXT,
  title               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'queued'
                        CHECK (status IN (
                          'queued','in_progress','awaiting_approval','approved','delivered'
                        )),
  -- sha256(raw_token), hex. Raw token is never stored or logged.
  approval_token_hash TEXT NOT NULL UNIQUE,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_commissions_artist_status
  ON commissions(artist_id, status);

CREATE TABLE revisions (
  id               TEXT PRIMARY KEY,
  commission_id    TEXT NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
  version_number   INTEGER NOT NULL,
  file_path        TEXT NOT NULL,
  artist_message   TEXT,
  decision         TEXT NOT NULL DEFAULT 'pending'
                     CHECK (decision IN ('pending','approved','changes_requested')),
  client_feedback  TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  decided_at       TEXT,
  UNIQUE (commission_id, version_number),
  CHECK (
    (decision = 'pending'         AND decided_at IS NULL) OR
    (decision IN ('approved','changes_requested') AND decided_at IS NOT NULL)
  )
);

CREATE INDEX idx_revisions_commission_version
  ON revisions(commission_id, version_number DESC);
