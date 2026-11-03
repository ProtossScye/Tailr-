"use client";

import { useActionState } from "react";
import type { AuthFormState } from "./actions";

type Props = {
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  passwordAutoComplete: "current-password" | "new-password";
  next?: string;
};

// Field names (email, password, next) and the action are part of the backend contract. Do not rename them.
export function AuthForm({ action, submitLabel, passwordAutoComplete, next }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="form" noValidate={false}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" className="input" name="email" type="email" autoComplete="email" inputMode="email" required />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          className="input"
          name="password"
          type="password"
          autoComplete={passwordAutoComplete}
          required
          minLength={8}
          aria-describedby="password-hint"
        />
        <span className="hint" id="password-hint">
          At least 8 characters.
        </span>
      </div>
      {state?.error ? (
        <p className="banner banner-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.message ? (
        <p className="banner banner-note" role="status">
          {state.message}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Please wait" : submitLabel}
      </button>
    </form>
  );
}
