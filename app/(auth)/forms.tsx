"use client";

import { useActionState, useState } from "react";
import type { AuthFormState } from "./actions";
import Link from "next/link";
import { requestPasswordReset, resendCode, resetPassword, signIn, signUp, verifyEmail } from "./actions";

type Action = (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;

function Notices({ state }: { state: AuthFormState }) {
  return (
    <>
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
    </>
  );
}

export function EmailField({ defaultValue = "", id = "email" }: { defaultValue?: string; id?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>Email</label>
      <input id={id} className="input" name="email" type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} defaultValue={defaultValue} required />
    </div>
  );
}

/** A password box with a Show button, because typing a hidden password on a phone is error-prone. */
export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  hint?: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pw-wrap">
        <input id={id} className="input" name={name} type={shown ? "text" : "password"} autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} required minLength={8} aria-describedby={hint ? `${id}-hint` : undefined} />
        <button type="button" className="pw-toggle" onClick={() => setShown((s) => !s)} aria-pressed={shown} aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {hint ? (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function CodeField({ id = "code" }: { id?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>6-digit code</label>
      <input id={id} className="input code-input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 \-]*" maxLength={14} placeholder="000000" required />
    </div>
  );
}

function useAction(action: Action) {
  return useActionState(action, undefined);
}

export function SignInForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useAction(signIn);
  return (
    <form action={formAction} className="form">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <EmailField />
      <PasswordField id="password" name="password" label="Password" autoComplete="current-password" />
      <Notices state={state} />
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Please wait" : "Sign in"}
      </button>
      <p className="auth-foot" style={{ textAlign: "center" }}>
        <Link href="/forgot-password">Forgot password?</Link>
      </p>
    </form>
  );
}

export function SignUpForm({ inviteRequired = false }: { inviteRequired?: boolean }) {
  const [state, formAction, pending] = useAction(signUp);
  return (
    <form action={formAction} className="form">
      {inviteRequired ? (
        <div className="field">
          <label htmlFor="invite">Invite code</label>
          <input id="invite" className="input" name="invite" autoComplete="off" autoCapitalize="none" spellCheck={false} required />
          <span className="hint">Tailr is invite-only while we test. Use the code you were sent.</span>
        </div>
      ) : null}
      <EmailField />
      <PasswordField id="password" name="password" label="Password" autoComplete="new-password" hint="At least 8 characters." />
      <PasswordField id="confirm" name="confirm" label="Confirm password" autoComplete="new-password" />
      <Notices state={state} />
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Please wait" : "Create account"}
      </button>
      <p className="auth-foot" style={{ textAlign: "center" }}>
        <Link href="/privacy">How Tailr handles your data</Link>
      </p>
      <p className="hint">We will email you a 6-digit code to confirm your address.</p>
    </form>
  );
}

export function VerifyForm({ email, resent }: { email: string; resent?: boolean }) {
  const [state, formAction, pending] = useAction(verifyEmail);
  const [resendState, resendAction, resending] = useAction(resendCode);
  return (
    <div className="stack">
      <form action={formAction} className="form">
        <EmailField defaultValue={email} />
        <CodeField />
        <Notices state={state} />
        <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Checking" : "Confirm email"}
        </button>
      </form>
      <form action={resendAction} className="form">
        <input type="hidden" name="email" value={email} />
        <Notices state={resendState} />
        <button type="submit" className="btn btn-block" disabled={resending || email === ""}>
          {resending ? "Sending" : "Send a new code"}
        </button>
        {resent ? null : <p className="hint">Codes expire after a while. A new code replaces the old one.</p>}
      </form>
    </div>
  );
}

export function ForgotForm() {
  const [state, formAction, pending] = useAction(requestPasswordReset);
  return (
    <form action={formAction} className="form">
      <EmailField />
      <Notices state={state} />
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Please wait" : "Email me a code"}
      </button>
    </form>
  );
}

export function ResetForm({ email }: { email: string }) {
  const [state, formAction, pending] = useAction(resetPassword);
  return (
    <form action={formAction} className="form">
      <EmailField defaultValue={email} />
      <CodeField />
      <PasswordField id="password" name="password" label="New password" autoComplete="new-password" hint="At least 8 characters." />
      <PasswordField id="confirm" name="confirm" label="Confirm new password" autoComplete="new-password" />
      <Notices state={state} />
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Please wait" : "Set new password"}
      </button>
    </form>
  );
}
