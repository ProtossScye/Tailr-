"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendFeedback } from "./actions";

export function FeedbackSection() {
  const [state, action, pending] = useActionState(sendFeedback, undefined);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.message) form.current?.reset();
  }, [state]);

  return (
    <section className="section" aria-labelledby="feedback-title">
      <h2 className="section-title" id="feedback-title">
        Tell us what you think
      </h2>
      <div className="card card-pad stack">
        <form ref={form} action={action} className="form">
          <div className="field">
            <label htmlFor="feedback-kind">What kind of note is it?</label>
            <select id="feedback-kind" name="kind" className="input" defaultValue="idea">
              <option value="bug">Something is broken</option>
              <option value="idea">An idea or something missing</option>
              <option value="other">Something else</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="feedback-message">Your note</label>
            <textarea id="feedback-message" name="message" className="input" rows={4} maxLength={2000} required />
            <span className="hint">Please do not include passwords. Only the Tailr team can read this.</span>
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
          <span>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? "Sending" : "Send note"}
            </button>
          </span>
        </form>
      </div>
    </section>
  );
}
