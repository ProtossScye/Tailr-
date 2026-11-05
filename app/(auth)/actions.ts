"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/api/safe-next";
import { cleanCode, cleanEmail, newPasswordProblem } from "@/lib/auth/validate";

export type AuthFormState = { error?: string; message?: string } | undefined;

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const verifyUrl = (email: string, next?: string) => `/verify-email?email=${encodeURIComponent(email)}${next ? `&next=${encodeURIComponent(next)}` : ""}`;

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = cleanEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Someone who never finished sign-up goes to the code screen, where they can ask for a new code.
    if (error.code === "email_not_confirmed") redirect(verifyUrl(email, field(formData, "next") || undefined));
    // Same wording for wrong password and unknown email so accounts cannot be probed.
    return { error: "Wrong email or password." };
  }
  redirect(safeNext(field(formData, "next")));
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = cleanEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  if (!email) return { error: "Enter a valid email address." };
  const problem = newPasswordProblem(password, String(formData.get("confirm") ?? ""));
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/welcome` },
  });
  if (error) {
    if (error.code === "weak_password") return { error: "That password is too easy to guess. Try a longer or less common one." };
    if (error.code === "over_email_send_rate_limit" || error.status === 429) return { error: "Too many attempts. Wait a few minutes and try again." };
    return { error: "Could not create your account. Check your details and try again." };
  }
  // With "Confirm email" on there is no session yet: they enter the code we just emailed.
  if (!data.session) redirect(verifyUrl(email));
  redirect("/welcome");
}

/** Confirms an email address with the 6-digit code from the sign-up email, then signs the person in. */
export async function verifyEmail(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = cleanEmail(formData.get("email"));
  const code = cleanCode(formData.get("code"));
  if (!email) return { error: "Enter the email you signed up with." };
  if (!code) return { error: "Enter the 6-digit code from your email." };

  const supabase = await createClient();
  let { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) ({ error } = await supabase.auth.verifyOtp({ email, token: code, type: "signup" }));
  if (error) return { error: "That code is wrong or has expired. Check it, or ask for a new one." };
  redirect("/welcome");
}

/** Sends a fresh code. Says the same thing whether or not the address is waiting, so accounts cannot be probed. */
export async function resendCode(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = cleanEmail(formData.get("email"));
  if (!email) return { error: "Enter the email you signed up with." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/welcome` } });
  if (error && (error.code === "over_email_send_rate_limit" || error.status === 429)) return { error: "Please wait a minute before asking for another code." };
  return { message: "If that email is waiting to be confirmed, a new code is on its way. Check your inbox and spam." };
}

/** Starts a password reset. The answer never reveals whether an account exists. */
export async function requestPasswordReset(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = cleanEmail(formData.get("email"));
  if (!email) return { error: "Enter a valid email address." };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password` });
  if (error && (error.code === "over_email_send_rate_limit" || error.status === 429)) return { error: "Too many attempts. Wait a few minutes and try again." };
  redirect(`/reset-password?email=${encodeURIComponent(email)}&sent=1`);
}

/** Sets a new password using the 6-digit code from the reset email. */
export async function resetPassword(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = cleanEmail(formData.get("email"));
  const code = cleanCode(formData.get("code"));
  const password = String(formData.get("password") ?? "");
  if (!email) return { error: "Enter the email you used." };
  if (!code) return { error: "Enter the 6-digit code from your email." };
  const problem = newPasswordProblem(password, String(formData.get("confirm") ?? ""));
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
  if (verifyError) return { error: "That code is wrong or has expired. Ask for a new one." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // The code is used up, so tell them to start again rather than leave them stuck.
    await supabase.auth.signOut();
    if (error.code === "same_password") return { error: "Choose a password you have not used before. Ask for a new code to try again." };
    if (error.code === "weak_password") return { error: "That password is too easy to guess. Ask for a new code and choose another." };
    return { error: "Could not change your password. Ask for a new code and try again." };
  }
  redirect("/dashboard");
}
