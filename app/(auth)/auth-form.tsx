"use client";

import { useActionState } from "react";
import type { AuthFormState } from "./actions";

type Props = {
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  submitLabel: string;
  passwordAutoComplete: "current-password" | "new-password";
  next?: string;
};

// Plain, unstyled on purpose: the co-founder restyles this. Keep the field names and the action.
export function AuthForm({ action, submitLabel, passwordAutoComplete, next }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <p>
        <label>
          Email <input name="email" type="email" autoComplete="email" required />
        </label>
      </p>
      <p>
        <label>
          Password <input name="password" type="password" autoComplete={passwordAutoComplete} required minLength={8} />
        </label>
      </p>
      {state?.error ? <p role="alert">{state.error}</p> : null}
      {state?.message ? <p role="status">{state.message}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Please wait…" : submitLabel}
      </button>
    </form>
  );
}
