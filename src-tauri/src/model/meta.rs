//! "Tier B meta-build" payload types: the highest-win-rate build for a champion+role+rank, sourced
//! from u.gg's public `stats2` overview JSON.
//!
//! This is **resolver/adapter** surface, *not* engine input. It carries concrete item IDs and names
//! straight from an external stats provider; it never feeds the data-driven recommendation engine
//! (`engine/`). Keeping it in `model/` puts it alongside the other typed FE↔Rust contract payloads.
//!
//! Mirrors `MetaBuild`/`MetaItem`/`MetaItemOption` in `src/types.ts` (serde `camelCase`).

use serde::{Deserialize, Serialize};

/// A champion's meta build for one role + rank on one patch.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaBuild {
    /// DDragon id, echoed back (e.g. "Ahri").
    pub champion: String,
    /// Resolved role: "top" | "jungle" | "mid" | "adc" | "support".
    pub role: String,
    /// Every role u.gg has data for this champion+rank, so the FE can offer a role switcher.
    pub available_roles: Vec<String>,
    /// Resolved rank key name, e.g. "diamond_plus".
    pub rank: String,
    /// Patch the data is for, e.g. "15.9".
    pub patch: String,
    /// Overall win rate of this build (0.0–1.0), if reliably available from the source.
    pub win_rate: Option<f64>,
    /// Number of games this build is computed over, if available.
    pub games: Option<u64>,
    /// Recommended starting items.
    pub starting_items: Vec<MetaItem>,
    /// Core build path (the main mythic/legendary item sequence).
    pub core_items: Vec<MetaItem>,
    /// Situational 4th/5th/6th item options, each with its own win rate.
    pub options: Vec<MetaItemOption>,
    /// Skill-leveling order, e.g. ["Q","W","E","Q",...].
    pub skill_order: Vec<String>,
    /// Max-priority summary string, e.g. "QWE".
    pub skill_max_priority: String,
}

/// A build item, name resolved from DDragon (best-effort: the id as a string if unknown).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaItem {
    pub id: u32,
    pub name: String,
}

/// A situational item option with its win rate over the sampled games.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetaItemOption {
    pub id: u32,
    pub name: String,
    /// Win rate of games that bought this item in this slot (0.0–1.0), if derivable.
    pub win_rate: Option<f64>,
    pub games: Option<u64>,
}
