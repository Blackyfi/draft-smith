import { convertFileSrc, invoke } from "@tauri-apps/api/core";

import type {
  ChampionMeta,
  ConnectionStatus,
  DdragonStatus,
  Recommendation,
  Settings,
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
};

/**
 * Turns an on-disk icon path from the Rust side into a URL the webview can load via Tauri's
 * asset protocol (scoped to the DDragon cache dir in `tauri.conf.json`). `null` stays `null` so
 * callers can fall back to a placeholder.
 */
function toAssetUrl(path: string | null): string | null {
  return path == null ? null : convertFileSrc(path);
}
