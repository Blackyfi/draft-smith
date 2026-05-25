/**
 * Frontend mirror of the Rust Tauri command/event contract (PROJECT_SPEC §4.2).
 *
 * This file is the single source of FE truth for the contract. Whenever a Rust payload type
 * in `src-tauri/src/model/` changes, update the matching type here in the same change so the
 * two sides cannot silently drift.
 */

/**
 * Mirrors `ConnectionStatus` in `src-tauri/src/model/status.rs` (serde `kebab-case`).
 * Generic by design — carries no champion/item knowledge.
 */
export type ConnectionStatus = "no-game" | "connecting" | "in-game" | "error";

/**
 * Mirrors `DdragonStatus` in `src-tauri/src/model/ddragon.rs` (serde `kebab-case`).
 * Emitted as the `ddragon-status` event (PROJECT_SPEC §4.2).
 */
export type DdragonStatus = "checking" | "updating" | "ready" | "offline";

/**
 * Mirrors `ItemMeta` in `src-tauri/src/model/item.rs` (serde `camelCase`).
 * Raw Data Dragon metadata — no engine logic; intent-tags live in the Rust `rules/data`.
 */
export interface ItemMeta {
  id: number;
  name: string;
  /** Total gold cost (DDragon `gold.total`). */
  totalCost: number;
  /** Descriptive DDragon item tags (e.g. "Boots", "Armor"). */
  tags: string[];
  /** Icon filename (DDragon `image.full`, e.g. "1001.png"). */
  image: string;
}

/**
 * Mirrors `ChampionMeta` in `src-tauri/src/model/champion.rs` (serde `camelCase`).
 * Returned by the `get_champion_meta` command.
 */
export interface ChampionMeta {
  /** Numeric champion key (DDragon `key`); the Live Client ID space. */
  key: number;
  /** DDragon string id (e.g. "Ahri", "MonkeyKing"). */
  id: string;
  /** Display name (e.g. "Ahri", "Wukong"). */
  name: string;
  /** Descriptive DDragon champion tags (e.g. "Mage", "Assassin"). */
  tags: string[];
  /** Icon filename (DDragon `image.full`, e.g. "Ahri.png"). */
  image: string;
}
