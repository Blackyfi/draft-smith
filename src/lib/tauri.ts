import { convertFileSrc, invoke } from "@tauri-apps/api/core";

import type {
  ChampionMeta,
  ConnectionStatus,
  DdragonStatus,
  ItemMeta,
  MatchRecord,
  MatchSummary,
  MetaBuild,
  Recommendation,
  Settings,
  UpdateInfo,
} from "@/types";

/**
 * Thin typed bridge over Tauri commands (FE→Rust, PROJECT_SPEC §4.2).
 *
 * Components and hooks call through `api`; they never invoke Tauri directly, so the contract
 * stays in one place and is easy to mock in tests. Event subscriptions live in `@/lib/events`.
 */
export const api = {
  /** Current connection / coaching status. */
  getStatus: () => invoke<ConnectionStatus>("get_status"),

  /**
   * Latest engine recommendation, or `null` when there's no live game. Lets the FE hydrate on
   * mount without waiting for the next `recommendation-updated` event.
   */
  getCurrentRecommendation: () =>
    invoke<Recommendation | null>("get_current_recommendation"),

  /** Re-runs the DDragon bootstrap (force re-download); resolves to the terminal status. */
  forceRefreshDdragon: () => invoke<DdragonStatus>("force_refresh_ddragon"),

  /** Wipes the on-disk DDragon cache, then re-bootstraps from the CDN; resolves to the status. */
  resetDdragonCache: () => invoke<DdragonStatus>("reset_ddragon_cache"),

  /** The cached DDragon patch version (e.g. "14.10.1"), or `null` before data has loaded. */
  getDdragonVersion: () => invoke<string | null>("get_ddragon_version"),

  /** Total on-disk size of the DDragon cache in bytes (item/champion data + downloaded icons). */
  getDdragonCacheSize: () => invoke<number>("get_ddragon_cache_size"),

  /** Current user settings (sanitized by Rust). */
  getSettings: () => invoke<Settings>("get_settings"),

  /**
   * Persists settings and applies side effects (always-on-top, locale re-download). Returns the
   * sanitized settings Rust actually stored — adopt this value rather than the input.
   */
  setSettings: (settings: Settings) =>
    invoke<Settings>("set_settings", { settings }),

  /** Resolved champion metadata by numeric key (Live Client ID space), or `null` if unknown. */
  getChampionMeta: (key: number) =>
    invoke<ChampionMeta | null>("get_champion_meta", { key }),

  /**
   * Resolves an item icon to a webview-loadable URL, downloading it lazily on a cache miss.
   * Returns `null` if DDragon data hasn't loaded or the item is unknown.
   */
  getItemIconUrl: async (id: number) =>
    toAssetUrl(await invoke<string | null>("get_item_icon", { id })),

  /**
   * Resolves a champion icon to a webview-loadable URL by display name — the FE only ever has
   * champion names (live payload + engine output carry names, not keys). `null` if unknown.
   */
  getChampionIconUrl: async (name: string) =>
    toAssetUrl(
      await invoke<string | null>("get_champion_icon_by_name", { name }),
    ),

  /**
   * Resolves a champion's friendly display name ("Kai'Sa") from the Live Client id ("Kaisa").
   * `null` if DDragon data hasn't loaded or the champion is unknown — callers fall back to the id.
   */
  getChampionDisplayName: (name: string) =>
    invoke<string | null>("get_champion_display_name", { name }),

  /** The installed app version (e.g. "0.1.3"). */
  getAppVersion: () => invoke<string>("get_app_version"),

  /** The bundled changelog (Markdown source) for the in-app "What's new" view. */
  getChangelog: () => invoke<string>("get_changelog"),

  /** Checks the release endpoint; resolves to the update or `null` when up to date. Rejects when
   * the check can't complete (offline, no published release yet). */
  checkForUpdate: () => invoke<UpdateInfo | null>("check_for_update"),

  /** Downloads + installs the available update and relaunches the app. */
  installUpdate: () => invoke<void>("install_update"),

  /**
   * Fetches the highest win-rate meta build for a champion+role from the Rust cache (u.gg data,
   * Tier B, PROJECT_SPEC §3.5). `role` may be `null` to let Rust pick the most-played role.
   * Returns `null` when no data is available (champion unknown, patch mismatch, offline).
   */
  getMetaBuild: (champion: string, role: string | null, rank: string) =>
    invoke<MetaBuild | null>("get_meta_build", { champion, role, rank }),

  /**
   * Returns DDragon metadata for an item by numeric id, including name, cost, tags, plaintext, and
   * stripped description. Returns `null` when DDragon data hasn't loaded or the item is unknown.
   */
  getItemMeta: (id: number) => invoke<ItemMeta | null>("get_item_meta", { id }),

  /** Every recorded match as a compact summary, newest first (Part A — Match History list). */
  getMatchHistory: () => invoke<MatchSummary[]>("get_match_history"),

  /** One recorded match in full by id, or `null` if it no longer exists (Match Detail view). */
  getMatch: (id: string) => invoke<MatchRecord | null>("get_match", { id }),

  /** Deletes a recorded match by id (idempotent). */
  deleteMatch: (id: string) => invoke<void>("delete_match", { id }),
};

/**
 * Turns an on-disk icon path from the Rust side into a URL the webview can load via Tauri's
 * asset protocol (scoped to the DDragon cache dir in `tauri.conf.json`). `null` stays `null` so
 * callers can fall back to a placeholder.
 */
function toAssetUrl(path: string | null): string | null {
  return path == null ? null : convertFileSrc(path);
}
