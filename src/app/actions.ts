"use server";
import { revalidatePath } from "next/cache";
import * as commissions from "@/lib/commissions";
import { currentArtistId } from "@/lib/session";

export async function deleteAllCommissionsAction() {
  commissions.deleteAllForArtist(currentArtistId());
  revalidatePath(`/`);
}
