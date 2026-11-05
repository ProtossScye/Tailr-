"use client";

import { useActionState } from "react";
import { saveDisplayName } from "@/app/(app)/profile/actions";

/** Asks what to call the person. Skippable: without a name Tailr uses the start of their email. */
export function WelcomeName() {
  const [state, action, pending] = useActionState(saveDisplayName, undefined);
  return (
    <form action={action} className="form card card-pad">
      <div className="field">
        <label htmlFor="displayName">What should we call you?</label>
        <input id="displayName" name="displayName" className="input" maxLength={80} autoComplete="nickname" placeholder="Your name or nickname" required />
        {state?.error ? (
          <span className="field-error" role="alert">
            {state.error}
          </span>
        ) : null}
      </div>
      <button type="submit" className="btn btn-block" disabled={pending}>
        {pending ? "Saving" : "Save name"}
      </button>
    </form>
  );
}
