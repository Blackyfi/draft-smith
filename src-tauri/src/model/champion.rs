use serde::{Deserialize, Serialize};

/// Resolved Data Dragon metadata for a single champion.
///
/// Raw CDN metadata only (key, id, name, descriptive tags). Champion *archetypes* and build
/// rules that the engine reasons over live in `rules/data/*.json`, never here — so this type
/// does not touch the data-driven engine invariant (`.claude/rust.md`).
///
/// Mirrors `ChampionMeta` in `src/types.ts` (serde `camelCase`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampionMeta {
    /// Numeric champion key (DDragon `key`). This is the ID space the Live Client uses, so it
    /// is the primary lookup key.
    pub key: u32,
    /// DDragon string id (e.g. `"Ahri"`, `"MonkeyKing"`); also the per-champion file name.
    pub id: String,
    /// Display name (e.g. `"Ahri"`, `"Wukong"`).
    pub name: String,
    /// DDragon champion tags (e.g. "Mage", "Assassin"); descriptive only.
    pub tags: Vec<String>,
    /// Icon filename (DDragon `image.full`, e.g. `"Ahri.png"`); resolve to a cached path via
    /// [`crate::ddragon::icons`].
    pub image: String,
}
