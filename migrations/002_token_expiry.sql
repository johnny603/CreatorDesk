-- Token expiry. Nullable for backward compatibility with tokens issued before
-- this migration; a NULL expires_at means "no expiry" (v0.1.0 behavior).
-- New tokens get a 30-day window; the artist can extend or rotate at any time.

ALTER TABLE commissions ADD COLUMN approval_token_expires_at TEXT;

-- Existing tokens: give them a fresh 30-day window from now, so a live demo
-- doesn't silently break on the next deploy.
UPDATE commissions
   SET approval_token_expires_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days')
 WHERE approval_token_expires_at IS NULL;

CREATE INDEX idx_commissions_token_expiry
  ON commissions(approval_token_expires_at);
