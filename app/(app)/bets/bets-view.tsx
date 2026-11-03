"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatMoney, type BetStatus, type Currency } from "@/lib/accounting";
import type { BetJson } from "@/lib/api/types";
import { useAllBets } from "@/lib/client/hooks";
import { UNSPECIFIED, bookmakerOf } from "@/lib/client/stats";
import { FilterIcon, PlusIcon, SearchIcon, SlipArt } from "@/components/icons";
import { BetRow, EmptyState, ErrorState, LoadingBlock, PageHeader, STATUS_LABEL, Segmented, Sheet, signedMoney, tone } from "@/components/ui";

type StatusFilter = "all" | BetStatus;
const TABS: readonly StatusFilter[] = ["all", "pending", "won", "lost", "void"];
const PAGE_SIZE = 30;

function matches(bet: BetJson, term: string): boolean {
  const haystack = [bet.bookmakerLabel, bet.notes, ...bet.selections.flatMap((s) => [s.event, s.selection, s.sport, s.marketType])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function BetsView() {
  const [bets, reload] = useAllBets();
  const [status, setStatus] = useState<StatusFilter>("all");
  const [currencyChoice, setCurrencyChoice] = useState<Currency | null>(null);
  const [bookmaker, setBookmaker] = useState<string>("");
  const [term, setTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [filtering, setFiltering] = useState(false);
  const [shown, setShown] = useState(PAGE_SIZE);

  return (
    <div className="page">
      <PageHeader
        title="Bets"
        actions={
          <>
            <button type="button" className="icon-btn" aria-label="Search bets" aria-expanded={searching} onClick={() => setSearching((s) => !s)}>
              <SearchIcon />
            </button>
            <button type="button" className="icon-btn" aria-label="Filter bets" onClick={() => setFiltering(true)}>
              <FilterIcon />
            </button>
            <Link href="/bets/new" className="btn btn-primary btn-small">
              <PlusIcon /> Add bet
            </Link>
          </>
        }
      />

      {bets.state === "loading" ? (
        <LoadingBlock label="Loading your bets" rows={5} />
      ) : bets.state === "error" ? (
        <ErrorState message={bets.message} onRetry={reload} />
      ) : bets.data.length === 0 ? (
        <EmptyState
          art={<SlipArt className="empty-art" />}
          title="No bets recorded yet"
          action={
            <Link href="/bets/new" className="btn btn-primary">
              <PlusIcon /> Add a bet
            </Link>
          }
        >
          Record a bet you have placed. Settle it when it finishes and your history starts here.
        </EmptyState>
      ) : (
        <Loaded
          all={bets.data}
          status={status}
          setStatus={(s) => {
            setStatus(s);
            setShown(PAGE_SIZE);
          }}
          currencyChoice={currencyChoice}
          setCurrencyChoice={setCurrencyChoice}
          bookmaker={bookmaker}
          term={term}
          setTerm={(t) => {
            setTerm(t);
            setShown(PAGE_SIZE);
          }}
          searching={searching}
          shown={shown}
          showMore={() => setShown((n) => n + PAGE_SIZE)}
          filtering={filtering}
          closeFilter={() => setFiltering(false)}
          setBookmaker={(b) => {
            setBookmaker(b);
            setShown(PAGE_SIZE);
          }}
        />
      )}
    </div>
  );
}

function Loaded({
  all,
  status,
  setStatus,
  currencyChoice,
  setCurrencyChoice,
  bookmaker,
  setBookmaker,
  term,
  setTerm,
  searching,
  shown,
  showMore,
  filtering,
  closeFilter,
}: {
  all: BetJson[];
  status: StatusFilter;
  setStatus: (s: StatusFilter) => void;
  currencyChoice: Currency | null;
  setCurrencyChoice: (c: Currency | null) => void;
  bookmaker: string;
  setBookmaker: (b: string) => void;
  term: string;
  setTerm: (t: string) => void;
  searching: boolean;
  shown: number;
  showMore: () => void;
  filtering: boolean;
  closeFilter: () => void;
}) {
  const present = (["NGN", "USD"] as const).filter((c) => all.some((b) => b.currency === c));
  const currency: Currency = currencyChoice && present.includes(currencyChoice) ? currencyChoice : (present[0] ?? "NGN");
  const bookmakers = useMemo(() => [...new Set(all.map(bookmakerOf))].sort((a, b) => a.localeCompare(b)), [all]);

  // Everything except the status tab, so tab counts and the summary describe the same set.
  const base = useMemo(
    () =>
      all.filter(
        (b) => b.currency === currency && (bookmaker === "" || bookmakerOf(b) === bookmaker) && (term.trim() === "" || matches(b, term)),
      ),
    [all, currency, bookmaker, term],
  );
  const visible = useMemo(() => (status === "all" ? base : base.filter((b) => b.status === status)), [base, status]);

  const totalStaked = base.reduce((sum, b) => sum + b.stakeMinor, 0);
  const net = base.reduce((sum, b) => sum + (b.netProfitMinor ?? 0), 0);
  const count = (s: StatusFilter) => (s === "all" ? base.length : base.filter((b) => b.status === s).length);
  const activeFilters = (bookmaker !== "" ? 1 : 0) + (term.trim() !== "" ? 1 : 0);

  return (
    <>
      {searching ? (
        <div className="field">
          <label htmlFor="bet-search" className="sr-only">
            Search bets
          </label>
          <input
            id="bet-search"
            className="input"
            type="search"
            placeholder="Search events, selections, bookmakers"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            autoFocus
          />
        </div>
      ) : null}

      {present.length > 1 ? (
        <Segmented label="Currency" value={currency} onChange={setCurrencyChoice} options={present.map((c) => ({ value: c, label: c }))} />
      ) : null}

      <div className="stat-grid cols-3" aria-label="Summary">
        <div className="stat">
          <p className="stat-label">Total bets</p>
          <p className="stat-value num">{base.length}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Total staked</p>
          <p className="stat-value num">{formatMoney(totalStaked, currency)}</p>
        </div>
        <div className="stat">
          <p className="stat-label">Net profit/loss</p>
          <p className={`stat-value num ${tone(net)}`}>{signedMoney(net, currency)}</p>
          <p className="stat-note">Settled bets only</p>
        </div>
      </div>

      <div className="tabs" role="group" aria-label="Status">
        {TABS.map((tab) => (
          <button key={tab} type="button" className="tab" aria-pressed={status === tab} onClick={() => setStatus(tab)}>
            {tab === "all" ? "All" : STATUS_LABEL[tab]}
            <span className="count num">{count(tab)}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card card-pad stack">
          <p>{activeFilters > 0 ? "No bets match your search or filters." : `No ${status === "all" ? "" : STATUS_LABEL[status].toLowerCase() + " "}bets here yet.`}</p>
          {activeFilters > 0 ? (
            <span>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setTerm("");
                  setBookmaker("");
                }}
              >
                Clear search and filters
              </button>
            </span>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="card list">
            {visible.slice(0, shown).map((bet) => (
              <li key={bet.id}>
                <BetRow bet={bet} />
              </li>
            ))}
          </ul>
          {visible.length > shown ? (
            <button type="button" className="btn btn-block" onClick={showMore}>
              Show more ({visible.length - shown} left)
            </button>
          ) : null}
        </>
      )}

      {filtering ? (
        <Sheet title="Filter bets" onClose={closeFilter}>
          <div className="field">
            <label htmlFor="filter-bookmaker">Bookmaker</label>
            <select id="filter-bookmaker" className="select" value={bookmaker} onChange={(e) => setBookmaker(e.target.value)}>
              <option value="">All bookmakers</option>
              {bookmakers.map((name) => (
                <option key={name} value={name}>
                  {name === UNSPECIFIED ? "No bookmaker named" : name}
                </option>
              ))}
            </select>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={closeFilter}>
              Show {base.length} {base.length === 1 ? "bet" : "bets"}
            </button>
            {bookmaker !== "" ? (
              <button type="button" className="btn" onClick={() => setBookmaker("")}>
                Clear
              </button>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
