"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatMoney, type Currency } from "@/lib/accounting";
import { bucketLabel } from "@/lib/client/dates";
import type { SeriesPoint } from "@/lib/client/stats";
import { signedMoney } from "./ui";

/** Axis labels only: rounding is fine here because nothing is calculated from them. */
function compactMoney(minor: number, currency: Currency): string {
  const symbol = currency === "NGN" ? "₦" : "$";
  const value = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Math.abs(minor) / 100);
  return `${minor < 0 ? "-" : ""}${symbol}${value}`;
}

export function ProfitChart({
  points,
  currency,
  height = 120,
  axes = false,
}: {
  points: readonly SeriesPoint[];
  currency: Currency;
  height?: number;
  /** Show value labels on the left and first/last dates underneath (larger charts). */
  axes?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId();

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const left = axes ? 48 : 4;
  const right = 8;
  const top = 10;
  const bottom = axes ? 24 : 8;
  const innerW = Math.max(width - left - right, 1);
  const innerH = Math.max(height - top - bottom, 1);

  const values = points.map((p) => p.cumulativeMinor);
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const x = (i: number) => left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => top + (1 - (v - min) / (max - min)) * innerH;

  const last = values[values.length - 1] ?? 0;
  const color = last >= 0 ? "var(--gain)" : "var(--loss)";
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.cumulativeMinor).toFixed(1)}`).join(" ");
  const area = points.length > 1 ? `${line} L${x(points.length - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z` : "";

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (points.length === 0 || width === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left - left) / innerW;
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
  };

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    if (points.length === 0) return;
    if (event.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
    else if (event.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
    else if (event.key === "Escape") setActive(null);
  };

  const shown = active === null ? null : points[active];
  const summary = `Cumulative profit and loss in ${currency}, ${points.length} ${points.length === 1 ? "period" : "periods"}, now ${signedMoney(last, currency)}.`;

  return (
    <div
      ref={wrapRef}
      className="chart"
      style={{ height }}
      onPointerMove={move}
      onPointerDown={move}
      onPointerLeave={() => setActive(null)}
      onKeyDown={key}
      onBlur={() => setActive(null)}
      tabIndex={0}
      role="img"
      aria-label={summary}
    >
      {width > 0 ? (
        <svg width={width} height={height} aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {min < 0 && max > 0 ? <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeDasharray="4 4" /> : null}
          {axes ? (
            <>
              <text className="chart-axis" x={0} y={y(max) + 4}>
                {compactMoney(max, currency)}
              </text>
              <text className="chart-axis" x={0} y={y(min) + 4}>
                {compactMoney(min, currency)}
              </text>
              {points[0] ? (
                <text className="chart-axis" x={left} y={height - 6}>
                  {bucketLabel(points[0].key)}
                </text>
              ) : null}
              {points.length > 1 ? (
                <text className="chart-axis" x={width - right} y={height - 6} textAnchor="end">
                  {bucketLabel((points[points.length - 1] as SeriesPoint).key)}
                </text>
              ) : null}
            </>
          ) : null}
          {area ? <path d={area} fill={`url(#${gradientId})`} /> : null}
          {points.length > 1 ? <path d={line} stroke={color} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {points.length > 0 && active === null ? <circle cx={x(points.length - 1)} cy={y(last)} r={4} fill={color} /> : null}
          {shown && active !== null ? (
            <>
              <line x1={x(active)} x2={x(active)} y1={top} y2={height - bottom} stroke="var(--line)" />
              <circle cx={x(active)} cy={y(shown.cumulativeMinor)} r={5} fill={color} stroke="var(--surface)" strokeWidth={2} />
            </>
          ) : null}
        </svg>
      ) : null}
      {shown && active !== null ? (
        <div className="chart-tip num" style={{ left: Math.min(Math.max(x(active), 60), Math.max(width - 60, 60)) }}>
          <strong>{formatMoney(shown.cumulativeMinor, currency)}</strong>
          <span className="muted"> · {bucketLabel(shown.key)}</span>
        </div>
      ) : null}
    </div>
  );
}
