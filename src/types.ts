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
 * Mirrors `IntentTag` in `src-tauri/src/model/item.rs` (serde `snake_case`).
 * Abstract intent labels produced by the engine's item classifier — what an item *does* at a
 * strategic level. "unknown" is filtered out by Rust before emission; the FE skips it anyway.
 */
export type IntentTag =
  | "magic_pen_flat"
  | "magic_pen_percent"
  | "armor_pen_flat"
  | "armor_pen_percent"
  | "burst_amp"
  | "stasis_survival"
  | "spellshield"
  | "antiheal"
  | "percent_hp_damage"
  | "ability_haste"
  | "armor_self"
  | "mr_self"
  | "health_self"
  | "move_speed"
  | "lifesteal"
  | "omnivamp"
  | "crit"
  | "on_hit"
  | "lethality"
  | "sustain"
  | "unknown";

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
  /** Short description (DDragon `plaintext`). */
  plaintext: string;
  /** Full stripped description (DDragon `description` with HTML tags removed). */
  description: string;
  /** Flat HP granted by the item (DDragon `stats.FlatHPPoolMod`). */
  flatHp: number;
  /** Flat armor granted by the item (DDragon `stats.FlatArmorMod`). */
  flatArmor: number;
  /** Flat magic resistance granted by the item (DDragon `stats.FlatSpellBlockMod`). */
  flatMr: number;
  /** Displayable stat lines parsed from the DDragon description `<stats>` block; empty for
   *  items with no stats (consumables, trinkets). */
  stats: ItemStat[];
}

/**
 * Mirrors `ItemStat` in `src-tauri/src/model/item.rs` (serde `camelCase`).
 * One stat line from a DDragon item's `<stats>` block: a leading value (units preserved) + label.
 */
export interface ItemStat {
  /** The numeric value as authored, units preserved (e.g. "18", "15%", "+8"). */
  value: string;
  /** The stat name following the value (e.g. "Lethality", "Ability Haste", "Health"). */
  label: string;
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
 * Mirrors `ResistKind` in `src-tauri/src/model/engine.rs` (serde `kebab-case`).
 * Which resistance type is relevant for the durability estimate against the player's damage.
 */
export type ResistKind = "armor" | "magic" | "none";

/**
 * Mirrors `Durability` in `src-tauri/src/model/engine.rs` (serde `camelCase`).
 * Estimated durability of an enemy vs the player's damage type. This is an approximation:
 * it excludes enemy runes and is calculated from full HP.
 */
export interface Durability {
  /** Effective HP factoring in the relevant resistance (after pen). */
  effectiveHp: number;
  /** Raw HP pool. */
  rawHp: number;
  /** The resistance value (armor or MR) before pen. */
  resist: number;
  /** The resistance value after the player's penetration is applied. */
  resistAfterPen: number;
  /** Which resistance dimension is relevant ("armor" | "magic" | "none"). */
  resistKind: ResistKind;
  /** Estimated number of full casts of the primary burst ability to kill from full HP. */
  castsToKill: number | null;
  /** Which ability slot provides the burst damage estimate. */
  abilitySlot: AbilitySlot | null;
  /** Display name of the ability (from the Live Client), or null when unavailable. */
  abilityName: string | null;
  /** Estimated damage per cast used for the calculation. */
  perCastDamage: number | null;
}

/**
 * Mirrors `EnemyThreatView` in `src-tauri/src/model/engine.rs` (serde `camelCase`).
 * One enemy row for the threat board.
 */
export interface EnemyThreatView {
  champion: string;
  archetype: Archetype;
  signals: LiveSignal[];
  /** Owned item ids in slot order; empty until the enemy buys something. */
  items: number[];
  /** Durability estimate vs the player's damage, or null when not yet computed. */
  durability: Durability | null;
}

/**
 * Mirrors `ItemIntel` in `src-tauri/src/model/engine.rs` (serde `camelCase`).
 * Enriched view of an enemy-owned item: what it does, who owns it, and whether it counters the
 * player's champion. Emitted as part of `Recommendation.enemyItems`.
 */
export interface ItemIntel {
  id: number;
  name: string;
  /** Strategic intent tags (what the item does); "unknown" already filtered out by Rust. */
  intents: IntentTag[];
  /** Enemy Live Client championNames who own this item, deduped, first-seen order. */
  owners: string[];
  /** True when the item specifically counters the player's champion/archetype. */
  countersYou: boolean;
  /** Short explanation of why it counters you, or null. */
  countersYouReason: string | null;
  /** Actionable hint for how to play around it, or null. */
  counterHint: string | null;
}

/**
 * Mirrors `FocusPriority` in `src-tauri/src/model/engine.rs` (serde `kebab-case`).
 * How urgently to prioritize a focus target in fights.
 */
export type FocusPriority = "primary" | "secondary";

/**
 * Mirrors `FocusTarget` in `src-tauri/src/model/engine.rs` (serde `camelCase`).
 * One "who to focus in fights" suggestion; `reason` is framed for the player's own archetype.
 */
export interface FocusTarget {
  champion: string;
  priority: FocusPriority;
  /** Generated rationale (e.g. "Delete Zed — their squishiest high-value carry."). */
  reason: string;
}

/**
 * Mirrors `AbilitySlot` in `src-tauri/src/model/engine.rs` (serde `UPPERCASE`).
 * The four ability *slots* — not the player's keybinds. The displayed key is a settings choice
 * (`abilityKeys`), so map this slot → letter on the frontend.
 */
export type AbilitySlot = "Q" | "W" | "E" | "R";

/**
 * Mirrors `SkillAdvice` in `src-tauri/src/model/engine.rs` (serde `camelCase`).
 * The next ability to rank up (skill-order coach); `null` on `Recommendation.skill` when there's
 * no live ability data or no authored skill plan for the champion.
 */
export interface SkillAdvice {
  /** Which slot to put the next point in. */
  slot: AbilitySlot;
  /** Ability display name from the Live Client (e.g. "Spirit Rush"); may be empty. */
  abilityName: string;
  /** True when a point is unspent right now → emphasize "level up now"; false = look-ahead. */
  pointAvailable: boolean;
  /** Champion level this pick is for. */
  atLevel: number;
  /** Generated rationale (e.g. "Max Q first", "Take your ultimate"). */
  reason: string;
}

/**
 * Mirrors `AbilityRanks` in `src-tauri/src/model/engine.rs` (serde `camelCase`).
 * The active player's current ability ranks (points invested per slot). Drives the live
 * skill-order progress highlight; all zero before the game or when live data is absent.
 */
export interface AbilityRanks {
  q: number;
  w: number;
  e: number;
  r: number;
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
  /** Who to prioritize in fights (1–2 targets), framed for the player's archetype. */
  focus: FocusTarget[];
  /** Which ability to level next, or null when unavailable / champion not authored. */
  skill: SkillAdvice | null;
  /** The player's current ability ranks (Q/W/E/R) for live skill-order progress. */
  abilityRanks: AbilityRanks;
  /** Enriched intel for every item the enemies own; ordered by strategic relevance. */
  enemyItems: ItemIntel[];
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
 * Mirrors `KeyLayout` in `src-tauri/src/model/settings.rs` (serde `kebab-case`).
 * Display-only: maps ability slots (Q/W/E/R) to the keys the player actually presses.
 * `qwerty` → Q W E R, `azerty` → A Z E R, `custom` → `AbilityKeys.custom`.
 */
export type KeyLayout = "qwerty" | "azerty" | "custom";

/**
 * Mirrors `MovementMode` in `src-tauri/src/model/settings.rs` (serde `kebab-case`).
 * In-game movement scheme. `mouse` = classic right-click-to-move (abilities on the layout letters).
 * `keyboard` = League's Keyboard (WASD) input, where the Q ability moves to the right mouse button
 * and the W ability moves to Left Shift; E/R stay on their layout keys. Display-only.
 */
export type MovementMode = "mouse" | "keyboard";

/**
 * Mirrors `AbilityKeys` in `src-tauri/src/model/settings.rs` (serde `camelCase`).
 * How ability slots are labeled in the skill-order coach.
 */
export interface AbilityKeys {
  layout: KeyLayout;
  /** Custom display letters for slots [Q, W, E, R]; used only when `layout === "custom"`. */
  custom: [string, string, string, string];
  /** Movement scheme; remaps the Q/W slot labels (Q→right-click, W→Shift) when `"keyboard"`. */
  movementMode: MovementMode;
}

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
  /** How ability keys are labeled in the skill-order coach (display-only). */
  abilityKeys: AbilityKeys;
  /** Rank bracket for the Meta panel (default: "diamond_plus"). */
  metaRank: Rank;
  /** Whether the Meta panel is shown beside the Adapt panel in-game (default: true). */
  showMetaPanel: boolean;
  /** Whether to show the jungle gank window overlay alert (default: true). */
  gankAlertsEnabled: boolean;
  /** Whether to play a short sound when a gank alert fires (default: true). */
  gankAlertSound: boolean;
}

/**
 * Mirrors `GankStyle` in `src-tauri/src/model/gank.rs` (serde `kebab-case`).
 * The jungler's general playstyle this game — informs the urgency/copy of the alert.
 */
export type GankStyle = "early" | "standard" | "farming";

/**
 * Mirrors `GankAlertKind` in `src-tauri/src/model/gank.rs` (serde `kebab-case`).
 * What triggered the gank window alert.
 */
export type GankAlertKind = "first-gank" | "ultimate";

/**
 * Mirrors `GankAlert` in `src-tauri/src/model/gank.rs` (serde `camelCase`).
 * Payload of the transient `gank-alert` Tauri event emitted by the Rust poller when the enemy
 * jungler hits a gank-relevant moment. Resolved display name + icon are handled FE-side from the
 * Live Client `championName` (the DDragon id).
 */
export interface GankAlert {
  /** Live Client championName (DDragon id, e.g. "MasterYi"). Resolve icon + display name FE-side. */
  jungler: string;
  kind: GankAlertKind;
  style: GankStyle;
  /** Short, human-readable message from Rust (e.g. "Just hit level 6 — ult is up"). */
  message: string;
}

/**
 * Mirrors `MetaItem` in `src-tauri/src/model/meta.rs` (serde `camelCase`).
 * A single item in a meta build slot (core or starting) — no win-rate.
 */
export interface MetaItem {
  id: number;
  name: string;
}

/**
 * Mirrors `MetaItemOption` in `src-tauri/src/model/meta.rs` (serde `camelCase`).
 * A situational item option, optionally decorated with win-rate + game count from u.gg.
 */
export interface MetaItemOption {
  id: number;
  name: string;
  winRate: number | null;
  games: number | null;
}

/**
 * Mirrors `MetaBuild` in `src-tauri/src/model/meta.rs` (serde `camelCase`).
 * Highest win-rate build for a champion+role from u.gg (Tier B, PROJECT_SPEC §3.5).
 * Fetched once at game start, cached to disk, never polled mid-game.
 */
export interface MetaBuild {
  /** DDragon champion id (e.g. "Ahri", "Kaisa"). */
  champion: string;
  /** Resolved role: "top" | "jungle" | "mid" | "adc" | "support". */
  role: string;
  /** All roles with data available for this champion. */
  availableRoles: string[];
  /** Rank bracket (e.g. "diamond_plus"). */
  rank: string;
  /** Data Dragon patch version the data reflects (e.g. "15.9"). */
  patch: string;
  /** Win rate as a fraction (0–1), or null when unknown. */
  winRate: number | null;
  /** Sample size, or null when unknown. */
  games: number | null;
  /** Opening item set (e.g. starter + potions). */
  startingItems: MetaItem[];
  /** Core build items in order. */
  coreItems: MetaItem[];
  /** Situational fourth/fifth-slot choices with individual win rates. */
  options: MetaItemOption[];
  /** Recommended skill level order, e.g. ["Q","W","E","Q","Q","R",...]. */
  skillOrder: string[];
  /** Max priority shorthand, e.g. "QWE". */
  skillMaxPriority: string;
}

/**
 * Mirrors `Rank` in `src-tauri/src/model/meta.rs` (serde `kebab-case`).
 * The matchmaking bracket to pull meta-build statistics from.
 */
export type Rank =
  | "challenger"
  | "master_plus"
  | "diamond_plus"
  | "emerald_plus"
  | "platinum_plus";

/**
 * Mirrors `UpdateInfo` in `src-tauri/src/commands.rs` (serde `camelCase`).
 * Returned by `check_for_update`; `null` from that command means "up to date".
 */
export interface UpdateInfo {
  /** The version offered by the release endpoint (e.g. "0.1.4"). */
  version: string;
  /** The version currently installed (e.g. "0.1.3"). */
  currentVersion: string;
}

// ---------------------------------------------------------------------------
// Match history (Part A) — mirrors `src-tauri/src/history/model.rs` (serde `camelCase`).
// Objective Live-Client facts recorded per game; bodies of get_match_history / get_match and the
// `match-saved` event.
// ---------------------------------------------------------------------------

/** Mirrors `MatchResult` (serde `kebab-case`). Outcome relative to the local player's team. */
export type MatchResult = "win" | "loss" | "unknown";

/** Mirrors `ItemEventKind` (serde `kebab-case`). Whether an item entered or left the inventory. */
export type ItemEventKind = "acquired" | "removed";

/** Mirrors `ItemRef` — one owned item as id + resolved name + inventory slot. */
export interface ItemRef {
  id: number;
  name: string;
  slot: number;
}

/** Mirrors `ItemEvent` — one item-inventory transition for one player at one game time. */
export interface ItemEvent {
  /** Seconds since game start when first observed. */
  gameTime: number;
  /** Correlates to `MatchPlayer.key`. */
  playerKey: string;
  itemId: number;
  name: string;
  kind: ItemEventKind;
}

/** Mirrors `LevelEvent` — a champion-level change for one player. */
export interface LevelEvent {
  gameTime: number;
  playerKey: string;
  level: number;
}

/** Mirrors `SkillEvent` — a skill-point spend by the local player (only our abilities are exposed). */
export interface SkillEvent {
  gameTime: number;
  slot: AbilitySlot;
  /** The ability's new rank after this point. */
  abilityRank: number;
  /** The player's champion level when the point was spent. */
  championLevel: number;
  abilityName: string;
}

/** Mirrors `MatchEvent` — a normalized kill / objective / game event. Optional fields omitted when absent. */
export interface MatchEvent {
  gameTime: number;
  /** Raw `EventName` (e.g. "ChampionKill", "DragonKill", "GameEnd"). */
  kind: string;
  killer?: string;
  victim?: string;
  assisters?: string[];
  recipient?: string;
  dragonType?: string;
  stolen?: boolean;
  turret?: string;
  inhib?: string;
}

/** Mirrors `MatchPlayer` — one player's identity + final scoreline in a recorded match. */
export interface MatchPlayer {
  /** Stable per-game id (join key for the timelines). */
  key: string;
  /** Live Client `championName` (DDragon id). */
  champion: string;
  riotId: string;
  summonerName: string;
  /** "ORDER" (blue) or "CHAOS" (red). */
  team: string;
  position: string;
  isBot: boolean;
  /** True for the local player whose game this record belongs to. */
  isSelf: boolean;
  /** The two summoner-spell display names. */
  summonerSpells: [string, string];
  finalLevel: number;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
  wardScore: number;
  /** Final owned items, in inventory-slot order. */
  finalItems: ItemRef[];
}

/** Mirrors `MatchRecord` — a fully recorded match; body of `get_match`. */
export interface MatchRecord {
  /** Unique id (`<recordedAtMs>_<selfChampion>`), also the file stem. */
  id: string;
  /** Wall-clock flush time, Unix epoch milliseconds. */
  recordedAt: number;
  /** DraftSmith version that produced the record. */
  appVersion: string;
  /** DDragon patch the game was played on. */
  patch: string;
  gameMode: string;
  mapName: string;
  mapNumber: number;
  /** Last observed game time, seconds (≈ duration). */
  durationSeconds: number;
  result: MatchResult;
  /** Live Client `championName` of the local player. */
  selfChampion: string;
  players: MatchPlayer[];
  itemTimeline: ItemEvent[];
  levelTimeline: LevelEvent[];
  /** Skill-point spends by the local player, in order. */
  skillTimeline: SkillEvent[];
  events: MatchEvent[];
}

/**
 * Mirrors `MatchSummary` — compact list-view projection; body of `get_match_history` and the
 * `match-saved` event. Scoreline is the local player's.
 */
export interface MatchSummary {
  id: string;
  recordedAt: number;
  selfChampion: string;
  result: MatchResult;
  durationSeconds: number;
  gameMode: string;
  kills: number;
  deaths: number;
  assists: number;
  creepScore: number;
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
