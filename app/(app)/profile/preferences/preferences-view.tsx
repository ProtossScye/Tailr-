"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { messageFor } from "@/lib/client/api";
import {
  DETAIL_LEVELS,
  SLIP_STYLES,
  addItem,
  buildPreferencesPayload,
  clearPreferences,
  emptyPreferencesForm,
  fetchPreferences,
  formFromPreferences,
  removeItem,
  savePreferences,
  type DetailLevelValue,
  type PreferencesFormValues,
  type SlipStyleValue,
} from "@/lib/client/preferences";
import { COMMON_MARKETS, COMMON_SPORTS } from "@/lib/client/slip";
import { ChevronLeftIcon } from "@/components/icons";
import { ErrorState, LoadingBlock, PageHeader, Segmented } from "@/components/ui";

/** Chips for the usual choices, plus anything else the person has added. Pressing a chip toggles it. */
function ChipPicker({
  id,
  label,
  hint,
  common,
  selected,
  onChange,
  addLabel,
  error,
}: {
  id: string;
  label: string;
  hint?: string;
  common: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
  error?: string;
}) {
  const [draft, setDraft] = useState("");
  const lower = new Set(common.map((c) => c.toLowerCase()));
  const options = [...common, ...selected.filter((s) => !lower.has(s.toLowerCase()))];
  const isOn = (value: string) => selected.some((s) => s.toLowerCase() === value.toLowerCase());
  const add = () => {
    onChange(addItem(selected, draft));
    setDraft("");
  };
  return (
    <div className="field">
      <span className="label" id={`${id}-label`}>
        {label}
      </span>
      <ul className="tag-list" aria-labelledby={`${id}-label`}>
        {options.map((option) => (
          <li key={option}>
            <button type="button" className="tab" aria-pressed={isOn(option)} onClick={() => onChange(isOn(option) ? removeItem(selected, option) : addItem(selected, option))}>
              {option}
            </button>
          </li>
        ))}
      </ul>
      <div className="btn-row">
        <input
          id={`${id}-add`}
          className="input"
          style={{ flex: 1, minWidth: 0 }}
          aria-label={addLabel}
          placeholder={addLabel}
          value={draft}
          maxLength={80}
          autoComplete="off"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add} disabled={draft.trim() === ""}>
          Add
        </button>
      </div>
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function PreferencesView() {
  const [load, setLoad] = useState<{ state: "loading" } | { state: "error"; message: string } | { state: "ready"; saved: boolean }>({ state: "loading" });
  const [values, setValues] = useState<PreferencesFormValues>(emptyPreferencesForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoad({ state: "loading" });
    fetchPreferences().then(
      (p) => {
        if (!live) return;
        setValues(formFromPreferences(p));
        setLoad({ state: "ready", saved: p.saved });
      },
      (error: unknown) => {
        if (live) setLoad({ state: "error", message: messageFor(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [tick]);

  const set = <K extends keyof PreferencesFormValues>(key: K, value: PreferencesFormValues[K]) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      // A market is either wanted or avoided, never both: choosing it on one side removes it from the other.
      if (key === "preferredMarkets") next.avoidedMarkets = prev.avoidedMarkets.filter((m) => !(value as string[]).some((p) => p.toLowerCase() === m.toLowerCase()));
      if (key === "avoidedMarkets") next.preferredMarkets = prev.preferredMarkets.filter((m) => !(value as string[]).some((a) => a.toLowerCase() === m.toLowerCase()));
      return next;
    });
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
    setNotice(null);
  };

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const built = buildPreferencesPayload(values);
    if (!built.ok) {
      setErrors(built.errors);
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const saved = await savePreferences(built.payload);
      setValues(formFromPreferences(saved));
      setLoad({ state: "ready", saved: saved.saved });
      setNotice("Preferences saved.");
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  const onClear = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const cleared = await clearPreferences();
      setValues(formFromPreferences(cleared));
      setLoad({ state: "ready", saved: false });
      setErrors({});
      setNotice("All preferences removed.");
    } catch (error) {
      setNotice(messageFor(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div>
        <Link href="/profile" className="link-more" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ChevronLeftIcon style={{ width: 18, height: 18 }} /> Profile
        </Link>
      </div>
      <PageHeader title="Betting preferences" sub="All optional. Tailr only uses these to point things out on your slips. You can change or remove them any time." />

      {load.state === "loading" ? <LoadingBlock label="Loading preferences" rows={4} /> : null}
      {load.state === "error" ? <ErrorState message={load.message} onRetry={() => setTick((n) => n + 1)} /> : null}

      {load.state === "ready" ? (
        <form className="stack" onSubmit={onSave} noValidate>
          <div className="card card-pad form">
            <ChipPicker
              id="sports"
              label="Favourite sports"
              common={COMMON_SPORTS}
              selected={values.favoriteSports}
              onChange={(next) => set("favoriteSports", next)}
              addLabel="Add another sport"
              hint="These appear first when you add a selection."
            />
          </div>

          <div className="card card-pad form">
            <ChipPicker
              id="preferred"
              label="Preferred markets"
              common={COMMON_MARKETS}
              selected={values.preferredMarkets}
              onChange={(next) => set("preferredMarkets", next)}
              addLabel="Add another market"
              hint="Selections in other markets are marked on your slip. Nothing is removed."
            />
            <ChipPicker
              id="avoided"
              label="Markets to avoid"
              common={COMMON_MARKETS}
              selected={values.avoidedMarkets}
              onChange={(next) => set("avoidedMarkets", next)}
              addLabel="Add another market"
              hint="Selections in these markets are marked on your slip."
              error={errors.avoidedMarkets}
            />
          </div>

          <div className="card card-pad form">
            <div className="field">
              <span className="label" id="style-label">
                Slip style
              </span>
              <Segmented<SlipStyleValue | "none">
                label="Slip style"
                full
                value={values.slipStyle ?? "none"}
                onChange={(next) => set("slipStyle", next === "none" ? null : next)}
                options={[{ value: "none", label: "No preference" }, ...SLIP_STYLES.map((s) => ({ value: s.value, label: s.label }))]}
              />
              <span className="hint">{SLIP_STYLES.find((s) => s.value === values.slipStyle)?.hint ?? "Used when you ask for suggested changes. Skip it if you like."}</span>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="pref-min">Target odds from</label>
                <input
                  id="pref-min"
                  className="input num"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="2.00"
                  value={values.targetMin}
                  onChange={(e) => set("targetMin", e.target.value)}
                  aria-invalid={errors.targetMin ? true : undefined}
                  aria-describedby={errors.targetMin ? "pref-min-error" : undefined}
                />
                {errors.targetMin ? (
                  <span className="field-error" id="pref-min-error">
                    {errors.targetMin}
                  </span>
                ) : null}
              </div>
              <div className="field">
                <label htmlFor="pref-max">to</label>
                <input
                  id="pref-max"
                  className="input num"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="5.00"
                  value={values.targetMax}
                  onChange={(e) => set("targetMax", e.target.value)}
                  aria-invalid={errors.targetMax ? true : undefined}
                  aria-describedby={errors.targetMax ? "pref-max-error" : undefined}
                />
                {errors.targetMax ? (
                  <span className="field-error" id="pref-max-error">
                    {errors.targetMax}
                  </span>
                ) : null}
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>
              A target range is a preference. Tailr compares your slip with it, and cannot promise that any odds are available or will win.
            </p>

            <div className="field">
              <span className="label">How much explanation</span>
              <Segmented<DetailLevelValue>
                label="How much explanation"
                full
                value={values.detailLevel}
                onChange={(next) => set("detailLevel", next)}
                options={DETAIL_LEVELS.map((d) => ({ value: d.value, label: d.label }))}
              />
            </div>
          </div>

          {notice ? (
            <p className="banner banner-note" role="status">
              {notice}
            </p>
          ) : null}

          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Saving" : "Save preferences"}
            </button>
            {load.saved ? (
              <button type="button" className="btn btn-danger" onClick={onClear} disabled={busy}>
                Remove all
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
