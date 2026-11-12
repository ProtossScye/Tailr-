"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatMoney, formatPercent, type Currency } from "@/lib/accounting";
import type { BetJson, DashboardJson } from "@/lib/api/types";
import { greeting, previousRange, rangeFor, type RangeFilter } from "@/lib/client/dates";
import type { SlipDraft } from "@/lib/client/drafts";
import { useAllBets, useDashboard, useSlips, type Loadable } from "@/lib/client/hooks";
import { MIN_BETS_FOR_RATES, UNSPECIFIED, bookmakerOf, cumulativeSeries, groupBets, settledBetween, type Bucket } from "@/lib/client/stats";
import { BellIcon, BetsIcon, ChevronRightIcon, LogoMark, PlusIcon, SlipArt } from "@/components/icons";
import { ProfitChart } from "@/components/profit-chart";
import { BetRow, EmptyState, ErrorState, LoadingBlock, Segmented, initialsOf, signedMoney, tone } from "@/components/ui";
import { useCurrentUser } from "@/components/user-context";

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "all", label: "All time" },
] as const satisfies readonly { value: RangeFilter; label: string }[];

const PREVIOUS_LABEL: Record<Exclude<RangeFilter, "all">, string> = {
  today: "yesterday",
  "7d": "the previous 7 days",
  "30d": "the previous 30 days",
};

export function HomeView() {
  const user = useCurrentUser();
  const [hello, setHello] = useState("Hello");
  const [filter, setFilter] = useState<RangeFilter>("30d");
  const [currencyChoice, setCurrencyChoice] = useState<Currency | null>(null);
  const [feed, setFeed] = useState<"placed" | "settled" | "drafts">("placed");
  const [slips, reloadSlips] = useSlips();

  useEffect(() => {
    setHello(greeting());
  }, []);

  const [bets, reloadBets] = useAllBets();
  const range = useMemo(() => rangeFor(filter), [filter]);
  const prior = useMemo(() => (range ? previousRange(range) : null), [range]);
  const [stats, reloadStats] = useDashboard(range);
  const [priorStats] = useDashboard(prior);

  const reload = () => {
    reloadBets();
    reloadStats();
  };

  return (
    <div className="page">
      <header className="topbar">
        <span className="logo-mark" aria-hidden="true">
          <LogoMark />
        </span>
        <div className="greet">
          <small>{hello},</small>
          <strong>{user.name}</strong>
        </div>
        <Link href="/notifications" className="icon-btn" aria-label="Notifications">
          <BellIcon />
        </Link>
        <Link href="/profile" className="avatar" aria-label="Your profile">
          {initialsOf(user.name)}
        </Link>
      </header>

      {bets.state === "loading" || stats.state === "loading" ? (
        <LoadingBlock label="Loading your performance" rows={4} />
      ) : bets.state === "error" ? (
        <ErrorState message={bets.message} onRetry={reload} />
      ) : stats.state === "error" ? (
        <ErrorState message={stats.message} onRetry={reload} />
      ) : bets.data.length === 0 ? (
        <>
          <EmptyState
            art={<SlipArt className="empty-art" />}
            title="No bets recorded yet"
            action={
              <Link href="/bets/new" className="btn btn-primary">
                <PlusIcon /> Add a bet
              </Link>
            }
          >
            Add a bet you have placed to start your history. Profit, ROI and win rate appear here once a bet is settled.
          </EmptyState>
          <QuickActions />
        </>
      ) : (
        <Overview
          bets={bets.data}
          filter={filter}
          setFilter={setFilter}
          range={range}
          stats={stats.data}
          priorNet={priorStats.state === "ready" ? priorStats.data : null}
          currencyChoice={currencyChoice}
          setCurrencyChoice={setCurrencyChoice}
          feed={feed}
          setFeed={setFeed}
          slips={slips}
          reloadSlips={reloadSlips}
        />
      )}

      <div className="sticky-cta">
        <Link href="/bets/new" className="btn btn-primary btn-block">
          <PlusIcon /> Add bet
        </Link>
      </div>
    </div>
  );
}

function QuickActions() {
  return (
    <section className="section" aria-labelledby="quick-title">
      <h2 className="section-title" id="quick-title">
        Quick actions
      </h2>
      <div className="quick">
        <Link href="/create" className="btn">
          <PlusIcon /> Create slip
        </Link>
        <Link href="/bets" className="btn">
          <BetsIcon /> View bets
        </Link>
        <Link href="/bets/new" className="btn only-wide">
          <PlusIcon /> Add bet
        </Link>
      </div>
    </section>
  );
}

function Overview({
  bets,
  filter,
  setFilter,
  range,
  stats,
  priorNet,
  currencyChoice,
  setCurrencyChoice,
  feed,
  setFeed,
  slips,
  reloadSlips,
}: {
  bets: BetJson[];
  filter: RangeFilter;
  setFilter: (f: RangeFilter) => void;
  range: { from: string; to: string } | null;
  stats: DashboardJson;
  priorNet: DashboardJson | null;
  currencyChoice: Currency | null;
  setCurrencyChoice: (c: Currency) => void;
  feed: "placed" | "settled" | "drafts";
  setFeed: (f: "placed" | "settled" | "drafts") => void;
  slips: Loadable<SlipDraft[]>;
  reloadSlips: () => void;
}) {
  const present = (["NGN", "USD"] as const).filter((c) => bets.some((b) => b.currency === c));
  const currency: Currency = currencyChoice && present.includes(currencyChoice) ? currencyChoice : (present[0] ?? "NGN");
  const summary = stats.byCurrency[currency];
  const settledCount = summary.wins + summary.losses;

  const inRange = useMemo(
    () => settledBetween(bets.filter((b) => b.currency === currency), range?.from ?? null, range?.to ?? null),
    [bets, currency, range],
  );
  const bucket: Bucket = useMemo(() => {
    if (filter !== "all" || inRange.length === 0) return "day";
    const times = inRange.map((b) => new Date(b.settledAt as string).getTime());
    const spanDays = (Math.max(...times) - Math.min(...times)) / 86_400_000;
    return spanDays > 120 ? "week" : "day";
  }, [filter, inRange]);
  const points = useMemo(() => cumulativeSeries(inRange, bucket), [inRange, bucket]);

  const avgStake = settledCount > 0 ? Math.round(summary.settledStakeMinor / settledCount) : null;
  const delta = filter !== "all" && priorNet ? summary.netProfitMinor - priorNet.byCurrency[currency].netProfitMinor : null;

  const placed = useMemo(() => bets.slice(0, 5), [bets]);
  const settled = useMemo(
    () =>
      bets
        .filter((b) => b.settledAt !== null)
        .sort((a, b) => new Date(b.settledAt as string).getTime() - new Date(a.settledAt as string).getTime())
        .slice(0, 5),
    [bets],
  );

  const bookmakers = useMemo(() => {
    const rows = groupBets(bets, bookmakerOf).map((row) => ({
      name: row.key,
      total: row.stats.settled + row.stats.voids + row.stats.pending,
    }));
    const named = rows.filter((r) => r.name !== UNSPECIFIED);
    return { named, unnamed: rows.find((r) => r.name === UNSPECIFIED)?.total ?? 0 };
  }, [bets]);

  return (
    <>
      <section className="section" aria-labelledby="perf-title">
        <div className="section-head">
          <h2 className="section-title" id="perf-title">
            Performance
          </h2>
          {present.length > 1 ? (
            <Segmented
              label="Currency"
              value={currency}
              onChange={setCurrencyChoice}
              options={present.map((c) => ({ value: c, label: c }))}
            />
          ) : null}
        </div>
        <Segmented label="Date range" value={filter} onChange={setFilter} options={RANGE_OPTIONS} full />

        <div className="card hero">
          <div>
            <p className="hero-label">Net profit</p>
            <p className={`hero-value num ${tone(summary.netProfitMinor)}`}>{signedMoney(summary.netProfitMinor, currency)}</p>
            <p className="hero-note num">
              {filter === "all"
                ? "Across all settled bets"
                : delta === null
                  ? "Settled in this period"
                  : `${signedMoney(delta, currency)} vs ${PREVIOUS_LABEL[filter]}`}
            </p>
          </div>
          {points.length === 0 ? (
            <p className="muted">Nothing settled in this period yet.</p>
          ) : (
            <ProfitChart points={points} currency={currency} height={filter === "all" || filter === "30d" ? 120 : 104} />
          )}
        </div>

        <div className="stat-grid cols-4">
          <div className="stat">
            <p className="stat-label">ROI</p>
            <p className={`stat-value num ${summary.roiPercent === null ? "" : tone(summary.netProfitMinor)}`}>{formatPercent(summary.roiPercent)}</p>
            <p className="stat-note">{settledCount < MIN_BETS_FOR_RATES ? `Early read, ${settledCount} settled` : "Of settled stakes"}</p>
          </div>
          <div className="stat">
            <p className="stat-label">Win rate</p>
            <p className="stat-value num">{formatPercent(summary.winRatePercent)}</p>
            <p className="stat-note num">
              {summary.wins} / {settledCount}
            </p>
          </div>
          <div className="stat">
            <p className="stat-label">Settled bets</p>
            <p className="stat-value num">{settledCount}</p>
            <p className="stat-note">{summary.voids > 0 ? `${summary.voids} void` : "Won and lost"}</p>
          </div>
          <div className="stat">
            <p className="stat-label">Avg stake</p>
            <p className="stat-value num">{avgStake === null ? "n/a" : formatMoney(avgStake, currency)}</p>
            <p className="stat-note">Per settled bet</p>
          </div>
        </div>

        <p className="muted num" style={{ fontSize: 13 }}>
          {summary.placedCount} {summary.placedCount === 1 ? "bet" : "bets"} placed {filter === "all" ? "in total" : "in this period"}, counted by the day you placed them.
        </p>
        {summary.pendingCount > 0 ? (
          <p className="banner num">
            {summary.pendingCount} pending {summary.pendingCount === 1 ? "bet" : "bets"} with {formatMoney(summary.pendingStakeMinor, currency)} staked.
            Pending bets are not in these figures and are not filtered by date.
          </p>
        ) : null}
        <p className="muted" style={{ fontSize: 13 }}>
          Based on bets you recorded. Tailr has not verified them with your bookmaker.
        </p>
      </section>

      <QuickActions />

      <section className="section" aria-labelledby="recent-title">
        <div className="section-head">
          <h2 className="section-title" id="recent-title">
            Recent activity
          </h2>
          <Link href="/bets" className="link-more">
            View all
          </Link>
        </div>
        <Segmented
          label="Activity type"
          value={feed}
          onChange={setFeed}
          options={[
            { value: "placed", label: "Placed" },
            { value: "settled", label: "Settled" },
            { value: "drafts", label: "Drafts" },
          ]}
        />
        {feed === "drafts" ? (
          slips.state === "loading" ? (
            <LoadingBlock label="Loading drafts" rows={2} />
          ) : slips.state === "error" ? (
            <ErrorState message={slips.message} onRetry={reloadSlips} />
          ) : slips.data.length === 0 ? (
            <div className="card card-pad stack">
              <p>No slip drafts yet.</p>
              <p className="muted">Drafts you save in Create are kept in your account. A draft is not a placed bet.</p>
              <span>
                <Link href="/create" className="btn btn-small">
                  Create a slip
                </Link>
              </span>
            </div>
          ) : (
            <ul className="card list">
              {slips.data.slice(0, 5).map((draft) => (
                <li key={draft.id}>
                  <Link href={`/create?draft=${draft.id}`} className="settings-row">
                    <span>
                      {draft.name}
                      <small>
                        {draft.legs.length} {draft.legs.length === 1 ? "selection" : "selections"} · Draft, not a placed bet
                      </small>
                    </span>
                    <ChevronRightIcon />
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : (feed === "placed" ? placed : settled).length === 0 ? (
          <div className="card card-pad">
            <p className="muted">No settled bets yet. Settle a pending bet and it will show here.</p>
          </div>
        ) : (
          <ul className="card list">
            {(feed === "placed" ? placed : settled).map((bet) => (
              <li key={bet.id}>
                <BetRow bet={bet} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="books-title">
        <h2 className="section-title" id="books-title">
          Bookmakers
        </h2>
        {bookmakers.named.length === 0 ? (
          <div className="card card-pad stack">
            <p>No bookmakers named yet.</p>
            <p className="muted">Add a bookmaker name when you record a bet and it will be listed here.</p>
          </div>
        ) : (
          <ul className="card list">
            {bookmakers.named.map((b) => (
              <li key={b.name} className="settings-row" style={{ cursor: "default" }}>
                <span>
                  {b.name}
                  <small>Tracked manually</small>
                </span>
                <span className="num muted">
                  {b.total} {b.total === 1 ? "bet" : "bets"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted" style={{ fontSize: 13 }}>
          Taken from the bookmaker name on each bet. Tailr does not connect to or import from bookmaker accounts.
          {bookmakers.unnamed > 0 ? ` ${bookmakers.unnamed} ${bookmakers.unnamed === 1 ? "bet has" : "bets have"} no bookmaker named.` : ""}
        </p>
      </section>
    </>
  );
}
