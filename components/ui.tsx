"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import type { BetJson } from "@/lib/api/types";
import { formatMoney, type BetStatus, type Currency } from "@/lib/accounting";
import { formatWhen } from "@/lib/client/dates";
import { ClockIcon, DashIcon, TrendDownIcon, TrendUpIcon } from "./icons";

export const STATUS_LABEL: Record<BetStatus, string> = {
  pending: "Pending",
  won: "Won",
  lost: "Lost",
  void: "Void",
};

export function StatusPill({ status }: { status: BetStatus }) {
  return <span className={`pill pill-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function BetStatusIcon({ status }: { status: BetStatus }) {
  return (
    <span className={`bet-icon ${status}`} aria-hidden="true">
      {status === "won" ? <TrendUpIcon /> : status === "lost" ? <TrendDownIcon /> : status === "pending" ? <ClockIcon /> : <DashIcon />}
    </span>
  );
}

/** "+₦4,000.00" / "-₦3,000.00" / "₦0.00". The sign is part of the text, so colour is never the only cue. */
export function signedMoney(minor: number, currency: Currency): string {
  return minor > 0 ? `+${formatMoney(minor, currency)}` : formatMoney(minor, currency);
}

export function tone(minor: number): string {
  return minor > 0 ? "gain" : minor < 0 ? "loss" : "";
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub ? <p className="page-sub">{sub}</p> : null}
      </div>
      {actions ? <div className="head-actions">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  art,
  title,
  children,
  action,
}: {
  art?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      {art}
      <h2>{title}</h2>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="banner banner-error stack" role="alert">
      <span>{message}</span>
      {onRetry ? (
        <span>
          <button type="button" className="btn btn-small" onClick={onRetry}>
            Try again
          </button>
        </span>
      ) : null}
    </div>
  );
}

export function Skeleton({ height = 16, width }: { height?: number; width?: number | string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

export function LoadingBlock({ label = "Loading", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div className="card card-pad stack" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={i === 0 ? 22 : 16} width={i === 0 ? "40%" : i % 2 ? "90%" : "70%"} />
      ))}
    </div>
  );
}

/** One row of a bet list. `showProfit` is false on pending bets, which never display a profit figure. */
export function BetRow({ bet }: { bet: BetJson }) {
  const first = bet.selections[0];
  const more = bet.selections.length - 1;
  const title = first ? (more > 0 ? `${first.event} +${more} more` : first.event) : "Bet";
  const detail = [first?.sport, bet.bookmakerLabel].filter(Boolean).join(" · ");
  const pick = first ? [first.marketType, first.selection].filter(Boolean).join(": ") : "";
  const amount =
    bet.status === "pending"
      ? { text: formatMoney(bet.stakeMinor, bet.currency), className: "" }
      : bet.netProfitMinor === null
        ? { text: formatMoney(bet.stakeMinor, bet.currency), className: "" }
        : { text: signedMoney(bet.netProfitMinor, bet.currency), className: tone(bet.netProfitMinor) };
  return (
    <Link href={`/bets/${bet.id}`} className="bet-row">
      <BetStatusIcon status={bet.status} />
      <div className="bet-main">
        <div className="bet-title">{title}</div>
        <div className="bet-meta">{pick || detail || "No market recorded"}</div>
        <div className="bet-meta">{formatWhen(bet.placedAt)}</div>
      </div>
      <div className="bet-side">
        <span className={`bet-amount num ${amount.className}`}>{amount.text}</span>
        <StatusPill status={bet.status} />
        {bet.status !== "pending" ? <span className="bet-meta num">Stake {formatMoney(bet.stakeMinor, bet.currency)}</span> : null}
      </div>
    </Link>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  full,
}: {
  value: T;
  onChange: (next: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "seg full" : "seg"} role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** A bottom sheet on phones, a centred dialog on wide screens. Escape closes it. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} tabIndex={-1}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0] as string;
  const second = parts[1];
  return (second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2)).toUpperCase();
}
