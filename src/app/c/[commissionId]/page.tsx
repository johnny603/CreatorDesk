import { notFound } from "next/navigation";
import Link from "next/link";
import * as commissions from "@/lib/commissions";
import * as revisions from "@/lib/revisions";
import * as tokens from "@/lib/approval-tokens";
import { deliver, uploadRevision } from "./actions";

export const dynamic = "force-dynamic";

export default function CommissionPage({ params }: { params: { commissionId: string } }) {
  const commission = commissions.getById(params.commissionId);
  if (!commission) notFound();
  const history = revisions.listForCommission(commission.id);

  const upload = uploadRevision.bind(null, commission.id);
  const deliverAction = deliver.bind(null, commission.id);

  // Show the client link only if the artist has never sent one. Once a token
  // is generated we don't have the raw value to redisplay; the rotate button
  // below generates a fresh one on demand.
  const clientLink = commission.approval_token_hash
    ? null // raw token not recoverable
    : null;

  return (
    <main>
      <p><Link href="/">← Dashboard</Link></p>
      <h1>{commission.title}</h1>
      <p>
        Client: {commission.client_name}
        {commission.client_email ? ` <${commission.client_email}>` : ""}
      </p>
      <p>Status: <code>{commission.status}</code></p>

      <details>
        <summary>Client link</summary>
        <p>For security, the raw link is shown only once at creation. If you
        lost it, rotate it below — the previous link stops working.</p>
        <form
          action={async () => {
            "use server";
            const raw = commissions.rotateApprovalToken(commission.id);
            // Redirect with the token in the query string so it renders once.
            // Never logged server-side.
            const { redirect } = await import("next/navigation");
            redirect(`/c/${commission.id}?link=${encodeURIComponent(raw)}`);
          }}
        >
          <button type="submit">Rotate client link</button>
        </form>
      </details>

      <h2>Revision history</h2>
      {history.length === 0 ? (
        <p>No revisions yet.</p>
      ) : (
        <ol>
          {history.map((r) => (
            <li key={r.id} style={{ marginBottom: "0.75rem" }}>
              <strong>v{r.version_number}</strong> — <code>{r.decision}</code>
              {r.decided_at ? ` (${r.decided_at})` : ""}
              {r.artist_message ? <div><em>{r.artist_message}</em></div> : null}
              {r.client_feedback ? <div>Client: “{r.client_feedback}”</div> : null}
            </li>
          ))}
        </ol>
      )}

      <h2>Upload next revision</h2>
      <form action={upload}>
        <p><input type="file" name="file" required accept="image/*" /></p>
        <p><textarea name="artistMessage" placeholder="Note to client (optional)" /></p>
        <p><button type="submit">Upload &amp; notify client</button></p>
      </form>

      {commission.status === "approved" ? (
        <form action={deliverAction}>
          <p><button type="submit">Mark delivered</button></p>
        </form>
      ) : null}
    </main>
  );
}
