import { NextResponse } from "next/server";
import * as commissions from "@/lib/commissions";
import { currentArtistId } from "@/lib/session";

export async function POST(req: Request) {
  const form = await req.formData();
  const title = String(form.get("title") || "").trim();
  const clientName = String(form.get("clientName") || "").trim();
  const clientEmailRaw = String(form.get("clientEmail") || "").trim();
  if (!title || !clientName) {
    return new NextResponse("title and clientName required", { status: 400 });
  }
  const { commission, rawToken } = commissions.create({
    artistId: currentArtistId(),
    clientName,
    clientEmail: clientEmailRaw || null,
    title,
  });
  return NextResponse.json({ id: commission.id, rawToken });
}
