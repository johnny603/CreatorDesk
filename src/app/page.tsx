import Link from "next/link";
import * as commissions from "@/lib/commissions";
import { currentArtistId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default function Dashboard() {
  const rows = commissions.listForArtist(currentArtistId());
  return (
    <main>
      <h1>CreatorDesk</h1>
      <p><Link href="/c/new">+ New commission</Link></p>

      {rows.length === 0 ? (
        <p>No commissions yet.</p>
      ) : (
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
            {rows.map((c) => (
              <tr key={c.id} style={{ borderTop: "1px solid #ddd" }}>
                <td><Link href={`/c/${c.id}`}>{c.title}</Link></td>
                <td>{c.client_name}</td>
                <td><code>{c.status}</code></td>
                <td>{c.updated_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
