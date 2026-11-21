"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { deleteMyAccount } from "@/lib/account/delete";
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

/**
 * Deletes the signed-in person's account and everything they own (the database cascades). They must
 * type DELETE and enter their password. Removing an auth user needs the secret key, which stays on
 * the server and is used for this one call only.
 */
export async function deleteAccount(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const supabase = await createClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY?.trim();

  const result = await deleteMyAccount(
    {
      async currentUser() {
        const { data } = await supabase.auth.getClaims();
        const id = data?.claims?.sub;
        const email = data?.claims?.email;
        return typeof id === "string" && typeof email === "string" && email !== "" ? { id, email } : null;
      },
      async passwordIsRight(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return !error;
      },
      deleteUser:
        url && secret
          ? async (id) => {
              const admin = createAdminClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
              const { error } = await admin.auth.admin.deleteUser(id);
              if (error) {
                console.error("[profile] could not delete account:", error.code ?? "no code");
                throw new Error("delete failed");
              }
            }
          : null,
    },
    { confirm: formData.get("confirm"), password: formData.get("password") },
  );

  if (!result.ok) return { error: result.error };
  await supabase.auth.signOut().catch(() => undefined);
  redirect("/sign-in?deleted=1");
}

/** Sends a short note to the team. The database checks the text and allows 10 notes an hour. */
export async function sendFeedback(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const kind = String(formData.get("kind") ?? "");
  const message = String(formData.get("message") ?? "");
  if (message.trim() === "") return { error: "Write a few words first." };
  if (message.trim().length > 2000) return { error: "Keep it to 2000 characters or fewer." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_feedback", { p_kind: kind, p_message: message });
  if (error) {
    console.error("[profile] could not send feedback:", error.code ?? "no code");
    return { error: "Could not send that. Try again." };
  }
  if (data === "limited") return { error: "You have sent a lot of notes just now. Try again in an hour." };
  if (data !== "ok") return { error: "Choose what kind of note this is, then try again." };
  return { message: "Thank you. We read every note." };
}
