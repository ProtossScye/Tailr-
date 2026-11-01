import { describe, expect, it } from "vitest";
import { fetchAllPages, type Page } from "./pagination";

/** A fake table of `n` rows read through a server that returns at most `cap` rows per request. */
function fakeServer(n: number, options: { cap?: number; reportTotal?: boolean } = {}) {
  const rows = Array.from({ length: n }, (_, i) => i);
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number): Promise<Page<number>> => {
    calls.push([from, to]);
    const wanted = rows.slice(from, to + 1);
    const served = options.cap === undefined ? wanted : wanted.slice(0, options.cap);
    return { rows: served, total: options.reportTotal ? n : undefined };
  };
  return { fetchPage, calls, rows };
}

describe("fetchAllPages without a reported total", () => {
  it("returns an empty list for an empty table with one request", async () => {
    const s = fakeServer(0);
    expect(await fetchAllPages(s.fetchPage, 5)).toEqual([]);
    expect(s.calls).toHaveLength(1);
  });

  it.each([1, 4, 5, 6, 10, 11, 23])("reads all %i rows across pages of 5", async (n) => {
    const s = fakeServer(n);
    expect(await fetchAllPages(s.fetchPage, 5)).toEqual(s.rows);
  });

  it("asks for consecutive, non-overlapping ranges", async () => {
    const s = fakeServer(12);
    await fetchAllPages(s.fetchPage, 5);
    expect(s.calls).toEqual([
      [0, 4],
      [5, 9],
      [10, 14],
    ]);
  });

  it("stops after the exact-multiple page returns nothing", async () => {
    const s = fakeServer(10);
    expect(await fetchAllPages(s.fetchPage, 5)).toHaveLength(10);
    expect(s.calls).toHaveLength(3);
  });
});

describe("fetchAllPages with a reported total", () => {
  it("keeps going when the server caps rows below the page size", async () => {
    // The server only ever returns 3 rows even though 5 were asked for. Without the
    // total, the first short page would look like the end and bets would be dropped.
    const s = fakeServer(10, { cap: 3, reportTotal: true });
    expect(await fetchAllPages(s.fetchPage, 5)).toEqual(s.rows);
  });

  it("without the total, that same capped server silently truncates (why the total matters)", async () => {
    const s = fakeServer(10, { cap: 3, reportTotal: false });
    expect(await fetchAllPages(s.fetchPage, 5)).toHaveLength(3);
  });

  it("stops as soon as everything is read, with no extra request", async () => {
    const s = fakeServer(10, { reportTotal: true });
    await fetchAllPages(s.fetchPage, 5);
    expect(s.calls).toHaveLength(2);
  });

  it("throws instead of returning incomplete data when rows go missing", async () => {
    const fetchPage = async (from: number): Promise<Page<number>> =>
      from === 0 ? { rows: [0, 1, 2], total: 5 } : { rows: [] };
    await expect(fetchAllPages(fetchPage, 3)).rejects.toThrow(/incomplete/);
  });

  it("an empty table with total 0 returns an empty list", async () => {
    const s = fakeServer(0, { reportTotal: true });
    expect(await fetchAllPages(s.fetchPage, 5)).toEqual([]);
  });
});

describe("fetchAllPages safety", () => {
  it("refuses to loop forever", async () => {
    const fetchPage = async (): Promise<Page<number>> => ({ rows: [1, 2, 3] });
    await expect(fetchAllPages(fetchPage, 3, 5)).rejects.toThrow(/Too many pages/);
  });

  it("passes request errors through", async () => {
    await expect(
      fetchAllPages(async () => {
        throw new Error("network down");
      }),
    ).rejects.toThrow("network down");
  });
});
