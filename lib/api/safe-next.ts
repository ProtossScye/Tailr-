/** Only allow same-site relative paths, so a crafted link cannot bounce users to another site. */
export function safeNext(next: string | null | undefined, fallback = "/dashboard"): string {
  return next && /^\/(?![/\\])/.test(next) ? next : fallback;
}
