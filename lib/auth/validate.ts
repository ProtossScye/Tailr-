/**
 * Checks for the account forms, kept as plain functions so they can be tested without a server.
 * Messages are written for the person filling in the form.
 */

export const MIN_PASSWORD = 8;
/** Supabase rejects passwords longer than 72 bytes, so say so up front rather than failing later. */
export const MAX_PASSWORD_BYTES = 72;

/** A trimmed, lower-cased email, or null if it does not look like one. */
export function cleanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

/** The message to show for a bad password, or null if it is fine. */
export function passwordProblem(value: unknown): string | null {
  if (typeof value !== "string" || value.length < MIN_PASSWORD) return `Use a password of at least ${MIN_PASSWORD} characters.`;
  if (new TextEncoder().encode(value).length > MAX_PASSWORD_BYTES) return "Use a shorter password (72 characters at most).";
  if (value.trim() === "") return "A password cannot be only spaces.";
  return null;
}

/**
 * The digits of an emailed code, or null. People paste codes with spaces or dashes ("123 456"), which
 * is fine. Supabase's code length is a dashboard setting (6 by default), so 6 to 10 digits are accepted.
 */
export function cleanCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.replace(/[\s-]/g, "");
  return /^\d{6,10}$/.test(code) ? code : null;
}

/** Problems with a new-password pair, as a single message, or null. */
export function newPasswordProblem(password: unknown, confirm: unknown): string | null {
  const problem = passwordProblem(password);
  if (problem) return problem;
  if (password !== confirm) return "The two passwords do not match.";
  return null;
}
