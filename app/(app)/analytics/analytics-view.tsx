"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { formatMoney, formatPercent, type Currency } from "@/lib/accounting";
import type { BetJson } from "@/lib/api/types";
import { useAllBets } from "@/lib/client/hooks";
import {
  MIN_BETS_FOR_RATES,
  UNSPECIFIED,
  bookmakerOf,
  cumulativeSeries,
  groupBets,
  hasEnoughBets,
  marketOf,
  oddsRangeOf,
  orderedOddsRanges,
  orderedWeekdays,
  sportOf,
  streaks,
  summarizeBets,
  weekdayOf,
  type Bucket,
  type BetStats,
  type GroupRow,
} from "@/lib/client/stats";
import { BoardArt, ChevronRightIcon, PlusIcon } from "@/components/icons";
import { ProfitChart } from "@/components/profit-chart";
import { EmptyState, ErrorState, LoadingBlock, PageHeader, Segmented, signedMoney, tone } from "@/components/ui";

const BUCKETS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
] as const satisfies readonly { value: Bucket; label: string }[];

export function AnalyticsView() {
  const [bets, reload] = useAllBets();
  const [currencyChoice, setCurrencyChoice] = useState<Currency | null>(null);
  const [bucket, setBucket] = useState<Bucket>("week");

  return (
    <div className="page">
      <PageHeader title="Analytics" sub="Worked out from the bets you recorded." />
      {bets.state === "loading" ? (
        <LoadingBlock label="Loading analytics" rows={5} />
      ) : bets.state === "error" ? (
        <ErrorState message={bets.message} onRetry={reload} />
      ) : bets.data.filter((b) => b.status !== "pending").length === 0 ? (
        <EmptyState
          art={<BoardArt className="empty-art" />}
          title="Nothing to analyse yet"
          action={
            <Link href={bets.data.length === 0 ? "/bets/new" : "/bets"} className="btn btn-primary">
              {bets.data.length === 0 ? (
                <>
                  <PlusIcon /> Add a bet
                </>
              ) : (
                "Settle a bet"
              )}
            </Link>
          }
        >
          Analytics use settled bets. Record a bet and settle it with its result, and your profit chart and breakdowns start building here.
        </EmptyState>
      ) : (
        <Loaded bets={bets.data} currencyChoice={currencyChoice} setCurrencyChoice={setCurrencyChoice} bucket={bucket} setBucket={setBucket} />
      )}
    </div>
  );
}

function Loaded({
  bets,
  currencyChoice,
  setCurrencyChoice,
  bucket,
  setBucket,
}: {
  bets: BetJson[];
  currencyChoice: Currency | null;
  setCurrencyChoice: (c: Currency) => void;
  bucket: Bucket;
  setBucket: (b: Bucket) => void;
}) {
  const present = (["NGN", "USD"] as const).filter((c) => bets.some((b) => b.currency === c && b.status !== "pending"));
  const currency: Currency = currencyChoice && present.includes(currencyChoice) ? currencyChoice : (present[0] ?? "NGN");
  const mine = useMemo(() => bets.filter((b) => b.currency === currency), [bets, currency]);
  const stats = useMemo(() => summarizeBets(mine), [mine]);
  const points = useMemo(() => cumulativeSeries(mine, bucket), [mine, bucket]);
  const enough = hasEnoughBets(stats);

  const sports = useMemo(() => groupBets(mine, sportOf), [mine]);
  const markets = useMemo(() => groupBets(mine, marketOf), [mine]);
  const books = useMemo(() => groupBets(mine, bookmakerOf), [mine]);
  const odds = useMemo(() => orderedOddsRanges(groupBets(mine, oddsRangeOf)), [mine]);
  const days = useMemo(() => orderedWeekdays(groupBets(mine.filter((b) => b.settledAt !== null), weekdayOf)), [mine]);
  const run = useMemo(() => streaks(mine), [mine]);

  return (
    <>
      {present.length > 1 ? (
        <Segmented label="Currency" value={currency} onChange={setCurrencyChoice} options={present.map((c) => ({ value: c, label: c }))} />
      ) : null}

      {!enough ? (
        <p className="banner banner-note">
          {stats.settled} of the {MIN_BETS_FOR_RATES} settled bets needed for a fair read. Until then ROI and win rate move a lot with every result, so
          treat them as early numbers, not a pattern.
        </p>
      ) : null}

      <section className="section" aria-labelledby="overview-title">
        <h2 className="section-title" id="overview-title">
          Performance overview
        </h2>
        <div className="stat-grid cols-3">
          <Stat label="Net profit/loss" value={signedMoney(stats.netMinor, currency)} className={tone(stats.netMinor)} />
          <Stat label="ROI" value={formatPercent(stats.roiPercent)} className={stats.roiPercent === null ? "" : tone(stats.netMinor)} note={enough ? "Of settled stakes" : "Early read"} />
          <Stat label="Win rate" value={formatPercent(stats.winRatePercent)} note={`${stats.wins} of ${stats.settled}`} />
          <Stat label="Settled bets" value={String(stats.settled)} note={stats.voids > 0 ? `${stats.voids} void` : undefined} />
          <Stat label="Total staked" value={formatMoney(stats.stakedMinor, currency)} note="Won and lost bets" />
          <Stat label="Average odds" value={stats.avgOdds === null ? "n/a" : stats.avgOdds.toFixed(2)} note={stats.avgOdds === null ? "No odds recorded" : "Where odds were recorded"} />
        </div>
      </section>

      <section className="section" aria-labelledby="chart-title">
        <h2 className="section-title" id="chart-title">
          Profit and loss
        </h2>
        <Segmented label="Group by" value={bucket} onChange={setBucket} options={BUCKETS} full />
        <div className="card card-pad stack">
          {points.length === 0 ? <p className="muted">Nothing settled yet.</p> : <ProfitChart points={points} currency={currency} height={190} axes />}
          <p className="muted" style={{ fontSize: 13 }}>
            Running total of net profit by settlement date, Lagos time. Void and pending bets add nothing.
          </p>
        </div>
      </section>

      <Breakdown id="sport" title="Sport performance" rows={sports} currency={currency} enoughOverall={enough} />
      <Breakdown id="market" title="Market performance" rows={markets} currency={currency} enoughOverall={enough} />
      <Breakdown id="book" title="Bookmaker performance" rows={books} currency={currency} enoughOverall={enough} showStaked />

      <Disclosure title="Advanced insights">
        <h3 className="section-title" style={{ fontSize: 16 }}>
          Streaks
        </h3>
        <div className="stat-grid">
          <Stat label="Longest winning run" value={String(run.longestWin)} />
          <Stat label="Longest losing run" value={String(run.longestLoss)} />
          <Stat
            label="Current run"
            value={run.current ? `${run.current.length} ${run.current.kind === "won" ? "won" : "lost"}` : "None"}
            note="Void and pending do not break a run"
          />
          <Stat label="Average stake" value={stats.avgStakeMinor === null ? "n/a" : formatMoney(stats.avgStakeMinor, currency)} note="Per settled bet" />
        </div>
        <h3 className="section-title" style={{ fontSize: 16, marginTop: 8 }}>
          By odds range
        </h3>
        <Rows rows={odds} currency={currency} unitNote="Uses the total odds recorded on each bet." />
        <h3 className="section-title" style={{ fontSize: 16, marginTop: 8 }}>
          By day
        </h3>
        <Rows rows={days} currency={currency} unitNote="Weekday the bet was settled, Lagos time." />
      </Disclosure>
    </>
  );
}

function Stat({ label, value, note, className = "" }: { label: string; value: string; note?: string; className?: string }) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className={`stat-value num ${className}`}>{value}</p>
      {note ? <p className="stat-note">{note}</p> : null}
    </div>
  );
}

function Disclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>
        {title}
        <ChevronRightIcon />
      </summary>
      <div className="body">{children}</div>
    </details>
  );
}

function Breakdown({
  id,
  title,
  rows,
  currency,
  enoughOverall,
  showStaked,
}: {
  id: string;
  title: string;
  rows: GroupRow[];
  currency: Currency;
  enoughOverall: boolean;
  showStaked?: boolean;
}) {
  const known = rows.filter((r) => r.stats.settled + r.stats.voids > 0);
  return (
    <Disclosure title={title} defaultOpen={id === "sport"}>
      {known.length === 0 ? (
        <p className="muted">No settled bets to compare yet.</p>
      ) : known.length === 1 && known[0]?.key === UNSPECIFIED ? (
        <p className="muted">
          None of your bets name {id === "book" ? "a bookmaker" : id === "sport" ? "a sport" : "a market"} yet. Fill it in when you add or edit a bet and the
          breakdown appears here.
        </p>
      ) : (
        <Rows rows={known} currency={currency} showStaked={showStaked} caution={!enoughOverall} />
      )}
    </Disclosure>
  );
}

function Rows({
  rows,
  currency,
  showStaked,
  caution,
  unitNote,
}: {
  rows: GroupRow[];
  currency: Currency;
  showStaked?: boolean;
  caution?: boolean;
  unitNote?: string;
}) {
  const shown = rows.filter((r) => r.stats.settled + r.stats.voids + r.stats.pending > 0);
  if (shown.length === 0) return <p className="muted">Not enough recorded yet.</p>;
  return (
    <div className="table" role="table">
      <div className="table-row head" role="row">
        <span role="columnheader">Group</span>
        <span role="columnheader">Profit</span>
        <span role="columnheader">ROI</span>
      </div>
      {shown.map((row) => (
        <Row key={row.key} row={row} currency={currency} showStaked={showStaked} caution={caution} />
      ))}
      {unitNote ? (
        <p className="muted" style={{ fontSize: 13, paddingTop: 8 }}>
          {unitNote}
        </p>
      ) : null}
    </div>
  );
}

function Row({ row, currency, showStaked, caution }: { row: GroupRow; currency: Currency; showStaked?: boolean; caution?: boolean }) {
  const s: BetStats = row.stats;
  const few = s.settled < MIN_BETS_FOR_RATES;
  return (
    <div className="table-row" role="row">
      <span className="name" role="cell">
        {row.key === UNSPECIFIED ? "Not recorded" : row.key}
        <span className="sub">
          {s.settled} settled{s.pending > 0 ? `, ${s.pending} pending` : ""}
          {showStaked && s.settled > 0 ? `, ${formatMoney(s.stakedMinor, currency)} staked` : ""}
        </span>
      </span>
      <span className={`num ${tone(s.netMinor)}`} role="cell">
        {s.settled === 0 ? "n/a" : signedMoney(s.netMinor, currency)}
      </span>
      <span className="num" role="cell">
        {s.settled === 0 ? "n/a" : few || caution ? (
          <>
            {formatPercent(s.roiPercent)}
            <span className="sub">too few</span>
          </>
        ) : (
          formatPercent(s.roiPercent)
        )}
      </span>
    </div>
  );
}
