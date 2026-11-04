import { toPreferencesView } from "./mapping";
import type { PreferencesRepository } from "./repository";
import type { PreferencesView, SavePreferencesInput } from "./types";
import { parsePreferences } from "./validate";

/**
 * Optional slip preferences. Nothing here is required: a user who never saves any simply gets the
 * defaults back (saved: false), and saved preferences can be replaced or removed at any time.
 * A target odds range is something a slip is compared against, never a promise about odds or results.
 */

export interface PreferencesServiceDeps {
  repo: PreferencesRepository;
}

/** The user's preferences, or the defaults when they have never saved any. */
export async function getPreferences(deps: PreferencesServiceDeps): Promise<PreferencesView> {
  return toPreferencesView(await deps.repo.getPreferences());
}

/** Replaces the whole set. A field left out is cleared, so what is stored is exactly what was last saved. */
export async function savePreferences(deps: PreferencesServiceDeps, input: SavePreferencesInput): Promise<PreferencesView> {
  await deps.repo.savePreferences(parsePreferences(input));
  return getPreferences(deps);
}

/** Removes every saved preference ("skip" or start over). Returns the defaults. */
export async function clearPreferences(deps: PreferencesServiceDeps): Promise<PreferencesView> {
  await deps.repo.clearPreferences();
  return getPreferences(deps);
}
