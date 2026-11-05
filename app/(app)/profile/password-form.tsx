"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PasswordField } from "@/app/(auth)/forms";
import { changePassword } from "./actions";

export function PasswordSection() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(changePassword, undefined);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.message) {
      form.current?.reset();
      setOpen(false);
    }
  }, [state]);

  return (
    <section className="section" aria-labelledby="password-title">
      <h2 className="section-title" id="password-title">
        Password
      </h2>
      <div className="card card-pad stack">
        {state?.message ? (
          <p className="banner banner-note" role="status">
            {state.message}
          </p>
        ) : null}
        {open ? (
          <form ref={form} action={action} className="form">
            <PasswordField id="current" name="current" label="Current password" autoComplete="current-password" />
            <PasswordField id="new-password" name="password" label="New password" autoComplete="new-password" hint="At least 8 characters." />
            <PasswordField id="confirm-password" name="confirm" label="Confirm new password" autoComplete="new-password" />
            {state?.error ? (
              <p className="banner banner-error" role="alert">
                {state.error}
              </p>
            ) : null}
            <div className="btn-row">
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? "Saving" : "Change password"}
              </button>
              <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="muted">Change the password you sign in with. Forgot it? Sign out and use Forgot password on the sign-in screen.</p>
            <span>
              <button type="button" className="btn btn-small" onClick={() => setOpen(true)}>
                Change password
              </button>
            </span>
          </>
        )}
      </div>
    </section>
  );
}
