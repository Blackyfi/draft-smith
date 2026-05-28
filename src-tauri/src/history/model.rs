//! The persisted match-record schema (Part A).
//!
//! These are plain data types — the serialized shape written to `app_data_dir/matches/<id>.json`
//! and the typed contract returned by the history commands (mirrored in `src/types.ts`, serde
//! `camelCase`). They carry only objective facts captured from the Live Client; no engine logic and
//! no champion/item special-casing, so the data-driven invariant is untouched. Designed to be rich
//! enough for the later KPI/analysis phase without re-recording.

use crate::model::engine::AbilitySlot;
use serde::{Deserialize, Serialize};

/// The game's outcome relative to the local player's team, derived from the `GameEnd` event.
/// `Unknown` when the game ended without us capturing that event (the Live Client can cut off the
/// instant a game ends).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MatchResult {
    Win,
    Loss,
    /// Default: the game ended without a captured `GameEnd` event.
    #[default]
    Unknown,
}

/// One owned item, as a display reference (id + resolved name + inventory slot).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemRef {
    pub id: u32,
    pub name: String,
    pub slot: u32,
}

/// Whether an item entered or left a player's inventory at this point in the timeline.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ItemEventKind {
    /// The item appeared (purchase, or a component combining into a completed item).
    Acquired,
    /// The item disappeared (sold, consumed, or a component combined away).
    Removed,
}

/// A single item-inventory transition for one player at one game time.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemEvent {
    /// Seconds since game start when the change was first observed.
    pub game_time: f64,
    /// Correlates to [`MatchPlayer::key`].
    pub player_key: String,
    pub item_id: u32,
    pub name: String,
    pub kind: ItemEventKind,
}

/// A champion-level change for one player.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelEvent {
    pub game_time: f64,
    pub player_key: String,
    /// The new champion level reached.
    pub level: u32,
}

/// A skill-point spend by the **local player** (the only player whose abilities the Live Client
/// exposes). Records which slot was ranked up, to what rank, at what champion level / game time.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillEvent {
    pub game_time: f64,
    pub slot: AbilitySlot,
    /// The ability's new rank after this point (1–5; ultimate 1–3).
    pub ability_rank: u32,
    /// The player's champion level when the point was spent.
    pub champion_level: u32,
    /// The ability's Live Client display name (e.g. "Spirit Rush"); may be empty.
    pub ability_name: String,
}

/// A normalized game event (kill / objective / game start-end), distilled from the Live Client
/// event feed. Optional fields are `None` when the source event didn't carry them.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchEvent {
    pub game_time: f64,
    /// The raw `EventName` (e.g. "ChampionKill", "DragonKill", "GameEnd").
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub killer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub victim: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub assisters: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub recipient: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dragon_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stolen: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turret: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inhib: Option<String>,
}

/// One player's identity and final scoreline in a recorded match. Timelines reference players by
/// [`key`](Self::key); this carries the end-of-game snapshot.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchPlayer {
    /// Stable per-game identity (Riot ID → summoner name → `champion#index` fallback). Join key for
    /// the timelines.
    pub key: String,
    /// Live Client `championName` (the DDragon id, e.g. "Ahri", "Kaisa", "MonkeyKing").
    pub champion: String,
    pub riot_id: String,
    pub summoner_name: String,
    /// `"ORDER"` (blue) or `"CHAOS"` (red).
    pub team: String,
    pub position: String,
    pub is_bot: bool,
    /// True for the local player whose game this record belongs to.
    pub is_self: bool,
    /// The two summoner-spell display names.
    pub summoner_spells: [String; 2],
    pub final_level: u32,
    pub kills: u32,
    pub deaths: u32,
    pub assists: u32,
    pub creep_score: u32,
    pub ward_score: f64,
    /// Final owned items, in inventory-slot order.
    pub final_items: Vec<ItemRef>,
}

/// A fully recorded match — the body of the `get_match` command and the on-disk file.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchRecord {
    /// Unique id (`<endedAtMs>_<selfChampion>`), also the file stem.
    pub id: String,
    /// Wall-clock time recording began (first in-game observation), Unix epoch milliseconds.
    /// `#[serde(default)]` so records written before this field existed still load (as 0).
    #[serde(default)]
    pub started_at: i64,
    /// Wall-clock time the game ended / the record was flushed, Unix epoch milliseconds.
    #[serde(default)]
    pub ended_at: i64,
    /// DraftSmith version that produced the record.
    pub app_version: String,
    /// DDragon patch the game was played on (e.g. "16.11.1").
    pub patch: String,
    pub game_mode: String,
    pub map_name: String,
    pub map_number: u32,
    /// Last observed game time, in seconds (≈ game duration).
    pub duration_seconds: f64,
    pub result: MatchResult,
    /// Live Client `championName` of the local player.
    pub self_champion: String,
    /// All players in the game, in roster order.
    pub players: Vec<MatchPlayer>,
    /// Item-inventory transitions for every player, in observation order.
    pub item_timeline: Vec<ItemEvent>,
    /// Champion-level changes for every player, in observation order.
    pub level_timeline: Vec<LevelEvent>,
    /// Skill-point spends by the local player, in order.
    pub skill_timeline: Vec<SkillEvent>,
    /// Kill / objective / game events, de-duplicated and in feed order.
    pub events: Vec<MatchEvent>,
}

/// A compact projection of a [`MatchRecord`] for the history list — body of `get_match_history`.
/// Carries the local player's headline scoreline so the list renders without loading full records.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchSummary {
    pub id: String,
    /// Wall-clock time the game ended, Unix epoch milliseconds (the list sorts on this).
    pub ended_at: i64,
    pub self_champion: String,
    pub result: MatchResult,
    pub duration_seconds: f64,
    pub game_mode: String,
    pub kills: u32,
    pub deaths: u32,
    pub assists: u32,
    pub creep_score: u32,
}

impl MatchRecord {
    /// Projects this record to the list-view [`MatchSummary`], reading the local player's scoreline.
    pub fn summary(&self) -> MatchSummary {
        let me = self.players.iter().find(|p| p.is_self);
        MatchSummary {
            id: self.id.clone(),
            ended_at: self.ended_at,
            self_champion: self.self_champion.clone(),
            result: self.result,
            duration_seconds: self.duration_seconds,
            game_mode: self.game_mode.clone(),
            kills: me.map_or(0, |p| p.kills),
            deaths: me.map_or(0, |p| p.deaths),
            assists: me.map_or(0, |p| p.assists),
            creep_score: me.map_or(0, |p| p.creep_score),
        }
    }
}
