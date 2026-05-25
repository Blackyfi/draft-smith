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
 * Mirrors `GameStateSummary` in `src-tauri/src/model/game.rs` (serde `camelCase`).
 * Emitted as the `game-state-changed` event (PROJECT_SPEC §4.2) when the poll diff detects a
 * meaningful change. The full recommendation arrives separately via `recommendation-updated`.
 */
export interface GameStateSummary {
  /** Seconds since game start. */
  gameTime: number;
  /** Game mode (e.g. "CLASSIC"). */
  gameMode: string;
  /** Local player's champion display name, or null if not yet identifiable. */
  selfChampion: string | null;
  /** Number of players in the game (both teams). */
  playerCount: number;
}

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
 * Mirrors `Archetype` in `src-tauri/src/model/engine.rs` (serde `kebab-case`).
 * Abstract role the engine reasons over — never a champion name.
 */
export type Archetype =
  | "assassin"
  | "marksman"
  | "burst-mage"
  | "battlemage"
  | "artillery"
  | "bruiser"
  | "juggernaut"
  | "tank"
  | "enchanter"
  | "catcher";

/**
 * Mirrors `LiveSignal` in `src-tauri/src/model/engine.rs` (serde `kebab-case`).
 * A live, item-/state-derived signal about an enemy. Pair color with this text + an icon in the UI
 * (frontend.md: color is never the only signal).
 */
export type LiveSignal =
  | "health-stacking"
  | "armor-stacking"
  | "mr-stacking"
  | "lethality"
  | "has-sustain"
  | "hard-cc"
  | "mobility"
  | "fed";

/**
 * Mirrors `BuildStep` in `src-tauri/src/model/engine.rs` (serde `camelCase`).
 * One item in the ordered path; the first non-`owned` step is the next purchase.
 */
export interface BuildStep {
  itemId: number;
  name: string;
  /** Total gold cost. */
  cost: number;
  /** Already purchased — render checked/dimmed. */
  owned: boolean;
  /** Generated, threat-specific rationale. */
  reason: string;
}

/**
 * Mirrors `SwapSuggestion` in `src-tauri/src/model/engine.rs` (serde `camelCase`).
 * A situational "if X then buy Y" alternative.
 */
export interface SwapSuggestion {
  /** What would make this swap worth it (e.g. "If their healing grows"). */
  trigger: string;
  itemId: number;
  name: string;
  reason: string;
}

/**
 * Mirrors `EnemyThreatView` in `src-tauri/src/model/engine.rs` (serde `camelCase`).
 * One enemy row for the threat board.
 */
export interface EnemyThreatView {
  champion: string;
  archetype: Archetype;
  signals: LiveSignal[];
}

/**
 * Mirrors `Recommendation` in `src-tauri/src/model/engine.rs` (serde `camelCase`).
 * Body of the `recommendation-updated` event and the `get_current_recommendation` command.
 */
export interface Recommendation {
  selfChampion: string;
  /** Ordered I1→I6 path. */
  buildPath: BuildStep[];
  swaps: SwapSuggestion[];
  threats: EnemyThreatView[];
}

/**
 * Mirrors `Theme` in `src-tauri/src/model/settings.rs` (serde `kebab-case`).
 * Applied on the frontend as an `<html>` class; dark-first per PROJECT_SPEC §6.1.
 */
export type Theme = "dark" | "light";

/**
 * Mirrors `Aggressiveness` in `src-tauri/src/model/settings.rs` (serde `kebab-case`).
 * `rules-only` is the only v1 behavior (Tier A); `stats-biased` is the Tier B prior reserved for
 * M7 — persisted but inert, and surfaced as disabled in the UI until then (PROJECT_SPEC §5.3).
 */
export type Aggressiveness = "rules-only" | "stats-biased";

/**
 * Mirrors `Settings` in `src-tauri/src/model/settings.rs` (serde `camelCase`).
 * Body of `get_settings` and the argument to `set_settings` (PROJECT_SPEC §4.2, §6.6). The Rust
 * side is the source of truth: it sanitizes (clamps `pollIntervalSecs` to 2–5) and returns the
 * normalized settings, so the FE should adopt the value `set_settings` returns.
 */
export interface Settings {
  /** Live Client poll cadence in seconds; Rust clamps to 2–5. */
  pollIntervalSecs: number;
  theme: Theme;
  /** Whether the main window stays above other windows. */
  alwaysOnTop: boolean;
  /** Data Dragon text locale (e.g. "en_US"); changing it triggers a re-download. */
  locale: string;
  aggressiveness: Aggressiveness;
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
