import { notFound } from "next/navigation";
import Link from "next/link";
import * as commissions from "@/lib/commissions";
import * as revisions from "@/lib/revisions";
import { deliver, uploadRevision, deleteCommissionAction } from "./actions";

export const dynamic = "force-dynamic";

export default function CommissionPage({ params }: { params: { commissionId: string } }) {
  const commission = commissions.getById(params.commissionId);
  if (!commission) notFound();
  const history = revisions.listForCommission(commission.id);

  const upload = uploadRevision.bind(null, commission.id);
  const deliverAction = deliver.bind(null, commission.id);
  const deleteAction = deleteCommissionAction.bind(null, commission.id);

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

      <div style={{ marginTop: "3rem", borderTop: "1px solid #ddd", paddingTop: "1rem" }}>
        <details>
          <summary style={{ color: "crimson", cursor: "pointer" }}>
            Delete this commission…
          </summary>
          <p style={{ fontSize: "0.9em", color: "#666" }}>
            This deletes the commission and its revision history. Uploaded files
            remain on disk but are unreachable. Cannot be undone.
          </p>
          <form action={deleteAction}>
            <button type="submit" style={{ color: "crimson" }}>
              Yes, delete permanently
            </button>
          </form>
        </details>
      </div>
    </main>
  );
}
