"use client";

import { useActionState, useState } from "react";
import { PasswordField } from "@/app/(auth)/forms";
import { deleteAccount } from "./actions";

export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deleteAccount, undefined);

  return (
    <section className="section" aria-labelledby="delete-title">
      <h2 className="section-title" id="delete-title">
        Delete account
      </h2>
      <div className="card card-pad stack">
        {open ? (
          <form action={action} className="form">
            <p>
              This permanently deletes your account, bets, slip drafts, preferences and Telegram link. It cannot be undone. Export your data first if you
              want a copy.
            </p>
            <div className="field">
              <label htmlFor="delete-confirm">Type DELETE to confirm</label>
              <input id="delete-confirm" name="confirm" className="input" autoComplete="off" autoCapitalize="characters" spellCheck={false} required />
            </div>
            <PasswordField id="delete-password" name="password" label="Your password" autoComplete="current-password" />
            {state?.error ? (
              <p className="banner banner-error" role="alert">
                {state.error}
              </p>
            ) : null}
            <div className="btn-row">
              <button type="submit" className="btn btn-danger-solid" disabled={pending}>
                {pending ? "Deleting" : "Delete my account"}
              </button>
              <button type="button" className="btn" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="muted">Erase your account and everything in it.</p>
            <span>
              <button type="button" className="btn btn-small" onClick={() => setOpen(true)}>
                Delete account
              </button>
            </span>
          </>
        )}
      </div>
    </section>
  );
}
