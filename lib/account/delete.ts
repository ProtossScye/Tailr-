export interface DeleteAccountDeps {
  /** The signed-in person, or null. */
  currentUser(): Promise<{ id: string; email: string } | null>;
  /** Checks the password for this email. Must not throw for a wrong password. */
  passwordIsRight(email: string, password: string): Promise<boolean>;
  /** Removes the account; the database removes everything it owns. null when this server cannot do it. */
  deleteUser: ((id: string) => Promise<void>) | null;
}

export type DeleteAccountResult = { ok: true } | { ok: false; error: string };

const fail = (error: string): DeleteAccountResult => ({ ok: false, error });

/**
 * Deletes the signed-in person's account. They must type DELETE and give their password, so a
 * stolen open session or a stray tap cannot erase an account. Nothing is deleted until both checks pass.
 */
export async function deleteMyAccount(deps: DeleteAccountDeps, input: { confirm: unknown; password: unknown }): Promise<DeleteAccountResult> {
  if (deps.deleteUser === null) return fail("Deleting accounts is not switched on yet. Ask us to delete it for you.");
  if (typeof input.confirm !== "string" || input.confirm.trim().toUpperCase() !== "DELETE") return fail("Type DELETE to confirm.");
  if (typeof input.password !== "string" || input.password === "") return fail("Enter your password to confirm.");

  const user = await deps.currentUser();
  if (user === null) return fail("Sign in to continue.");

  let right = false;
  try {
    right = await deps.passwordIsRight(user.email, input.password);
  } catch {
    right = false;
  }
  if (!right) return fail("That password is not right.");

  try {
    await deps.deleteUser(user.id);
  } catch {
    return fail("We could not delete your account. Try again, or ask us to do it for you.");
  }
  return { ok: true };
}
