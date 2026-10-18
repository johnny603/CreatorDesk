import Link from "next/link";
import * as commissions from "@/lib/commissions";
import { currentArtistId } from "@/lib/session";
import { deleteAllCommissionsAction } from "./actions";

export const dynamic = "force-dynamic";

// Sort order is actionability, not recency. The artist opens the dashboard to
// answer "what do I do next?" — `in_progress` (client asked for changes) and
// `approved` (client signed off, artist needs to deliver) come first.
const STATUS_ORDER: Record<commissions.Status, number> = {
  in_progress: 0,
  approved: 1,
  awaiting_approval: 2,
  queued: 3,
  delivered: 4,
};

const STATUS_LABEL: Record<commissions.Status, string> = {
  queued: "queued",
  in_progress: "needs your next revision",
  awaiting_approval: "waiting on client",
  approved: "approved — ready to deliver",
  delivered: "delivered",
};

export default function Dashboard() {
  const rows = commissions.listForArtist(currentArtistId()).sort((a, b) => {
    const sa = STATUS_ORDER[a.status];
    const sb = STATUS_ORDER[b.status];
    if (sa !== sb) return sa - sb;
    return a.updated_at < b.updated_at ? 1 : -1;
  });

  return (
    <main>
      <h1>CreatorDesk</h1>
      <p><Link href="/c/new">+ New commission</Link></p>

      {rows.length === 0 ? (
        <p>No commissions yet.</p>
      ) : (
        <>
          <table cellPadding={8} style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Title</th>
                <th align="left">Client</th>
                <th align="left">Status</th>
                <th align="left">Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const needsAction = STATUS_ORDER[c.status] <= 1;
                return (
                  <tr key={c.id} style={{ borderTop: "1px solid #ddd" }}>
                    <td>
                      {needsAction ? "● " : "  "}
                      <Link href={`/c/${c.id}`}>{c.title}</Link>
                    </td>
                    <td>{c.client_name}</td>
                    <td><code>{STATUS_LABEL[c.status]}</code></td>
                    <td>{c.updated_at}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Single-artist install: "delete all" is scoped to
              currentArtistId() in the action. If multi-artist orgs are ever
              added, this control needs an ownership check before it renders. */}
          <details style={{ marginTop: "2rem" }}>
            <summary style={{ color: "crimson", cursor: "pointer" }}>
              Delete all commissions…
            </summary>
            <p style={{ fontSize: "0.9em", color: "#666" }}>
              This deletes all {rows.length} commissions and their revision
              history. Uploaded files remain on disk but are unreachable.
              Cannot be undone.
            </p>
            <form action={deleteAllCommissionsAction}>
              <button type="submit" style={{ color: "crimson" }}>
                Yes, delete all {rows.length} commissions
              </button>
            </form>
          </details>
        </>
      )}
    </main>
  );
}
