export interface Page<T> {
  rows: T[];
  /**
   * The total number of rows, when the server reports it. If given, it is used to
   * keep reading past a server row limit and to prove nothing was dropped.
   */
  total?: number | null;
}

/**
 * Reads every page of a query. Supabase returns at most 1,000 rows per request by
 * default and does not say when it stopped early, so a dashboard built from one
 * request would silently drop bets and show wrong totals. This reads until
 * everything is in, and throws rather than return an incomplete list.
 *
 * `fetchPage(from, to)` must use a stable order, with `to` inclusive.
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<Page<T>>,
  pageSize = 1000,
  maxPages = 10_000,
): Promise<T[]> {
  const all: T[] = [];
  let total: number | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const from = all.length;
    const result = await fetchPage(from, from + pageSize - 1);
    if (total === null && typeof result.total === "number") total = result.total;
    all.push(...result.rows);

    if (result.rows.length === 0) break;
    if (total !== null ? all.length >= total : result.rows.length < pageSize) break;
    if (page === maxPages - 1) throw new Error("Too many pages; refusing to continue");
  }

  if (total !== null && all.length !== total) {
    throw new Error(`Expected ${total} rows but read ${all.length}; refusing to return incomplete data`);
  }
  return all;
}
