"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseOdds } from "@/lib/client/money";
import { messageFor } from "@/lib/client/api";
import type { ParsedSlipJson } from "@/lib/api/types";
import { CONFIDENCE_LABEL, MAX_PASTE_CHARS, combinedFromRead, isComplete, fetchAiStatus, missingNote, parsePastedText, readWithAi, toDraftLeg } from "@/lib/client/parse";
import { usePreferences } from "@/lib/client/hooks";
import { draftToText, loadDrafts, type DraftLeg, type SlipDraft } from "@/lib/client/drafts";
import { deleteSlip, fetchSlip, fetchSlips, moveLocalDraftsToAccount, saveSlip } from "@/lib/client/slips";
import { MAX_LEGS } from "@/lib/client/bet-form";
import { applyRemoval, suggestChanges, type Suggestion } from "@/lib/client/suggest";
import { COMMON_MARKETS, checkTarget, defaultDraftName, inAvoided, legOdds, outsidePreferred, slipCombinedOdds, sportChoices } from "@/lib/client/slip";
import { CopyIcon, EditIcon, PlusIcon, SlipArt, TrashIcon } from "@/components/icons";
import { MarketPicker, SportPicker } from "@/components/leg-pickers";
import { PageHeader, Segmented } from "@/components/ui";
import { SAME_GAME_NOTE, isSameGame, marketAfterSportChange, quickSports } from "@/lib/client/leg-entry";

type Mode = "build" | "adapt";
const blank = (): DraftLeg => ({ sport: "", event: "", market: "", selection: "", odds: "" });

export function CreateView({ draftId }: { draftId?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("build");
  const [legs, setLegs] = useState<DraftLeg[]>([]);
  const [composer, setComposer] = useState<DraftLeg>(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [composerErrors, setComposerErrors] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<{ id: string; name: string } | null>(null);
  const [drafts, setDrafts] = useState<SlipDraft[]>([]);
  const [draftsState, setDraftsState] = useState<"loading" | "error" | "ready">("loading");
  const [localCount, setLocalCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  // Adapt mode
  const [pasted, setPasted] = useState("");
  const [review, setReview] = useState<ParsedSlipJson | null>(null);
  const [reading, setReading] = useState(false);
  const [foundCount, setFoundCount] = useState(0);
  // Worked out when the text is read, so it stays put as selections are added to the slip.
  const [readCombined, setReadCombined] = useState<number | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
  // Suggested changes. Nothing is applied until the person accepts it.
  // "Same event as the last selection": stays on until switched off, so a run of picks from one game is quick.
  const [sameEvent, setSameEvent] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [readError, setReadError] = useState<string | null>(null);
  const [targetMin, setTargetMin] = useState("");
  const [targetMax, setTargetMax] = useState("");
  const [preferred, setPreferred] = useState<string[]>([]);
  // Saved preferences are only a starting point here. Changes made on this page apply to this slip only.
  const [prefs] = usePreferences();
  const appliedPrefs = useRef(false);
  const avoided = prefs.state === "ready" ? prefs.data.avoidedMarkets : [];
  const favoriteSports = prefs.state === "ready" ? prefs.data.favoriteSports : [];
  const usingSaved = prefs.state === "ready" && prefs.data.saved;

  useEffect(() => {
    if (prefs.state !== "ready" || appliedPrefs.current) return;
    appliedPrefs.current = true;
    const p = prefs.data;
    if (p.targetOddsMin !== null) setTargetMin(String(p.targetOddsMin));
    if (p.targetOddsMax !== null) setTargetMax(String(p.targetOddsMax));
    if (p.preferredMarkets.length > 0) setPreferred(p.preferredMarkets);
  }, [prefs]);

  const refreshDrafts = async () => {
    try {
      setDrafts(await fetchSlips());
      setDraftsState("ready");
    } catch (error) {
      setDraftsState("error");
      setNotice(messageFor(error));
    }
  };

  useEffect(() => {
    setLocalCount(loadDrafts().length);
    void refreshDrafts();
    if (draftId) {
      fetchSlip(draftId).then(
        (found) => {
          setLegs(found.legs);
          setCurrent({ id: found.id, name: found.name });
          setName(found.name);
        },
        () => setNotice("That draft could not be opened. It may have been deleted."),
      );
    }
    // refreshDrafts only uses stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  const combined = useMemo(() => slipCombinedOdds(legs), [legs]);
  const min = parseOdds(targetMin);
  const max = parseOdds(targetMax);
  const target = checkTarget(combined, min.ok ? min.value : null, max.ok ? max.value : null);
  const outside = useMemo(() => outsidePreferred(legs, preferred), [legs, preferred]);
  const unwanted = useMemo(() => inAvoided(legs, avoided), [legs, avoided]);
  const missingOdds = legs.filter((l) => legOdds(l) === null).length;

  const suggestions = useMemo(
    () =>
      suggestChanges(
        { legs, avoidedMarkets: avoided, preferredMarkets: preferred, targetMin: min.ok ? min.value : null, targetMax: max.ok ? max.value : null },
        dismissed,
      ),
    [legs, avoided, preferred, min, max, dismissed],
  );

  const acceptSuggestions = (list: Suggestion[]) => {
    const remove = [...new Set(list.flatMap((s) => s.remove))];
    if (remove.length === 0) return;
    setLegs((prev) => applyRemoval(prev, remove));
    setEditing(null);
    setNotice(`Removed ${remove.length} ${remove.length === 1 ? "selection" : "selections"} from this slip. Nothing is saved until you save the slip.`);
  };
  const rejectSuggestion = (key: string) => setDismissed((prev) => new Set([...prev, key]));

  useEffect(() => {
    if (legs.length === 0) setSameEvent(false);
  }, [legs.length]);

  const lastEvent = legs.length > 0 ? legs[legs.length - 1]!.event : "";
  const useSameEvent = sameEvent && editing === null && lastEvent !== "";
  const quick = useMemo(() => quickSports(legs, favoriteSports), [legs, favoriteSports]);

  const changeSport = (sport: string) => {
    setComposer((prev) => ({ ...prev, sport, market: marketAfterSportChange(prev.market, sport) }));
    setComposerErrors((prev) => (prev.sport ? { ...prev, sport: "" } : prev));
  };

  const setField = (key: keyof DraftLeg, value: string) => {
    setComposer((prev) => ({ ...prev, [key]: value }));
    setComposerErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  const addSelection = () => {
    const errors: Record<string, string> = {};
    const event = useSameEvent ? lastEvent : composer.event.trim();
    if (event === "") errors.event = "Enter the event, for example Arsenal v Chelsea.";
    if (composer.selection.trim() === "") errors.selection = "Enter your pick, for example Arsenal to win.";
    if (composer.odds.trim() !== "") {
      const odds = parseOdds(composer.odds);
      if (!odds.ok) errors.odds = odds.error;
    }
    if (Object.keys(errors).length > 0) {
      setComposerErrors(errors);
      return;
    }
    const clean: DraftLeg = {
      sport: composer.sport.trim(),
      event,
      market: composer.market.trim(),
      selection: composer.selection.trim(),
      odds: composer.odds.trim(),
    };
    if (editing === null && legs.length >= MAX_LEGS) {
      setNotice(`A slip can have at most ${MAX_LEGS} selections.`);
      return;
    }
    setLegs((prev) => (editing === null ? [...prev, clean] : prev.map((l, i) => (i === editing ? clean : l))));
    setEditing(null);
    // Keep sport and market: the next pick is often from the same place.
    setComposer({ ...blank(), sport: clean.sport, market: clean.market });
    setComposerErrors({});
    setNotice(null);
  };

  const editSelection = (index: number) => {
    const leg = legs[index];
    if (!leg) return;
    setComposer(leg);
    setEditing(index);
    setComposerErrors({});
    document.getElementById("composer-event")?.focus();
  };

  const removeSelection = (index: number) => {
    setLegs((prev) => prev.filter((_, i) => i !== index));
    if (editing === index) {
      setEditing(null);
      setComposer(blank());
    } else if (editing !== null && editing > index) {
      setEditing(editing - 1);
    }
  };

  /** Saves to the account. Returns the saved draft, or null (with a message) when it could not be saved. */
  const persist = async (): Promise<SlipDraft | null> => {
    if (legs.length === 0) return null;
    setBusy(true);
    try {
      const saved = await saveSlip(current?.id ?? null, name.trim() || defaultDraftName(legs, drafts.length), legs);
      setCurrent({ id: saved.id, name: saved.name });
      setName(saved.name);
      await refreshDrafts();
      return saved;
    } catch (error) {
      setNotice(`${messageFor(error)} Your slip is still here. You can copy the slip text meanwhile.`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    const saved = await persist();
    if (saved) setNotice("Draft saved to your account. It is not a placed bet.");
  };

  const onCopy = async () => {
    const text = draftToText(legs, combined);
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Slip text copied.");
    } catch {
      setNotice("Copying is blocked here. Select the text in the slip and copy it by hand.");
    }
  };

  const onPlaced = async () => {
    const saved = await persist();
    if (saved) router.push(`/bets/new?draft=${saved.id}`);
  };

  const clearAll = () => {
    setLegs([]);
    setComposer(blank());
    setEditing(null);
    setCurrent(null);
    setName("");
    setNotice(null);
  };

  const openDraft = (draft: SlipDraft) => {
    setLegs(draft.legs);
    setCurrent({ id: draft.id, name: draft.name });
    setName(draft.name);
    setEditing(null);
    setComposer(blank());
    setNotice(null);
  };

  const removeDraft = async (id: string) => {
    try {
      await deleteSlip(id);
      if (current?.id === id) setCurrent(null);
      await refreshDrafts();
    } catch (error) {
      setNotice(messageFor(error));
    }
  };

  const moveLocal = async () => {
    setBusy(true);
    try {
      const moved = await moveLocalDraftsToAccount();
      setNotice(`Moved ${moved} ${moved === 1 ? "draft" : "drafts"} to your account.`);
    } catch (error) {
      setNotice(`${messageFor(error)} Drafts not moved yet are still on this device.`);
    } finally {
      setLocalCount(loadDrafts().length);
      await refreshDrafts();
      setBusy(false);
    }
  };

  useEffect(() => {
    let live = true;
    fetchAiStatus()
      .then((s) => live && setAiAvailable(s.available))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const readText = async (useAi = false) => {
    if (pasted.trim() === "" || reading) return;
    setReading(true);
    setReadError(null);
    setReview(null);
    try {
      const result = await (useAi ? readWithAi(pasted) : parsePastedText(pasted));
      setFoundCount(result.selections.length);
      setReadCombined(combinedFromRead(result.selections));
      setReview(result);
    } catch (error) {
      setReadError(messageFor(error));
    } finally {
      setReading(false);
    }
  };

  const completeRows = review ? review.selections.filter(isComplete) : [];

  const addReadSelections = () => {
    if (!review) return;
    const room = MAX_LEGS - legs.length;
    const toAdd = completeRows.slice(0, Math.max(room, 0)).map(toDraftLeg);
    if (toAdd.length === 0) {
      setNotice(`A slip can have at most ${MAX_LEGS} selections.`);
      return;
    }
    setLegs((prev) => [...prev, ...toAdd]);
    setReview((prev) => (prev ? { ...prev, selections: prev.selections.filter((sel) => !isComplete(sel)) } : prev));
    setNotice(
      `Added ${toAdd.length} ${toAdd.length === 1 ? "selection" : "selections"} from your text${toAdd.length < completeRows.length ? ` (the slip is full, ${completeRows.length - toAdd.length} not added)` : ""}. Check each one below against your slip.`,
    );
  };

  const fillIn = (index: number) => {
    const row = review?.selections[index];
    if (!row) return;
    setComposer(toDraftLeg(row));
    setEditing(null);
    setComposerErrors({});
    setReview((prev) => (prev ? { ...prev, selections: prev.selections.filter((_, i) => i !== index) } : prev));
    document.getElementById("composer-event")?.focus();
  };

  const togglePreferred = (market: string) =>
    setPreferred((prev) => (prev.some((m) => m.toLowerCase() === market.toLowerCase()) ? prev.filter((m) => m.toLowerCase() !== market.toLowerCase()) : [...prev, market]));

  return (
    <div className="page">
      <PageHeader title="Create" sub="Build a slip or work on one you already have. Slips stay drafts until you record a bet you placed." />

      <Segmented<Mode>
        label="Mode"
        full
        value={mode}
        onChange={setMode}
        options={[
          { value: "build", label: "Create a slip" },
          { value: "adapt", label: "Adapt a slip" },
        ]}
      />

      {localCount > 0 ? (
        <div className="banner banner-note stack" role="status">
          <span>
            {localCount === 1 ? "1 draft is" : `${localCount} drafts are`} saved on this device only. Move {localCount === 1 ? "it" : "them"} to your account to keep {localCount === 1 ? "it" : "them"} safe and see {localCount === 1 ? "it" : "them"} on every device.
          </span>
          <span>
            <button type="button" className="btn btn-small" onClick={moveLocal} disabled={busy}>
              Move to my account
            </button>
          </span>
        </div>
      ) : null}

      <p className="banner">
        Tailr has no fixture or odds feed. You enter the events, markets and odds yourself, and Tailr only does the arithmetic on what you enter.
      </p>

      {mode === "adapt" ? (
        <section className="section" aria-labelledby="paste-title">
          <h2 className="section-title" id="paste-title">
            Your slip
          </h2>
          <div className="field">
            <label htmlFor="pasted">Paste the slip text</label>
            <textarea
              id="pasted"
              className="textarea"
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="Paste a slip from a chat or post"
              maxLength={MAX_PASTE_CHARS}
              style={{ minHeight: 120 }}
            />
            <span className="hint">
              Tailr reads the text and nothing else. It does not look up fixtures or odds, and it does not guess what is missing. Screenshots are not
              supported yet. The text is not saved.
            </span>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => readText(false)} disabled={reading || pasted.trim() === ""}>
              {reading ? "Reading" : "Read selections"}
            </button>
            {aiAvailable ? (
              <button type="button" className="btn" onClick={() => readText(true)} disabled={reading || pasted.trim() === ""}>
                Read with AI
              </button>
            ) : null}
          </div>
          {aiAvailable ? (
            <p className="hint">
              Read with AI sends this text to an AI service to read it. The result is checked against your text, anything not in it is removed, and it can still make mistakes. Limited to a few reads an hour.
            </p>
          ) : null}
          {readError ? (
            <p className="banner banner-error" role="alert">
              {readError}
            </p>
          ) : null}

          {review ? (
            <div className="card card-pad stack" aria-live="polite">
              <h3 style={{ fontSize: 16 }}>What Tailr read</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                This is a draft to check against your slip, not a placed bet. Anything marked needs your attention.
              </p>

              {review.warnings.length > 0 ? (
                <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
                  {review.warnings.map((w) => (
                    <li key={w} className="muted">
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}

              {review.bookmaker || review.bookingCode || review.totalOdds !== null || readCombined !== null ? (
                <dl className="kv">
                  {review.bookmaker ? (
                    <div>
                      <dt>Bookmaker named</dt>
                      <dd>{review.bookmaker}</dd>
                    </div>
                  ) : null}
                  {review.bookingCode ? (
                    <div>
                      <dt>Booking code in the text</dt>
                      <dd className="num">{review.bookingCode}</dd>
                    </div>
                  ) : null}
                  {review.totalOdds !== null ? (
                    <div>
                      <dt>Total odds the text states</dt>
                      <dd className="num">{review.totalOdds.toFixed(2)}</dd>
                    </div>
                  ) : null}
                  {readCombined !== null ? (
                    <div>
                      <dt>Combined odds from these selections</dt>
                      <dd className="num">{readCombined.toFixed(2)}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              {review.selections.length === 0 ? (
                <p>{foundCount === 0 ? "No selections found in that text. You can add them by hand below." : "Everything that was read has been added to your slip."}</p>
              ) : (
                <ul className="list">
                  {review.selections.map((row, i) => (
                    <li key={`${i}-${row.sourceLine}`} className="settings-row" style={{ cursor: "default", alignItems: "flex-start" }}>
                      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                        {row.event ?? "Event not found"}
                        <small>
                          {[row.sport, row.market].filter(Boolean).join(" · ")}
                          {[row.sport, row.market].some(Boolean) ? " · " : ""}
                          <strong style={{ fontWeight: 650 }}>{row.selection ?? "Pick not found"}</strong>
                          {" · "}
                          <span className="num">{row.odds !== null ? row.odds.toFixed(2) : "No odds"}</span>
                        </small>
                        <small>
                          {CONFIDENCE_LABEL[row.confidence]}
                          {missingNote(row) ? ` · ${missingNote(row)}` : ""}
                        </small>
                      </span>
                      {!isComplete(row) ? (
                        <button type="button" className="text-btn" onClick={() => fillIn(i)}>
                          Fill in
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {review.ignoredLines.length > 0 ? (
                <details>
                  <summary className="muted">
                    {review.ignoredLines.length} {review.ignoredLines.length === 1 ? "line" : "lines"} not used
                  </summary>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {review.ignoredLines.map((line, i) => (
                      <li key={`${i}-${line}`} className="muted" style={{ overflowWrap: "anywhere" }}>
                        {line}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <div className="btn-row">
                {completeRows.length > 0 ? (
                  <button type="button" className="btn btn-primary" onClick={addReadSelections}>
                    <PlusIcon /> Add {completeRows.length} to my slip
                  </button>
                ) : null}
                <button type="button" className="btn" onClick={() => setReview(null)}>
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="section" aria-labelledby="composer-title">
        <h2 className="section-title" id="composer-title">
          {editing === null ? "Add a selection" : `Edit selection ${editing + 1}`}
        </h2>
        <div className="card card-pad form">
          {legs.length > 0 && editing === null ? (
            <div className="field">
              <span className="label">This selection is</span>
              <Segmented<"same" | "new">
                label="Same event or a new one"
                full
                value={useSameEvent ? "same" : "new"}
                onChange={(v) => {
                  setSameEvent(v === "same");
                  // Another pick from the same game is the same sport as that game.
                  const lastSport = legs[legs.length - 1]?.sport ?? "";
                  if (v === "same" && lastSport !== "") changeSport(lastSport);
                }}
                options={[
                  { value: "same", label: "Same event" },
                  { value: "new", label: "New event" },
                ]}
              />
              {useSameEvent ? (
                <span className="hint">Another pick from {lastEvent}. Change the market and pick below.</span>
              ) : (
                <span className="hint">A different match. The sport stays as it is unless you change it.</span>
              )}
            </div>
          ) : null}
          <SportPicker id="composer-sport" value={composer.sport} onChange={changeSport} favorites={favoriteSports} quick={quick} />
          <MarketPicker id="composer-market" value={composer.market} onChange={(market) => setField("market", market)} sport={composer.sport} />
          {useSameEvent ? (
            <p className="field" style={{ margin: 0 }}>
              <span className="label">Event</span>
              <strong>{lastEvent}</strong>
            </p>
          ) : (
            <div className="field">
              <label htmlFor="composer-event">Event</label>
              <input
                id="composer-event"
                className="input"
                autoComplete="off"
                value={composer.event}
                onChange={(e) => setField("event", e.target.value)}
                placeholder="Arsenal v Chelsea"
                aria-invalid={composerErrors.event ? true : undefined}
                aria-describedby={composerErrors.event ? "composer-event-error" : undefined}
              />
              {composerErrors.event ? (
                <span className="field-error" id="composer-event-error">
                  {composerErrors.event}
                </span>
              ) : null}
            </div>
          )}
          <div className="field-row">
            <div className="field">
              <label htmlFor="composer-pick">Your pick</label>
              <input
                id="composer-pick"
                className="input"
                autoComplete="off"
                value={composer.selection}
                onChange={(e) => setField("selection", e.target.value)}
                placeholder="Arsenal to win"
                aria-invalid={composerErrors.selection ? true : undefined}
                aria-describedby={composerErrors.selection ? "composer-pick-error" : undefined}
              />
              {composerErrors.selection ? (
                <span className="field-error" id="composer-pick-error">
                  {composerErrors.selection}
                </span>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="composer-odds">Odds</label>
              <input
                id="composer-odds"
                className="input num"
                inputMode="decimal"
                autoComplete="off"
                value={composer.odds}
                onChange={(e) => setField("odds", e.target.value)}
                placeholder="1.85"
                aria-invalid={composerErrors.odds ? true : undefined}
                aria-describedby={composerErrors.odds ? "composer-odds-error" : undefined}
              />
              {composerErrors.odds ? (
                <span className="field-error" id="composer-odds-error">
                  {composerErrors.odds}
                </span>
              ) : null}
            </div>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={addSelection}>
              {editing === null ? (
                <>
                  <PlusIcon /> Add to slip
                </>
              ) : (
                "Update selection"
              )}
            </button>
            {editing !== null ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setEditing(null);
                  setComposer(blank());
                }}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="slip-title">
        <div className="section-head">
          <h2 className="section-title" id="slip-title">
            Slip draft
          </h2>
          <span className="muted num">
            {legs.length} {legs.length === 1 ? "selection" : "selections"}
          </span>
        </div>

        {legs.length === 0 ? (
          <div className="empty">
            <SlipArt className="empty-art" />
            <h3>Nothing on the slip yet</h3>
            <p>Add a selection above and it will show here with its odds.</p>
          </div>
        ) : (
          <>
            <ul className="card list">
              {legs.map((leg, i) => (
                <li key={`${i}-${leg.event}-${leg.selection}`} className="bet-row" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                  <div className="bet-main">
                    <div className="bet-title" style={{ whiteSpace: "normal" }}>
                      {leg.event}
                    </div>
                    <div className="bet-meta" style={{ whiteSpace: "normal" }}>
                      {[leg.sport, leg.market].filter(Boolean).join(" · ") || "No sport or market"}
                    </div>
                    <div style={{ fontWeight: 650, marginTop: 2 }}>{leg.selection}</div>
                    {unwanted.includes(i) ? <span className="pill pill-pending" style={{ marginTop: 6 }}>In a market you avoid</span> : null}
                    {outside.includes(i) && !unwanted.includes(i) ? <span className="pill pill-pending" style={{ marginTop: 6 }}>Outside your preferred markets</span> : null}
                    <div className="btn-row" style={{ marginTop: 4 }}>
                      <button type="button" className="text-btn" onClick={() => editSelection(i)} aria-label={`Edit selection ${i + 1}`}>
                        <EditIcon style={{ width: 15, height: 15, verticalAlign: -2 }} /> Edit
                      </button>
                      <button type="button" className="text-btn danger" onClick={() => removeSelection(i)} aria-label={`Remove selection ${i + 1}`}>
                        <TrashIcon style={{ width: 15, height: 15, verticalAlign: -2 }} /> Remove
                      </button>
                    </div>
                  </div>
                  <span className="bet-amount num">{legOdds(leg) !== null ? (legOdds(leg) as number).toFixed(2) : "No odds"}</span>
                </li>
              ))}
            </ul>

            <div className="card card-pad stack">
              <div className="kv">
                <div>
                  <dt>Combined odds</dt>
                  <dd className="num">{combined !== null ? combined.toFixed(2) : "Not available"}</dd>
                </div>
              </div>
              {isSameGame(legs) ? (
                <p className="banner banner-note" style={{ fontSize: 13 }}>
                  {SAME_GAME_NOTE}
                </p>
              ) : null}
              {combined === null ? (
                <p className="muted">
                  {missingOdds > 0
                    ? `Add odds to ${missingOdds === 1 ? "the selection" : `all ${missingOdds} selections`} without them to see combined odds.`
                    : "Combined odds appear once every selection has odds."}
                </p>
              ) : null}
              <p className="muted" style={{ fontSize: 13 }}>
                These are your own entries, not a placed bet. Check markets and odds with your bookmaker. Lower combined odds do not guarantee a win.
              </p>
            </div>

            {mode === "adapt" ? (
              <div className="card card-pad stack">
                <h3 style={{ fontSize: 16 }}>Shape it to your preferences</h3>
                <p className="muted" style={{ fontSize: 13 }}>
                  {usingSaved
                    ? "Starting from your saved preferences. Changes here apply to this slip only."
                    : "Optional. Save these once and they will be filled in for you."}{" "}
                  <Link href="/profile/preferences" className="link-more">
                    {usingSaved ? "Edit saved preferences" : "Set preferences"}
                  </Link>
                </p>
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="target-min">Target odds from</label>
                    <input id="target-min" className="input num" inputMode="decimal" value={targetMin} onChange={(e) => setTargetMin(e.target.value)} placeholder="2.00" aria-invalid={targetMin.trim() !== "" && !min.ok ? true : undefined} />
                  </div>
                  <div className="field">
                    <label htmlFor="target-max">to</label>
                    <input id="target-max" className="input num" inputMode="decimal" value={targetMax} onChange={(e) => setTargetMax(e.target.value)} placeholder="5.00" aria-invalid={targetMax.trim() !== "" && !max.ok ? true : undefined} />
                  </div>
                </div>
                {(targetMin.trim() !== "" && !min.ok) || (targetMax.trim() !== "" && !max.ok) ? (
                  <p className="field-error">Use decimal odds like 2.00.</p>
                ) : null}
                {target.kind === "unknown" ? <p className="muted">Add odds to every selection to compare with your target.</p> : null}
                {target.kind === "within" ? <p className="gain num">Combined odds {target.combined.toFixed(2)} are inside your target range.</p> : null}
                {target.kind === "below" ? <p className="num">Combined odds {target.combined.toFixed(2)} are {target.by.toFixed(2)} below your target.</p> : null}
                {target.kind === "above" ? <p className="num">Combined odds {target.combined.toFixed(2)} are {target.by.toFixed(2)} above your target.</p> : null}
                <div className="field">
                  <span className="label">Preferred markets</span>
                  <ul className="tag-list">
                    {[...COMMON_MARKETS, ...preferred.filter((p) => !COMMON_MARKETS.some((m) => m.toLowerCase() === p.toLowerCase()))].map((m) => (
                      <li key={m}>
                        <button type="button" className="tab" aria-pressed={preferred.some((p) => p.toLowerCase() === m.toLowerCase())} onClick={() => togglePreferred(m)}>
                          {m}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <span className="hint">
                    Selections in other markets are marked on the slip. This only points them out; nothing is removed.
                    {avoided.length > 0 ? ` Selections in markets you avoid (${avoided.join(", ")}) are marked too.` : ""}
                  </span>
                </div>
              </div>
            ) : null}

            {mode === "adapt" ? (
              <div className="card card-pad stack" aria-live="polite">
                <h3 style={{ fontSize: 16 }}>Suggested changes</h3>
                {!suggestOpen ? (
                  <>
                    <p className="muted" style={{ fontSize: 13 }}>
                      Tailr can point out selections to take out, based on your own entries and the preferences above. It only ever suggests removing a selection, and nothing changes until you accept it.
                    </p>
                    <div className="btn-row">
                      <button type="button" className="btn" onClick={() => setSuggestOpen(true)}>
                        Suggest changes
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {suggestions.suggestions.length === 0 ? <p className="muted">No changes to suggest right now.</p> : null}
                    <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {suggestions.suggestions.map((s) => (
                        <li key={s.key} className="card card-pad stack" style={{ gap: 8 }}>
                          <p>{s.reason}</p>
                          <p className="muted" style={{ fontSize: 13 }}>
                            {s.tradeoff}
                          </p>
                          <div>
                            <span className="label">Would remove</span>
                            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                              {s.remove.map((i) => (
                                <li key={i} style={{ textDecoration: "line-through" }}>
                                  {legs[i]?.event}: {legs[i]?.selection}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="btn-row">
                            <button type="button" className="btn btn-primary" onClick={() => acceptSuggestions([s])}>
                              Accept
                            </button>
                            <button type="button" className="btn" onClick={() => rejectSuggestion(s.key)}>
                              Keep it
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {suggestions.notes.map((n) => (
                      <p key={n} className="muted" style={{ fontSize: 13 }}>
                        {n}
                      </p>
                    ))}
                    <p className="muted" style={{ fontSize: 13 }}>
                      Nothing is added: Tailr has no fixture or odds feed, so it never picks a selection or changes your odds for you.
                    </p>
                    <div className="btn-row">
                      {suggestions.suggestions.length > 1 ? (
                        <button type="button" className="btn btn-primary" onClick={() => acceptSuggestions(suggestions.suggestions)}>
                          Accept all
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setSuggestOpen(false);
                          setDismissed(new Set());
                        }}
                      >
                        Done
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : null}

            <div className="card card-pad form">
              <div className="field">
                <label htmlFor="draft-name">Draft name</label>
                <input id="draft-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultDraftName(legs, drafts.length)} />
              </div>
              {notice ? (
                <p className="banner banner-note" role="status">
                  {notice}
                </p>
              ) : null}
              <div className="btn-row">
                <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy}>
                  Save as draft
                </button>
                <button type="button" className="btn" onClick={onCopy}>
                  <CopyIcon /> Copy slip text
                </button>
                <button type="button" className="btn" onClick={clearAll}>
                  Clear
                </button>
              </div>
              <hr className="divider" />
              <div className="stack">
                <p className="muted">Placed this slip with your bookmaker? Record it as a bet. You will confirm it first, and it starts as pending.</p>
                <span>
                  <button type="button" className="btn" onClick={onPlaced} disabled={busy}>
                    I placed this, record the bet
                  </button>
                </span>
              </div>
              <p className="muted" style={{ fontSize: 13 }}>
                Drafts are saved to your account, and only you can see them.
              </p>
            </div>
          </>
        )}
      </section>

      {draftsState === "loading" ? (
        <p className="muted" role="status">
          Loading your drafts
        </p>
      ) : null}

      {drafts.length > 0 ? (
        <section className="section" aria-labelledby="drafts-title">
          <h2 className="section-title" id="drafts-title">
            Your drafts
          </h2>
          <ul className="card list">
            {drafts.map((draft) => (
              <li key={draft.id} className="settings-row">
                <span>
                  {draft.name}
                  <small>
                    {draft.legs.length} {draft.legs.length === 1 ? "selection" : "selections"} · Draft, not a placed bet
                  </small>
                </span>
                <span className="btn-row">
                  <button type="button" className="text-btn" onClick={() => openDraft(draft)}>
                    Open
                  </button>
                  <button type="button" className="text-btn danger" onClick={() => void removeDraft(draft.id)} aria-label={`Delete draft ${draft.name}`}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
