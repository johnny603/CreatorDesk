"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as commissions from "@/lib/commissions";
import * as revisions from "@/lib/revisions";
import { save } from "@/lib/uploads";

export async function uploadRevision(commissionId: string, form: FormData) {
  const file = form.get("file");
  const artistMessageRaw = String(form.get("artistMessage") || "").trim();
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("file required");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const filePath = save(bytes, file.name);
  revisions.submitRevision({
    commissionId,
    filePath,
    artistMessage: artistMessageRaw || null,
  });
  revalidatePath(`/c/${commissionId}`);
  revalidatePath(`/`);
}

export async function deliver(commissionId: string) {
  commissions.markDelivered(commissionId);
  revalidatePath(`/c/${commissionId}`);
  revalidatePath(`/`);
  redirect(`/c/${commissionId}`);
}

export async function deleteCommissionAction(commissionId: string) {
  commissions.deleteCommission(commissionId);
  revalidatePath(`/`);
  redirect(`/`);
}
