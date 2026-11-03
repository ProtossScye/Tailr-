"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/lib/accounting";
import type { BetJson } from "@/lib/api/types";
import { ApiError, api, messageFor } from "@/lib/client/api";
import { formatDay, formatWhen, isoToLagosLocal, lagosLocalToIso } from "@/lib/client/dates";
import { minorToInput, parseAmountToMinor } from "@/lib/client/money";
import { ChevronLeftIcon, EditIcon, TrashIcon } from "@/components/icons";
import { ErrorState, LoadingBlock, Segmented, Sheet, StatusPill, signedMoney, tone } from "@/components/ui";

type Outcome = "won" | "lost" | "void";

export function BetDetail({ id, saved }: { id: string; saved?: "created" | "updated" }) {
  const router = useRouter();
  const [state, setState] = useState<{ state: "loading" } | { state: "error"; message: string; notFound: boolean } | { state: "ready"; bet: BetJson }>({
    state: "loading",
  });
  const [settling, setSettling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string | null>(saved === "created" ? "Bet saved as pending." : saved === "updated" ? "Changes saved." : null);

  const load = useCallback(() => {
    setState({ state: "loading" });
    api<BetJson>(`/api/bets/${id}`).then(
      (bet) => setState({ state: "ready", bet }),
      (error: unknown) => setState({ state: "error", message: messageFor(error), notFound: error instanceof ApiError && error.status === 404 }),
    );
  }, [id]);

  useEffect(load, [load]);

  const back = (
    <div>
      <Link href="/bets" className="link-more" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <ChevronLeftIcon style={{ width: 18, height: 18 }} /> Bets
      </Link>
    </div>
  );

  if (state.state === "loading") {
    return (
      <div className="page">
        {back}
        <LoadingBlock label="Loading bet" rows={5} />
      </div>
    );
  }
  if (state.state === "error") {
    return (
      <div className="page">
        {back}
        <ErrorState message={state.message} onRetry={state.notFound ? undefined : load} />
      </div>
    );
  }

  const bet = state.bet;
  const profit = bet.netProfitMinor;

  return (
    <div className="page">
      {back}

      {notice ? (
        <p className="banner banner-note" role="status">
          {notice}
        </p>
      ) : null}

      <header className="stack">
        <div className="page-head">
          <h1 className="page-title">{bet.selections.length > 1 ? `${bet.selections.length}-selection bet` : (bet.selections[0]?.event ?? "Bet")}</h1>
          <StatusPill status={bet.status} />
        </div>
        {profit !== null ? (
          <p className={`hero-value num ${tone(profit)}`} style={{ margin: 0 }}>
            {signedMoney(profit, bet.currency)}
            <span className="muted" style={{ fontSize: 15, fontWeight: 600, marginLeft: 8 }}>
              net {profit < 0 ? "loss" : "profit"}
            </span>
          </p>
        ) : (
          <p className="muted">Pending. It counts towards profit, ROI and win rate once you settle it.</p>
        )}
      </header>

      <section className="section" aria-labelledby="legs-title">
        <h2 className="section-title" id="legs-title">
          {bet.selections.length > 1 ? "Selections" : "Selection"}
        </h2>
        <ul className="card list">
          {bet.selections.map((leg) => (
            <li key={leg.id} className="bet-row" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
              <div className="bet-main">
                <div className="bet-title" style={{ whiteSpace: "normal" }}>
                  {leg.event}
                </div>
                <div className="bet-meta" style={{ whiteSpace: "normal" }}>
                  {[leg.sport, leg.marketType].filter(Boolean).join(" · ") || "No sport or market recorded"}
                </div>
                <div style={{ marginTop: 4, fontWeight: 650 }}>{leg.selection}</div>
              </div>
              <span className="bet-amount num">{leg.oddsDecimal !== null ? leg.oddsDecimal.toFixed(2) : "No odds"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="details-title">
        <h2 className="section-title" id="details-title">
          Details
        </h2>
        <dl className="card card-pad kv">
          <div>
            <dt>Bookmaker</dt>
            <dd>{bet.bookmakerLabel ?? "Not recorded"}</dd>
          </div>
          <div>
            <dt>Stake</dt>
            <dd className="num">{formatMoney(bet.stakeMinor, bet.currency)}</dd>
          </div>
          <div>
            <dt>Total odds</dt>
            <dd className="num">{bet.decimalOdds !== null ? bet.decimalOdds.toFixed(2) : "Not recorded"}</dd>
          </div>
          {bet.grossReturnMinor !== null ? (
            <div>
              <dt>Total return</dt>
              <dd className="num">{formatMoney(bet.grossReturnMinor, bet.currency)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Placed</dt>
            <dd>{formatWhen(bet.placedAt)}</dd>
          </div>
          <div>
            <dt>Settled</dt>
            <dd>{bet.settledAt ? formatDay(bet.settledAt) : "Not settled yet"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <StatusPill status={bet.status} />
            </dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>User-reported</dd>
          </div>
        </dl>
        {bet.notes ? (
          <div className="card card-pad stack">
            <h3 style={{ fontSize: 15 }}>Notes</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>{bet.notes}</p>
          </div>
        ) : null}
        <p className="muted" style={{ fontSize: 13 }}>
          Reported by you. Tailr has not verified this with your bookmaker.
        </p>
      </section>

      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={() => setSettling(true)}>
          {bet.status === "pending" ? "Settle bet" : "Change result"}
        </button>
        <Link href={`/bets/${bet.id}/edit`} className="btn">
          <EditIcon /> Edit
        </Link>
        <button type="button" className="btn btn-danger" onClick={() => setDeleting(true)}>
          <TrashIcon /> Delete
        </button>
      </div>

      {settling ? (
        <SettleSheet
          bet={bet}
          onClose={() => setSettling(false)}
          onDone={(next) => {
            setState({ state: "ready", bet: next });
            setSettling(false);
            setNotice("Result saved.");
          }}
        />
      ) : null}
      {deleting ? (
        <DeleteSheet
          bet={bet}
          onClose={() => setDeleting(false)}
          onDone={() => {
            router.push("/bets");
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function SettleSheet({ bet, onClose, onDone }: { bet: BetJson; onClose: () => void; onDone: (bet: BetJson) => void }) {
  const [outcome, setOutcome] = useState<Outcome>(bet.status === "won" || bet.status === "lost" || bet.status === "void" ? bet.status : "won");
  const [ret, setRet] = useState(bet.grossReturnMinor !== null ? minorToInput(bet.grossReturnMinor) : "");
  const [when, setWhen] = useState(() => isoToLagosLocal(bet.settledAt ?? new Date()));
  const [error, setError] = useState<string | null>(null);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [whenError, setWhenError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const symbol = bet.currency === "NGN" ? "₦" : "$";

  const save = async () => {
    setError(null);
    setReturnError(null);
    setWhenError(null);
    const settledAt = lagosLocalToIso(when);
    if (settledAt === null) {
      setWhenError("Choose when it was settled.");
      return;
    }
    let body: Record<string, unknown> = { outcome, settledAt };
    if (outcome === "won") {
      const parsed = parseAmountToMinor(ret);
      if (!parsed.ok) {
        setReturnError(parsed.error);
        return;
      }
      if (parsed.minor <= bet.stakeMinor) {
        setReturnError(
          `A win must return more than the ${formatMoney(bet.stakeMinor, bet.currency)} stake. A bet that pays back its stake or less is recorded as void.`,
        );
        return;
      }
      body = { ...body, grossReturnMinor: parsed.minor };
    }
    setSaving(true);
    try {
      onDone(await api<BetJson>(`/api/bets/${bet.id}/settle`, { method: "POST", body }));
    } catch (e) {
      if (e instanceof ApiError && e.code === "validation_failed" && e.issues.length > 0) {
        const message = e.issues.map((i) => i.message).join(" ");
        if (e.issues.some((i) => /return/i.test(i.field))) setReturnError(message);
        else setError(message);
      } else {
        setError(messageFor(e));
      }
      setSaving(false);
    }
  };

  return (
    <Sheet title={bet.status === "pending" ? "Settle bet" : "Change result"} onClose={onClose}>
      <Segmented<Outcome>
        label="Result"
        full
        value={outcome}
        onChange={setOutcome}
        options={[
          { value: "won", label: "Won" },
          { value: "lost", label: "Lost" },
          { value: "void", label: "Void" },
        ]}
      />
      {outcome === "won" ? (
        <div className="field">
          <label htmlFor="return">Total return, stake included</label>
          <div className="money-input">
            <span className="prefix" aria-hidden="true">
              {symbol}
            </span>
            <input
              id="return"
              className="input num"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={ret}
              onChange={(e) => setRet(e.target.value)}
              aria-invalid={returnError ? true : undefined}
              aria-describedby={returnError ? "return-error" : "return-hint"}
            />
          </div>
          {returnError ? (
            <span className="field-error" id="return-error">
              {returnError}
            </span>
          ) : (
            <span className="hint" id="return-hint">
              What the bookmaker paid out in total. Your stake was {formatMoney(bet.stakeMinor, bet.currency)}.
            </span>
          )}
        </div>
      ) : (
        <p className="muted">
          {outcome === "lost" ? `The ${formatMoney(bet.stakeMinor, bet.currency)} stake is counted as a loss.` : "A void bet counts as nothing: no profit, no loss, and it is left out of ROI and win rate."}
        </p>
      )}
      <div className="field">
        <label htmlFor="settled-on">Settled on</label>
        <input
          id="settled-on"
          className="input"
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          aria-invalid={whenError ? true : undefined}
        />
        {whenError ? <span className="field-error">{whenError}</span> : <span className="hint">Lagos time. Profit is counted on this date.</span>}
      </div>
      {error ? (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Saving" : "Save result"}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={saving}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

function DeleteSheet({ bet, onClose, onDone }: { bet: BetJson; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api<{ deleted: true }>(`/api/bets/${bet.id}`, { method: "DELETE" });
      onDone();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        onDone();
        return;
      }
      setError(messageFor(e));
      setBusy(false);
    }
  };

  return (
    <Sheet title="Delete this bet?" onClose={onClose}>
      <p>
        This removes the bet and its selections from your history
        {bet.status === "pending" ? "" : ", and from your profit, ROI and win rate"}. It cannot be undone.
      </p>
      {error ? (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="btn-row">
        <button type="button" className="btn btn-danger-solid" onClick={remove} disabled={busy}>
          {busy ? "Deleting" : "Delete bet"}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Keep it
        </button>
      </div>
    </Sheet>
  );
}
