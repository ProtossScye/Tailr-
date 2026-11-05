"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { newPasswordProblem } from "@/lib/auth/validate";

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

/**
 * Changes the password of the signed-in person. The current password is checked first, so a phone
 * left unlocked cannot be used to lock the owner out.
 */
export async function changePassword(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  if (current === "") return { error: "Enter your current password." };
  const problem = newPasswordProblem(next, String(formData.get("confirm") ?? ""));
  if (problem) return { error: problem };
  if (next === current) return { error: "Choose a password different from your current one." };

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email;
  if (typeof email !== "string" || email === "") return { error: "Your session has ended. Sign in again." };

  const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: current });
  if (checkError) return { error: "Your current password is wrong." };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    if (error.code === "same_password") return { error: "Choose a password different from your current one." };
    if (error.code === "weak_password") return { error: "That password is too easy to guess. Try a longer or less common one." };
    console.error("[profile] could not change password:", error.code ?? "no code");
    return { error: "Could not change your password. Try again." };
  }
  return { message: "Password changed." };
}
