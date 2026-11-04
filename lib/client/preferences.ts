/**
 * Optional slip preferences, saved to the account through /api/preferences. Nothing here is
 * required, and a target odds range is a preference to compare a slip against, never a promise.
 */
import type { PreferencesJson } from "@/lib/api/types";
import { api } from "./api";
import { parseOdds } from "./money";

export const SLIP_STYLES = [
  { value: "cautious", label: "Cautious", hint: "Fewer selections and shorter odds when you ask for changes." },
  { value: "balanced", label: "Balanced", hint: "A middle path." },
  { value: "ambitious", label: "Ambitious", hint: "More selections and longer odds when you ask for changes." },
] as const;

export const DETAIL_LEVELS = [
  { value: "brief", label: "Brief" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Detailed" },
] as const;

export type SlipStyleValue = (typeof SLIP_STYLES)[number]["value"];
export type DetailLevelValue = (typeof DETAIL_LEVELS)[number]["value"];

/** What the form holds. Odds stay as typed so a half-entered number is not lost. */
export interface PreferencesFormValues {
  favoriteSports: string[];
  preferredMarkets: string[];
  avoidedMarkets: string[];
  slipStyle: SlipStyleValue | null;
  targetMin: string;
  targetMax: string;
  detailLevel: DetailLevelValue;
}

export const emptyPreferencesForm = (): PreferencesFormValues => ({
  favoriteSports: [],
  preferredMarkets: [],
  avoidedMarkets: [],
  slipStyle: null,
  targetMin: "",
  targetMax: "",
  detailLevel: "standard",
});

export function formFromPreferences(p: PreferencesJson): PreferencesFormValues {
  return {
    favoriteSports: [...p.favoriteSports],
    preferredMarkets: [...p.preferredMarkets],
    avoidedMarkets: [...p.avoidedMarkets],
    slipStyle: p.slipStyle,
    targetMin: p.targetOddsMin === null ? "" : String(p.targetOddsMin),
    targetMax: p.targetOddsMax === null ? "" : String(p.targetOddsMax),
    detailLevel: p.detailLevel,
  };
}

export type PreferencesPayload = {
  favoriteSports: string[];
  preferredMarkets: string[];
  avoidedMarkets: string[];
  slipStyle: SlipStyleValue | null;
  targetOddsMin: number | null;
  targetOddsMax: number | null;
  detailLevel: DetailLevelValue;
};

export function buildPreferencesPayload(
  values: PreferencesFormValues,
): { ok: true; payload: PreferencesPayload } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  let min: number | null = null;
  let max: number | null = null;
  if (values.targetMin.trim() !== "") {
    const r = parseOdds(values.targetMin);
    if (r.ok) min = r.value;
    else errors.targetMin = r.error;
  }
  if (values.targetMax.trim() !== "") {
    const r = parseOdds(values.targetMax);
    if (r.ok) max = r.value;
    else errors.targetMax = r.error;
  }
  if (min !== null && max !== null && min > max) errors.targetMax = "The highest target can't be below the lowest.";

  const preferred = new Set(values.preferredMarkets.map((m) => m.toLowerCase()));
  const clash = values.avoidedMarkets.find((m) => preferred.has(m.toLowerCase()));
  if (clash) errors.avoidedMarkets = `${clash} can't be both preferred and avoided.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    payload: {
      favoriteSports: values.favoriteSports,
      preferredMarkets: values.preferredMarkets,
      avoidedMarkets: values.avoidedMarkets,
      slipStyle: values.slipStyle,
      targetOddsMin: min,
      targetOddsMax: max,
      detailLevel: values.detailLevel,
    },
  };
}

/** Adds the value unless an equal one (ignoring case) is already there. */
export function addItem(list: readonly string[], value: string): string[] {
  const text = value.trim();
  if (text === "" || list.some((x) => x.toLowerCase() === text.toLowerCase())) return [...list];
  return [...list, text];
}

export function removeItem(list: readonly string[], value: string): string[] {
  return list.filter((x) => x.toLowerCase() !== value.toLowerCase());
}

export const hasAnyPreference = (p: PreferencesJson): boolean =>
  p.favoriteSports.length > 0 ||
  p.preferredMarkets.length > 0 ||
  p.avoidedMarkets.length > 0 ||
  p.slipStyle !== null ||
  p.targetOddsMin !== null ||
  p.targetOddsMax !== null;

export const fetchPreferences = () => api<PreferencesJson>("/api/preferences");
export const savePreferences = (payload: PreferencesPayload) => api<PreferencesJson>("/api/preferences", { method: "PUT", body: payload });
export const clearPreferences = () => api<PreferencesJson>("/api/preferences", { method: "DELETE" });
