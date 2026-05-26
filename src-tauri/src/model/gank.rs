//! Jungle gank-window alert types — part of the typed FE↔Rust contract (the `gank-alert` event).
//!
//! This is an honest PREDICTION, not map vision: the app cannot and must not see the map. The
//! alert is derived purely from the enemy jungler's champion gank-style (data-driven, from
//! `rules/data/jungle_timings.json`), their live level, and the game clock — never from any
//! Riot-forbidden source. Champion gank-style classification lives in JSON, not engine control
//! flow, so adding a champion is a data edit.
//!
//! Mirrored in `src/types.ts`.

use serde::{Deserialize, Serialize};

/// A champion's gank-timing style, classifying *when* its first real gank threat lands. Stored per
/// champion in `rules/data/jungle_timings.json` (hence `Deserialize`) and carried in the
/// `gank-alert` payload (hence `Serialize`); unlisted champions default to [`GankStyle::Standard`].
/// This is an abstract attribute the alert logic reasons over — never a champion name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum GankStyle {
    /// Level-3 gankers that path straight to a lane (~2:45).
    Early,
    /// Full-clear-then-gank junglers (~3:15). The default for unlisted champions.
    Standard,
    /// Scaling farmers whose first real gank threat is their level-6 ultimate.
    Farming,
}

/// Which gank window an alert refers to.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GankAlertKind {
    /// The jungler's first gank window (timing depends on [`GankStyle`]).
    FirstGank,
    /// The level-6 power spike (ultimate online).
    Ultimate,
}

/// A one-shot, transient gank-window alert emitted on the `gank-alert` event. The frontend turns
/// it into a brief bright alert (+ optional sound). Advisory only — it never reflects map state.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GankAlert {
    /// Enemy jungler's Live Client `championName` (the FE resolves icon + display name).
    pub jungler: String,
    pub kind: GankAlertKind,
    pub style: GankStyle,
    /// Short generated advisory line, e.g. "Early ganker — watch your lane.".
    pub message: String,
}
