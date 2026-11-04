"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Currency } from "@/lib/accounting";
import type { BetJson } from "@/lib/api/types";
import { ApiError, api, messageFor } from "@/lib/client/api";
import {
  MAX_LEGS,
  buildBetPayload,
  emptyForm,
  emptyLeg,
  legsCombinedOdds,
  mapIssues,
  valuesFromBet,
  type BetFormValues,
  type FormErrors,
  type LegValues,
} from "@/lib/client/bet-form";
import { isoToLagosLocal } from "@/lib/client/dates";
import { fetchSlip } from "@/lib/client/slips";
import { ChevronLeftIcon, PlusIcon } from "@/components/icons";
import { ErrorState, LoadingBlock, Segmented } from "@/components/ui";

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error ? (
        <span className="hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

const describe = (id: string, error?: string, hint?: string) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

export function BetForm({ mode, betId, initial, draftId }: { mode: "create" | "edit"; betId?: string; initial?: BetFormValues; draftId?: string }) {
  const router = useRouter();
  const [values, setValues] = useState<BetFormValues>(() => initial ?? emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [fromDraft, setFromDraft] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  // Set only after the draft loaded. Sent with the bet once the person confirms they placed it.
  const [linkedDraft, setLinkedDraft] = useState<string | null>(null);
  const [maxPlaced, setMaxPlaced] = useState<string | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setMaxPlaced(isoToLagosLocal(new Date()));
  }, []);

  // Bring a saved draft over as a starting point. The person still has to confirm they placed it.
  useEffect(() => {
    if (mode !== "create" || !draftId) return;
    let cancelled = false;
    fetchSlip(draftId).then(
      (draft) => {
        if (cancelled) return;
        setFromDraft(true);
        setLinkedDraft(draft.id);
        setValues((prev) => ({
          ...prev,
          legs: draft.legs.length > 0 ? draft.legs.map((l) => ({ sport: l.sport, event: l.event, market: l.market, selection: l.selection, odds: l.odds })) : prev.legs,
        }));
      },
      () => {
        if (!cancelled) setErrors({ form: "That draft could not be opened. You can still enter the bet by hand." });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [mode, draftId]);

  const set = <K extends keyof BetFormValues>(key: K, value: BetFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key as string] ? { ...prev, [key as string]: "" } : prev));
  };

  const setLeg = (index: number, patch: Partial<LegValues>) => {
    setValues((prev) => ({ ...prev, legs: prev.legs.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)) }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch)) {
        delete next[`legs.${index}.${key === "odds" ? "odds" : key}`];
      }
      return next;
    });
  };

  const addLeg = () => setValues((prev) => (prev.legs.length >= MAX_LEGS ? prev : { ...prev, legs: [...prev.legs, emptyLeg()] }));
  const removeLeg = (index: number) => setValues((prev) => ({ ...prev, legs: prev.legs.filter((_, i) => i !== index) }));

  const focusFirstError = () => {
    requestAnimationFrame(() => {
      const target = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], .banner-error');
      target?.scrollIntoView({ block: "center" });
      target?.focus?.();
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const built = buildBetPayload(values);
    const next: FormErrors = built.ok ? {} : { ...built.errors };
    if (fromDraft && !confirmed) next.confirm = "Confirm that you placed this bet to record it.";
    if (Object.keys(next).length > 0) {
      setErrors(next);
      focusFirstError();
      return;
    }
    if (!built.ok) return;

    setSaving(true);
    setErrors({});
    try {
      const saved =
        mode === "create"
          ? await api<BetJson>("/api/bets", { method: "POST", body: linkedDraft && confirmed ? { ...built.payload, slipDraftId: linkedDraft } : built.payload })
          : await api<BetJson>(`/api/bets/${betId}`, { method: "PATCH", body: built.payload });
      router.push(`/bets/${saved.id}?saved=${mode === "create" ? "created" : "updated"}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.code === "validation_failed") {
        const mapped = mapIssues(error.issues);
        setErrors(Object.keys(mapped).length > 0 ? mapped : { form: error.message });
      } else {
        setErrors({ form: messageFor(error) });
      }
      setSaving(false);
      focusFirstError();
    }
  };

  const symbol = values.currency === "NGN" ? "₦" : "$";
  const combined = legsCombinedOdds(values.legs);
  const backHref = mode === "edit" && betId ? `/bets/${betId}` : "/bets";

  return (
    <div className="page">
      <div>
        <Link href={backHref} className="link-more" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ChevronLeftIcon style={{ width: 18, height: 18 }} /> {mode === "edit" ? "Back to bet" : "Bets"}
        </Link>
      </div>
      <header>
        <h1 className="page-title">{mode === "create" ? "Add bet" : "Edit bet"}</h1>
        <p className="page-sub">
          {mode === "create" ? "Record a bet you have placed. Saved slip drafts are never turned into bets automatically." : "Change the details. To change the result, use Settle on the bet."}
        </p>
      </header>

      <form ref={formRef} className="form" onSubmit={submit} noValidate>
        {errors.form ? (
          <p className="banner banner-error" role="alert" tabIndex={-1}>
            {errors.form}
          </p>
        ) : null}

        {fromDraft ? (
          <div className="banner banner-note stack">
            <span>This started as a slip draft. A draft is not a placed bet until you say so.</span>
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontWeight: 650 }}>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => {
                  setConfirmed(e.target.checked);
                  setErrors((prev) => ({ ...prev, confirm: "" }));
                }}
                aria-invalid={errors.confirm ? true : undefined}
                style={{ marginTop: 3 }}
              />
              I placed this bet
            </label>
            {errors.confirm ? <span className="field-error">{errors.confirm}</span> : null}
          </div>
        ) : null}

        <div className="field">
          <span className="label" id="currency-label">
            Currency
          </span>
          <Segmented<Currency>
            label="Currency"
            value={values.currency}
            onChange={(c) => set("currency", c)}
            options={[
              { value: "NGN", label: "NGN (₦)" },
              { value: "USD", label: "USD ($)" },
            ]}
            full
          />
          {errors.currency ? <span className="field-error">{errors.currency}</span> : null}
        </div>

        <div className="field-row">
          <Field id="stake" label="Stake" error={errors.stake} hint="What you staked, for example 5000 or 5,000.50">
            <div className="money-input">
              <span className="prefix" aria-hidden="true">
                {symbol}
              </span>
              <input
                id="stake"
                className="input num"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                value={values.stake}
                onChange={(e) => set("stake", e.target.value)}
                aria-invalid={errors.stake ? true : undefined}
                aria-describedby={describe("stake", errors.stake, "x")}
              />
            </div>
          </Field>
          <Field id="placed" label="Placed on" error={errors.placedAt} hint="Lagos time">
            <input
              id="placed"
              className="input"
              type="datetime-local"
              max={maxPlaced}
              value={values.placedLocal}
              onChange={(e) => set("placedLocal", e.target.value)}
              aria-invalid={errors.placedAt ? true : undefined}
              aria-describedby={describe("placed", errors.placedAt, "x")}
            />
          </Field>
        </div>

        <Field id="bookmaker" label="Bookmaker (optional)" error={errors.bookmaker}>
          <input
            id="bookmaker"
            className="input"
            autoComplete="off"
            placeholder="The name you want to track it under"
            value={values.bookmaker}
            onChange={(e) => set("bookmaker", e.target.value)}
            aria-invalid={errors.bookmaker ? true : undefined}
            aria-describedby={describe("bookmaker", errors.bookmaker)}
          />
        </Field>

        <section className="stack" aria-labelledby="legs-title">
          <div className="section-head">
            <h2 className="section-title" id="legs-title">
              Selections
            </h2>
            <span className="muted num">{values.legs.length} of {MAX_LEGS}</span>
          </div>
          {errors.legs ? <p className="field-error">{errors.legs}</p> : null}
          {values.legs.map((leg, i) => (
            <fieldset key={i} className="leg" style={{ margin: 0, minWidth: 0 }}>
              <legend className="sr-only">Selection {i + 1}</legend>
              <div className="leg-head" aria-hidden="true">
                <strong>Selection {i + 1}</strong>
                {values.legs.length > 1 ? (
                  <button type="button" className="text-btn danger" onClick={() => removeLeg(i)} aria-label={`Remove selection ${i + 1}`}>
                    Remove
                  </button>
                ) : null}
              </div>
              {values.legs.length > 1 ? (
                <button type="button" className="sr-only" onClick={() => removeLeg(i)}>
                  Remove selection {i + 1}
                </button>
              ) : null}
              <Field id={`event-${i}`} label="Event" error={errors[`legs.${i}.event`]}>
                <input
                  id={`event-${i}`}
                  className="input"
                  autoComplete="off"
                  placeholder="Arsenal v Chelsea"
                  value={leg.event}
                  onChange={(e) => setLeg(i, { event: e.target.value })}
                  aria-invalid={errors[`legs.${i}.event`] ? true : undefined}
                  aria-describedby={describe(`event-${i}`, errors[`legs.${i}.event`])}
                />
              </Field>
              <Field id={`pick-${i}`} label="Your pick" error={errors[`legs.${i}.selection`]}>
                <input
                  id={`pick-${i}`}
                  className="input"
                  autoComplete="off"
                  placeholder="Arsenal to win"
                  value={leg.selection}
                  onChange={(e) => setLeg(i, { selection: e.target.value })}
                  aria-invalid={errors[`legs.${i}.selection`] ? true : undefined}
                  aria-describedby={describe(`pick-${i}`, errors[`legs.${i}.selection`])}
                />
              </Field>
              <div className="field-row">
                <Field id={`sport-${i}`} label="Sport (optional)" error={errors[`legs.${i}.sport`]}>
                  <input
                    id={`sport-${i}`}
                    className="input"
                    autoComplete="off"
                    placeholder="Football"
                    value={leg.sport}
                    onChange={(e) => setLeg(i, { sport: e.target.value })}
                    aria-invalid={errors[`legs.${i}.sport`] ? true : undefined}
                    aria-describedby={describe(`sport-${i}`, errors[`legs.${i}.sport`])}
                  />
                </Field>
                <Field id={`market-${i}`} label="Market (optional)" error={errors[`legs.${i}.market`]}>
                  <input
                    id={`market-${i}`}
                    className="input"
                    autoComplete="off"
                    placeholder="Match result"
                    value={leg.market}
                    onChange={(e) => setLeg(i, { market: e.target.value })}
                    aria-invalid={errors[`legs.${i}.market`] ? true : undefined}
                    aria-describedby={describe(`market-${i}`, errors[`legs.${i}.market`])}
                  />
                </Field>
              </div>
              <Field id={`odds-${i}`} label="Odds (optional)" error={errors[`legs.${i}.odds`]} hint="Decimal odds, for example 1.85">
                <input
                  id={`odds-${i}`}
                  className="input num"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="1.85"
                  value={leg.odds}
                  onChange={(e) => setLeg(i, { odds: e.target.value })}
                  aria-invalid={errors[`legs.${i}.odds`] ? true : undefined}
                  aria-describedby={describe(`odds-${i}`, errors[`legs.${i}.odds`], "x")}
                />
              </Field>
            </fieldset>
          ))}
          {values.legs.length < MAX_LEGS ? (
            <button type="button" className="btn btn-block" onClick={addLeg}>
              <PlusIcon /> Add another selection
            </button>
          ) : null}
        </section>

        <Field id="total-odds" label="Total odds (optional)" error={errors.totalOdds} hint="The odds the whole bet was placed at">
          <input
            id="total-odds"
            className="input num"
            inputMode="decimal"
            autoComplete="off"
            placeholder="3.40"
            value={values.totalOdds}
            onChange={(e) => set("totalOdds", e.target.value)}
            aria-invalid={errors.totalOdds ? true : undefined}
            aria-describedby={describe("total-odds", errors.totalOdds, "x")}
          />
        </Field>
        {combined !== null && values.totalOdds.trim() !== String(combined) ? (
          <p className="muted num" style={{ marginTop: -12 }}>
            Your selections multiply to {combined.toFixed(2)}.{" "}
            <button type="button" className="text-btn" onClick={() => set("totalOdds", String(combined))}>
              Use this as total odds
            </button>
          </p>
        ) : null}

        <Field id="notes" label="Notes (optional)" error={errors.notes}>
          <textarea
            id="notes"
            className="textarea"
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            aria-invalid={errors.notes ? true : undefined}
            aria-describedby={describe("notes", errors.notes)}
          />
        </Field>

        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving" : mode === "create" ? "Save bet" : "Save changes"}
          </button>
          <Link href={backHref} className="btn">
            Cancel
          </Link>
        </div>
        {mode === "create" ? <p className="muted" style={{ fontSize: 13 }}>It is saved as pending. You settle it later, when the result is in.</p> : null}
      </form>
    </div>
  );
}

/** Loads a bet and renders the form filled in. */
export function EditBet({ id }: { id: string }) {
  const [state, setState] = useState<{ state: "loading" } | { state: "error"; message: string } | { state: "ready"; bet: BetJson }>({ state: "loading" });

  useEffect(() => {
    let live = true;
    api<BetJson>(`/api/bets/${id}`).then(
      (bet) => live && setState({ state: "ready", bet }),
      (error: unknown) => live && setState({ state: "error", message: messageFor(error) }),
    );
    return () => {
      live = false;
    };
  }, [id]);

  if (state.state === "loading") return <LoadingBlock label="Loading bet" rows={5} />;
  if (state.state === "error") return <ErrorState message={state.message} />;
  return <BetForm mode="edit" betId={id} initial={valuesFromBet(state.bet)} />;
}
