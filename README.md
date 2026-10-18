# CreatorDesk

Self-hosted commission engine for independent digital artists.

The product is a **client approval page**: you upload a revision, send your client
a private link, and they click **Approve** or **Request changes**. Revision
history is retained, so scope-creep conversations have an audit trail instead of
living in DMs.

Not a marketplace. Not a portfolio host. Not a CRM.

**Status:** v1 demo. Single-artist, self-hosted, no payments, no portfolio
hosting, no contracts. The schema contract is `migrations/001_init.sql` — read it
before contributing. The next milestone is user validation (five interviews with
working commission artists), not more features.

---

## What it does

1. You create a commission with a client name and title.
2. You upload the first sketch. The commission moves to `awaiting_approval`.
3. You copy a private link and send it to your client however you like (email,
   DM, carrier pigeon — CreatorDesk doesn't send email).
4. The client opens the link, sees the image, and clicks **Approve** or
   **Request changes** with optional feedback.
5. If they request changes, you upload the next revision. The cycle repeats.
6. When the final revision is approved, you click **Mark delivered**.

Every revision and every decision is retained. The client never creates an
account.

---

## Run locally

Requires **Node 20+**. `better-sqlite3` ships prebuilds for most platforms; if
`npm install` falls back to compiling it, you'll need `python3`, `make`, and a C++
compiler.

```sh
npm install
cp .env.example .env
npm run db:reset     # creates data/, applies migrations, seeds a demo artist
npm run dev          # http://localhost:3000
```

Open `http://localhost:3000`, click **+ New commission**, and follow the flow.

To reset everything at any time: `npm run db:reset` (wipes `data/` — this
deletes all commissions, revisions, and uploaded files).

---

## Demo walkthrough

A full loop takes about two minutes:

1. **`/`** — empty dashboard, one link: **+ New commission**.
2. **`/c/new`** — fill in title and client name → **Create**. The next screen
   shows a one-time client link. **Copy it now** — the raw token is never stored
   server-side, only its sha256.
3. **`/`** — the commission appears. Click it → **Upload next revision** → pick
   a PNG. The commission moves to `awaiting_approval`.
4. **Paste the client link** into a second window. The image renders. Click
   **Request changes** with a note like "make the hair blue" → submit.
5. **Back on the artist page**, refresh. History shows v1 `changes_requested`
   with the client's note. Upload v2.
6. **Client window**, refresh. v2 renders. Click **Approve**.
7. **Artist page** — status is `approved`. Click **Mark delivered** → `delivered`.

If you lose the client link, open the commission and use **Rotate client link**.
The old link stops working immediately.

---

## Project layout

```
creator-desk/
├── data/                          # gitignored — SQLite + uploads
├── migrations/
│   └── 001_init.sql               # schema; the contract
├── scripts/
│   ├── migrate.ts                 # applies migrations/*.sql in order
│   └── seed.ts                    # inserts one demo artist
├── src/
│   ├── lib/
│   │   ├── db.ts                  # connection + transaction wrapper
│   │   ├── approval-tokens.ts     # security boundary
│   │   ├── uploads.ts             # local filesystem, sha256-named
│   │   ├── revisions.ts           # the atomic decision claim
│   │   ├── commissions.ts         # workflow orchestration
│   │   └── session.ts             # single-artist stub
│   └── app/
│       ├── page.tsx               # dashboard
│       ├── c/new/page.tsx         # create commission
│       ├── c/[commissionId]/      # artist detail + upload + deliver
│       ├── a/[token]/             # CLIENT approval page ← the product
│       └── api/                   # create-commission, file serving
└── tests/
    ├── approval-tokens.test.ts
    └── revisions.test.ts
```

Dependency direction: `app/**` → `lib/commissions` → `lib/revisions` → `lib/db`.
Route handlers never import `db` directly. The client route derives everything
from the token; no other identifier in the request can name a commission.

---

## Invariants

The whole design rests on five rules. Each is enforced somewhere specific;
don't break one without breaking the others.

1. **Revision history is append-only** by application convention. No code path
   updates a revision's `file_path` or deletes a revision row. The schema
   doesn't enforce this — a trigger could, but triggers hide transitions and
   the design goal is that transitions are visible in code.
2. **A decision is atomic and one-way.** `pending → approved | changes_requested`
   happens in a single conditional `UPDATE`. Zero rows updated means the client
   raced themselves, a newer revision exists, or the commission isn't awaiting
   approval — reject, don't retry silently.
3. **A token authorizes exactly one commission.** The client route hashes the
   presented token and looks it up by `approval_token_hash`. It never accepts a
   `commission_id` from the request.
4. **The client route derives everything from the token.** No other identifier
   in the request (URL, form, header) may name a commission, revision, or
   artist.
5. **Revision write and commission-status write are one transaction.** Both
   `submitRevision` and `recordDecision` update both tables inside a single
   `db.transaction()`, with a conditional on the commission update. A partial
   write is unrepresentable.

---

## Tests

```sh
npm test
```

`tests/revisions.test.ts` is the one that matters. It exercises the four race
scenarios the design exists to resolve:

| Scenario | Expected |
|---|---|
| Client approves, then re-submits | `already_decided` |
| Artist uploads v2 while client decides v1 | `not_latest` |
| Commission not in `awaiting_approval` | `wrong_state` |
| Revision id doesn't exist | `not_found` |

If any of these fail, the transaction contract is broken. Don't change the test.

---

## Backup

`data/` is the entire state. To back up:

```sh
# Stop the app first.
tar czf creatordesk-backup-$(date +%F).tgz data/
```

To restore: stop the app, replace `data/`, restart. A one-click export button is
planned; until then, this is the supported path.

---

## What's deliberately not here

- **Auth.** `src/lib/session.ts` returns a stub artist id. Real auth (email +
  password, or magic link) is the next step, but it's gated on validation, not
  on this build.
- **Payments, portfolio, contracts, scheduling, DMs, memberships.** All
  explicitly out of scope. Each is a competitor's strength or a legal rabbit
  hole.
- **Email.** CreatorDesk doesn't send anything. Copy the link and send it
  yourself.
- **Multi-artist.** One artist per install in v1.

---

## License

MIT — see `LICENSE`.
