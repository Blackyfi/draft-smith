use serde::{Deserialize, Serialize};

/// A lightweight summary of the current game, emitted as the `game-state-changed` event
/// (PROJECT_SPEC §4.2) whenever the poll diff detects a meaningful change.
///
/// Deliberately small: it carries just enough for the header strip and "something changed" cues.
/// The full recommendation flows separately via `recommendation-updated` (M4). Generic by design —
/// no champion/item knowledge drives behavior, so it does not touch the data-driven invariant.
///
/// Mirrors `GameStateSummary` in `src/types.ts` (serde `camelCase`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStateSummary {
    /// Seconds since game start.
    pub game_time: f64,
    /// Game mode (e.g. `"CLASSIC"`).
    pub game_mode: String,
    /// Local player's champion display name, if identifiable.
    pub self_champion: Option<String>,
    /// Number of players in the game (both teams).
    pub player_count: usize,
}
