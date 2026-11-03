"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProfileFormState = { error?: string; message?: string } | undefined;

/**
 * Saves the display name. Runs as the signed-in user, so row-level security limits it to their own
 * row and to the display_name column (the only column users may change).
 */
export async function saveDisplayName(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const raw = formData.get("displayName");
  if (typeof raw !== "string") return { error: "Enter a name." };
  const name = raw.trim();
  if (name.length < 1) return { error: "Enter a name." };
  if (name.length > 80) return { error: "Keep your name to 80 characters or fewer." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (typeof userId !== "string") return { error: "Your session has ended. Sign in again." };

  const { data: updated, error } = await supabase.from("profiles").update({ display_name: name }).eq("id", userId).select("id");
  if (error || !updated || updated.length === 0) {
    console.error("[profile] could not save display name:", error?.code ?? "no row updated");
    return { error: "Could not save your name. Try again." };
  }
  revalidatePath("/", "layout");
  return { message: "Name saved." };
}
