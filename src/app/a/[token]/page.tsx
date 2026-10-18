// The client approval page. This route is the product. The token is the only
// authorization input: it resolves to exactly one commission; no revision id,
// commission id, or artist id is accepted from the request.
//
// The client has no account and no way to recover from a wrong page. Every
// state the commission can be in must render something actionable, not a
// dead end. See the status table below for the mapping.
import { notFound } from "next/navigation";
import * as tokens from "@/lib/approval-tokens";
import * as commissions from "@/lib/commissions";
import * as revisions from "@/lib/revisions";
import { read } from "@/lib/uploads";

export default async function ApprovalPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { thanks?: string };
}) {
  if (!tokens.isWellFormed(params.token)) notFound();
  const commission = commissions.findByTokenHash(tokens.hashToken(params.token));
  if (!commission) notFound();

  // Item 1: post-decision confirmation. The redirect after a successful
  // decision lands here with ?thanks=1. Render a real page, not "Nothing to
  // review" — the client just took an action and needs to see it landed.
  if (searchParams.thanks === "1") {
    return (
      <main>
        <h1>Thanks — your feedback is recorded.</h1>
        <p>
          The artist will see your decision on <strong>{commission.title}</strong>{" "}
          the next time they open CreatorDesk. You can close this tab.
        </p>
      </main>
    );
  }

  // Item 2: contextual "nothing to review" per commission status. Each state
  // tells the client what's actually happening instead of a dead end.
  const latestPending = revisions.latestPendingForCommission(commission.id);
  if (!latestPending) {
    return <NoPendingView commission={commission} />;
  }

  // Item 3: render the review page, with the client's own history below the
  // image so they can remember what they asked for last time.
  const history = revisions.clientRevisionHistory(commission.id);
  const bytes = read(latestPending.file_path);
  const ext = latestPending.file_path.split(".").pop() || "bin";
  const mime =
    ext === "png" ? "image/png" :
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
    ext === "webp" ? "image/webp" :
    "application/octet-stream";
  const src = `/api/files/${encodeURIComponent(latestPending.file_path)}?token=${encodeURIComponent(params.token)}`;

  return (
    <main>
      <h1>{commission.title}</h1>
      <p>Version {latestPending.version_number}</p>
      <img src={src} alt={`revision ${latestPending.version_number}`} style={{ maxWidth: "100%" }} />
      {latestPending.artist_message && <p><em>{latestPending.artist_message}</em></p>}

      <form action={`/a/${params.token}/decision`} method="post">
        <p><textarea name="feedback" placeholder="Feedback (optional)" rows={3} cols={60} /></p>
        <p>
          <button name="decision" value="approved">Approve</button>{" "}
          <button name="decision" value="changes_requested">Request changes</button>
        </p>
      </form>

      {history.length > 1 && (
        <details>
          <summary>Revision history ({history.length} versions)</summary>
          <ol>
            {history.map((h) => (
              <li key={h.version_number}>
                <strong>v{h.version_number}</strong>{" "}
                {h.decision === "pending" ? (
                  <em>currently reviewing</em>
                ) : h.decision === "approved" ? (
                  <>you approved{h.decided_at ? ` (${h.decided_at})` : ""}</>
                ) : (
                  <>
                    you asked for changes
                    {h.client_feedback ? <>: “{h.client_feedback}”</> : null}
                    {h.decided_at ? ` (${h.decided_at})` : ""}
                  </>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </main>
  );
}

// Maps every "no pending revision" state to a page that tells the client what
// to do next. The one state we cannot render usefully is `awaiting_approval`
// with no pending revision — that would be a data invariant violation, so we
// fall through to a generic "check back" message.
function NoPendingView({ commission }: { commission: commissions.CommissionRow }) {
  const s = commission.status;
  if (s === "queued") {
    return (
      <main>
        <h1>{commission.title}</h1>
        <p>
          The artist is preparing your first revision. This link is valid —
          check back after they message you.
        </p>
      </main>
    );
  }
  if (s === "in_progress") {
    return (
      <main>
        <h1>{commission.title}</h1>
        <p>
          You requested changes, and the artist is working on the next version.
          Check back soon.
        </p>
      </main>
    );
  }
  if (s === "approved") {
    return (
      <main>
        <h1>{commission.title}</h1>
        <p>
          You approved the latest version. The artist will finalize delivery.
        </p>
      </main>
    );
  }
  if (s === "delivered") {
    return (
      <main>
        <h1>{commission.title}</h1>
        <p>
          This commission is complete. You approved the final version. There's
          nothing left to review.
        </p>
      </main>
    );
  }
  // awaiting_approval without a pending revision: invariant violation, but
  // don't 404 the client — tell them to check back.
  return (
    <main>
      <h1>{commission.title}</h1>
      <p>
        No revision is currently awaiting your review. The artist may have
        updated the work since your last visit — check back after they message
        you.
      </p>
    </main>
  );
}
