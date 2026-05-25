use serde::{Deserialize, Serialize};

/// Resolved Data Dragon metadata for a single item, keyed by its numeric item ID.
///
/// This is *raw CDN metadata* (name, cost, descriptive tags) — it carries no engine logic.
/// The intent-tags that drive recommendations (`antiheal`, `magic_pen_percent`, …) live in
/// `rules/data/*.json`, never here, so this type does not touch the data-driven engine
/// invariant (`.claude/rust.md`).
///
/// Mirrors `ItemMeta` in `src/types.ts` (serde `camelCase`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemMeta {
    /// Numeric DDragon item ID (the map key; also carried here for convenience).
    pub id: u32,
    pub name: String,
    /// Total gold cost (DDragon `gold.total`).
    pub total_cost: u32,
    /// DDragon item tags (e.g. "Boots", "Armor", "Damage"); descriptive only.
    pub tags: Vec<String>,
    /// Icon filename (DDragon `image.full`, e.g. `"1001.png"`); resolve to a cached path
    /// via [`crate::ddragon::icons`].
    pub image: String,
}
