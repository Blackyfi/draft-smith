//! Parsing of DDragon `champion.json` into a lookup index.

use crate::ddragon::error::Result;
use crate::model::ChampionMeta;
use serde::Deserialize;
use std::collections::HashMap;

/// Top level of `champion.json`: `{ "type", "version", "data": { "<Id>": {...}, ... } }`.
#[derive(Debug, Deserialize)]
struct ChampionFile {
    data: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct RawChampion {
    /// Numeric key, delivered as a string (e.g. `"103"`).
    key: String,
    id: String,
    name: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    image: Image,
    #[serde(default)]
    stats: RawStats,
}

#[derive(Debug, Default, Deserialize)]
struct Image {
    #[serde(default)]
    full: String,
}

/// The subset of DDragon `stats` the durability estimator needs (HP + resists and their per-level
/// growth). Every field is `#[serde(default)]` so a champion missing a stats block — or a field —
/// parses to zero rather than failing the whole load.
#[derive(Debug, Default, Deserialize)]
struct RawStats {
    #[serde(default)]
    hp: f32,
    #[serde(default)]
    hpperlevel: f32,
    #[serde(default)]
    armor: f32,
    #[serde(default)]
    armorperlevel: f32,
    #[serde(default)]
    spellblock: f32,
    #[serde(default)]
    spellblockperlevel: f32,
}

/// A champion's base HP/armor/MR and their per-level growth, parsed from DDragon `champion.json`.
///
/// Raw CDN numbers only — no engine logic. The durability estimator (a pure engine fn) consumes the
/// *resolved* values via the poller, never this type, so it does not touch the data-driven invariant.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ChampionBaseStats {
    pub hp: f32,
    pub hp_per_level: f32,
    pub armor: f32,
    pub armor_per_level: f32,
    pub mr: f32,
    pub mr_per_level: f32,
}

impl ChampionBaseStats {
    /// Resolves (hp, armor, mr) at a champion `level` using Riot's standard per-level growth curve:
    /// `stat = base + growth * (l-1) * (0.7025 + 0.0175*(l-1))`, with `l = level.max(1)`.
    pub fn at_level(&self, level: u32) -> (f32, f32, f32) {
        let l = level.max(1) as f32;
        let factor = (l - 1.0) * (0.7025 + 0.0175 * (l - 1.0));
        (
            self.hp + self.hp_per_level * factor,
            self.armor + self.armor_per_level * factor,
            self.mr + self.mr_per_level * factor,
        )
    }
}

/// A resolved champion lookup index.
///
/// The Live Client identifies champions by numeric key, so `by_key` is the primary lookup. The
/// frontend, however, only ever has a champion's **display name** (the `/allgamedata` payload and
/// the engine's `Recommendation` carry names, not keys), so a name index backs the champion-icon
/// commands (M4, the first consumer of name lookup). Display names are unique in DDragon.
#[derive(Debug, Clone, Default)]
pub struct ChampionIndex {
    by_key: HashMap<u32, ChampionMeta>,
    /// Display name → numeric key, so name lookups reuse the `by_key` store.
    name_to_key: HashMap<String, u32>,
    /// DDragon id → numeric key. The Live Client's `championName` is actually the **id**
    /// ("Kaisa", "LeeSin", "MonkeyKing"), not the display name, so id lookup backs icon resolution
    /// for champions whose id differs from their display name (Kai'Sa, Lee Sin, Wukong, …).
    id_to_key: HashMap<String, u32>,
    /// Base defensive stats keyed by numeric key — the durability estimator's source of enemy HP/
    /// resists (resolved per-level in the poller, never read by the pure engine).
    base_stats_by_key: HashMap<u32, ChampionBaseStats>,
}

impl ChampionIndex {
    /// Looks up a champion by its numeric key (the Live Client ID space).
    pub fn by_key(&self, key: u32) -> Option<&ChampionMeta> {
        self.by_key.get(&key)
    }

    /// Looks up a champion by its display name (e.g. "Ahri", "Wukong").
    pub fn by_name(&self, name: &str) -> Option<&ChampionMeta> {
        self.name_to_key
            .get(name)
            .and_then(|key| self.by_key.get(key))
    }

    /// Looks up a champion by its DDragon id (e.g. "Ahri", "MonkeyKing", "Kaisa").
    pub fn by_id(&self, id: &str) -> Option<&ChampionMeta> {
        self.id_to_key.get(id).and_then(|key| self.by_key.get(key))
    }

    /// Resolves a champion from whatever string the live payload / engine carries. That value is
    /// the DDragon **id** in practice, but we try the display name first so a genuine display name
    /// (e.g. from a hand-written fixture) still resolves. Used by the champion-icon command.
    pub fn by_name_or_id(&self, name_or_id: &str) -> Option<&ChampionMeta> {
        self.by_name(name_or_id).or_else(|| self.by_id(name_or_id))
    }

    /// Resolves a champion's numeric key from whatever string the live payload / engine carries
    /// (display name first, then DDragon id) — the join key for [`base_stats`](Self::base_stats).
    fn key_of(&self, name_or_id: &str) -> Option<u32> {
        self.name_to_key
            .get(name_or_id)
            .or_else(|| self.id_to_key.get(name_or_id))
            .copied()
    }

    /// Base defensive stats for a champion by display name or DDragon id, if known.
    pub fn base_stats(&self, name_or_id: &str) -> Option<&ChampionBaseStats> {
        self.key_of(name_or_id)
            .and_then(|key| self.base_stats_by_key.get(&key))
    }

    /// Number of resolved champions.
    pub fn count(&self) -> usize {
        self.by_key.len()
    }
}

/// Parses raw `champion.json` bytes into a [`ChampionIndex`].
///
/// Entries with a non-numeric `key` or otherwise unparseable bodies are skipped with a warning
/// rather than failing the whole load.
pub fn parse_champions(bytes: &[u8]) -> Result<ChampionIndex> {
    let file: ChampionFile = serde_json::from_slice(bytes)?;
    let mut by_key = HashMap::with_capacity(file.data.len());
    let mut name_to_key = HashMap::with_capacity(file.data.len());
    let mut id_to_key = HashMap::with_capacity(file.data.len());
    let mut base_stats_by_key = HashMap::with_capacity(file.data.len());
    for (data_key, value) in file.data {
        let raw: RawChampion = match serde_json::from_value(value) {
            Ok(raw) => raw,
            Err(err) => {
                log::warn!("DDragon champion {data_key:?}: skipping unparseable entry: {err}");
                continue;
            }
        };
        let Ok(key) = raw.key.parse::<u32>() else {
            log::warn!(
                "DDragon champion {data_key:?}: skipping non-numeric key {:?}",
                raw.key
            );
            continue;
        };
        name_to_key.insert(raw.name.clone(), key);
        id_to_key.insert(raw.id.clone(), key);
        base_stats_by_key.insert(
            key,
            ChampionBaseStats {
                hp: raw.stats.hp,
                hp_per_level: raw.stats.hpperlevel,
                armor: raw.stats.armor,
                armor_per_level: raw.stats.armorperlevel,
                mr: raw.stats.spellblock,
                mr_per_level: raw.stats.spellblockperlevel,
            },
        );
        by_key.insert(
            key,
            ChampionMeta {
                key,
                id: raw.id,
                name: raw.name,
                tags: raw.tags,
                image: raw.image.full,
            },
        );
    }
    Ok(ChampionIndex {
        by_key,
        name_to_key,
        id_to_key,
        base_stats_by_key,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &[u8] = br#"{
        "type": "champion",
        "version": "14.10.1",
        "data": {
            "Ahri": {
                "id": "Ahri", "key": "103", "name": "Ahri",
                "tags": ["Mage", "Assassin"],
                "image": { "full": "Ahri.png" },
                "stats": {
                    "hp": 590, "hpperlevel": 104,
                    "armor": 21, "armorperlevel": 4.7,
                    "spellblock": 30, "spellblockperlevel": 1.3
                }
            },
            "MonkeyKing": {
                "id": "MonkeyKing", "key": "62", "name": "Wukong",
                "tags": ["Fighter", "Tank"],
                "image": { "full": "MonkeyKing.png" }
            },
            "Kaisa": {
                "id": "Kaisa", "key": "145", "name": "Kai'Sa",
                "tags": ["Marksman"],
                "image": { "full": "Kaisa.png" }
            }
        }
    }"#;

    #[test]
    fn indexes_by_numeric_key() {
        let index = parse_champions(SAMPLE).unwrap();
        assert_eq!(index.count(), 3);
        let ahri = index.by_key(103).unwrap();
        assert_eq!(ahri.name, "Ahri");
        assert_eq!(ahri.image, "Ahri.png");
        // Wukong's DDragon id ("MonkeyKing") differs from its display name ("Wukong").
        let wukong = index.by_key(62).unwrap();
        assert_eq!(wukong.id, "MonkeyKing");
        assert_eq!(wukong.name, "Wukong");
    }

    #[test]
    fn looks_up_by_display_name() {
        let index = parse_champions(SAMPLE).unwrap();
        // The FE only knows display names; resolve them to the same entries as `by_key`.
        assert_eq!(index.by_name("Ahri").unwrap().image, "Ahri.png");
        // Display name, not the DDragon id: "Wukong" resolves, "MonkeyKing" does not.
        assert_eq!(index.by_name("Wukong").unwrap().image, "MonkeyKing.png");
        assert!(index.by_name("MonkeyKing").is_none());
        assert!(index.by_name("Nobody").is_none());
    }

    #[test]
    fn looks_up_by_id_for_icon_resolution() {
        let index = parse_champions(SAMPLE).unwrap();
        // The Live Client's `championName` is the DDragon id, not the display name.
        assert_eq!(index.by_id("MonkeyKing").unwrap().image, "MonkeyKing.png");
        assert_eq!(index.by_id("Kaisa").unwrap().image, "Kaisa.png");
        assert!(index.by_id("Wukong").is_none());
    }

    #[test]
    fn by_name_or_id_resolves_either_form() {
        let index = parse_champions(SAMPLE).unwrap();
        // The bug fix: "Kaisa" (id from the live payload) must resolve even though the display
        // name is "Kai'Sa". Both the id and a genuine display name resolve to the same icon.
        assert_eq!(index.by_name_or_id("Kaisa").unwrap().image, "Kaisa.png");
        assert_eq!(index.by_name_or_id("Kai'Sa").unwrap().image, "Kaisa.png");
        assert_eq!(index.by_name_or_id("Ahri").unwrap().image, "Ahri.png");
        assert!(index.by_name_or_id("Nobody").is_none());
    }

    #[test]
    fn skips_entries_with_non_numeric_keys() {
        let json = br#"{ "data": {
            "Broken": { "id": "Broken", "key": "not-a-number", "name": "Broken" },
            "Ahri": { "id": "Ahri", "key": "103", "name": "Ahri" }
        } }"#;
        let index = parse_champions(json).unwrap();
        assert_eq!(index.count(), 1);
        assert!(index.by_key(103).is_some());
    }

    #[test]
    fn garbage_top_level_is_an_error_not_a_panic() {
        assert!(parse_champions(b"not json").is_err());
    }

    #[test]
    fn parses_base_stats_from_a_stats_block() {
        let index = parse_champions(SAMPLE).unwrap();
        let ahri = index.base_stats("Ahri").expect("Ahri has a stats block");
        assert_eq!(ahri.hp, 590.0);
        assert_eq!(ahri.armor, 21.0);
        assert_eq!(ahri.mr, 30.0);
        assert_eq!(ahri.armor_per_level, 4.7);
        // Resolvable by DDragon id too (here id == name).
        assert!(index.base_stats("Kaisa").is_some());
        // A champion with no `stats` block parses to all-zero (defaults), not a failed load.
        let wukong = index.base_stats("Wukong").expect("present, defaulted");
        assert_eq!(wukong.hp, 0.0);
    }

    #[test]
    fn at_level_one_equals_base_and_grows_with_level() {
        let stats = ChampionBaseStats {
            hp: 590.0,
            hp_per_level: 104.0,
            armor: 21.0,
            armor_per_level: 4.7,
            mr: 30.0,
            mr_per_level: 1.3,
        };
        // Level 1 (and the level-0 clamp) returns the unmodified base.
        let (hp1, armor1, mr1) = stats.at_level(1);
        assert_eq!((hp1, armor1, mr1), (590.0, 21.0, 30.0));
        assert_eq!(stats.at_level(0), stats.at_level(1));
        // A higher level strictly increases every stat that has growth.
        let (hp11, armor11, mr11) = stats.at_level(11);
        assert!(hp11 > hp1);
        assert!(armor11 > armor1);
        assert!(mr11 > mr1);
    }
}
