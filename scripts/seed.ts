// Inserts one demo artist so the FK from commissions.artist_id resolves and
// the dashboard has something to query on first run. Idempotent: re-running
// does nothing if the artist already exists.
import { get, run } from "../src/lib/db";

const DEMO = {
  id: "artist-1",
  name: "Demo Artist",
  email: "demo@creatordesk.local",
  // bcrypt-style placeholder; real auth is out of scope for v1.
  password_hash: "!",
};

export function seedArtist(): void {
  const existing = get(`SELECT 1 FROM artists WHERE id = ?`, [DEMO.id]);
  if (existing) {
    console.log(`artist '${DEMO.id}' already present`);
    return;
  }
  run(
    `INSERT INTO artists (id, name, email, password_hash) VALUES (?, ?, ?, ?)`,
    [DEMO.id, DEMO.name, DEMO.email, DEMO.password_hash]
  );
  console.log(`seeded artist '${DEMO.id}'`);
}

seedArtist();
