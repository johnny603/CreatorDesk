import { NextResponse } from "next/server";
import * as tokens from "@/lib/approval-tokens";
import * as commissions from "@/lib/commissions";
import { read } from "@/lib/uploads";

// Scope: token in the query string, filename in the path. The token must
// resolve to a commission whose latest revision's file_path matches
// `filename` — otherwise 404. This is the only file-serving route; no
// unauthenticated filesystem access.
export async function GET(req: Request, { params }: { params: { filename: string } }) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!tokens.isWellFormed(token)) return new NextResponse("Not found", { status: 404 });
  const commission = commissions.findByTokenHash(tokens.hashToken(token));
  if (!commission) return new NextResponse("Not found", { status: 404 });

  const { query } = await import("@/lib/db");
  const rows = query<{ file_path: string }>(
    `SELECT file_path FROM revisions
      WHERE commission_id = ? AND file_path = ?
      ORDER BY version_number DESC LIMIT 1`,
    [commission.id, params.filename]
  );
  if (rows.length === 0) return new NextResponse("Not found", { status: 404 });

  const bytes = read(params.filename);
  const ext = params.filename.split(".").pop() ?? "bin";
  const mime =
    ext === "png" ? "image/png" :
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
    ext === "webp" ? "image/webp" :
    "application/octet-stream";
  return new NextResponse(bytes, {
    headers: { "content-type": mime, "cache-control": "private, max-age=300" },
  });
}
