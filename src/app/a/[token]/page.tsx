// The client approval page. This route is the product. The token is the only
// authorization input: it resolves to exactly one commission; no revision id,
// commission id, or artist id is accepted from the request.
import { notFound } from "next/navigation";
import * as tokens from "@/lib/approval-tokens";
import * as commissions from "@/lib/commissions";
import * as revisions from "@/lib/revisions";
import { read } from "@/lib/uploads";

export default async function ApprovalPage({ params }: { params: { token: string } }) {
  if (!tokens.isWellFormed(params.token)) notFound();
  const commission = commissions.findByTokenHash(tokens.hashToken(params.token));
  if (!commission) notFound();
  const latest = revisions.latestPendingForCommission(commission.id);
  if (!latest) {
    return (
      <main>
        <h1>Nothing to review</h1>
        <p>The artist has not submitted a revision awaiting your review.</p>
      </main>
    );
  }

  // Render the image inline as a data URL for the MVP (avoids a second
  // token-scoped file route). Swap for a token-scoped /a/:token/file route
  // later if file sizes warrant.
  const bytes = read(latest.file_path);
  const ext = latest.file_path.split(".").pop() || "bin";
  const mime = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "application/octet-stream";
  const src = `data:${mime};base64,${bytes.toString("base64")}`;

  return (
    <main>
      <h1>{commission.title}</h1>
      <p>Version {latest.version_number}</p>
      <img src={src} alt={`revision ${latest.version_number}`} style={{ maxWidth: "100%" }} />
      {latest.artist_message && <p><em>{latest.artist_message}</em></p>}
      <form action={`/a/${params.token}/decision`} method="post">
        <p><textarea name="feedback" placeholder="Feedback (optional)" /></p>
        <p>
          <button name="decision" value="approved">Approve</button>{" "}
          <button name="decision" value="changes_requested">Request changes</button>
        </p>
      </form>
    </main>
  );
}
