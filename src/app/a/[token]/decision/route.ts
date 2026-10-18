// The only write path for clients. The revision to decide is derived from the
// token's commission — never from the request body — so a token can only ever
// affect its own commission's latest revision.
import { NextResponse } from "next/server";
import * as tokens from "@/lib/approval-tokens";
import * as commissions from "@/lib/commissions";
import * as revisions from "@/lib/revisions";

export async function POST(req: Request, { params }: { params: { token: string } }) {
  if (!tokens.isWellFormed(params.token)) return new NextResponse("Not found", { status: 404 });
  const commission = commissions.findByTokenHash(tokens.hashToken(params.token));
  if (!commission) return new NextResponse("Not found", { status: 404 });

  const latest = revisions.latestPendingForCommission(commission.id);
  if (!latest) return new NextResponse("Nothing to decide", { status: 409 });

  const form = await req.formData();
  const decision = form.get("decision");
  const feedbackRaw = String(form.get("feedback") || "").trim();
  if (decision !== "approved" && decision !== "changes_requested") {
    return new NextResponse("Invalid decision", { status: 400 });
  }

  const result = revisions.recordDecision(latest.id, decision, feedbackRaw || null);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : 409;
    return new NextResponse(messageFor(result.reason), { status });
  }

  return NextResponse.redirect(new URL(`/a/${params.token}?thanks=1`, req.url));
}

function messageFor(reason: string): string {
  switch (reason) {
    case "not_latest":      return "The artist has submitted a newer revision. Refresh to review it.";
    case "already_decided": return "This revision has already been decided.";
    case "wrong_state":     return "This commission is not awaiting approval.";
    default:                return "Unable to record decision.";
  }
}
