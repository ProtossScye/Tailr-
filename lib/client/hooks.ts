"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BetJson, DashboardJson } from "@/lib/api/types";
import { fetchAllBets, fetchDashboard, messageFor } from "./api";

export type Loadable<T> =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: T };

function useLoadable<T>(load: () => Promise<T>, deps: readonly unknown[]): [Loadable<T>, () => void] {
  const [value, setValue] = useState<Loadable<T>>({ state: "loading" });
  const [tick, setTick] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    const id = ++latest.current;
    setValue((prev) => (prev.state === "ready" ? prev : { state: "loading" }));
    load().then(
      (data) => {
        if (latest.current === id) setValue({ state: "ready", data });
      },
      (error: unknown) => {
        if (latest.current === id) setValue({ state: "error", message: messageFor(error) });
      },
    );
    // `load` is rebuilt on every render; the caller's deps decide when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => {
    setValue({ state: "loading" });
    setTick((n) => n + 1);
  }, []);
  return [value, reload];
}

export function useAllBets(): [Loadable<BetJson[]>, () => void] {
  return useLoadable(fetchAllBets, []);
}

export function useDashboard(range: { from: string; to: string } | null): [Loadable<DashboardJson>, () => void] {
  return useLoadable(() => fetchDashboard(range), [range?.from ?? "all", range?.to ?? "all"]);
}
