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
}

#[derive(Debug, Default, Deserialize)]
struct Image {
    #[serde(default)]
    full: String,
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
}

impl ChampionIndex {
    /// Looks up a champion by its numeric key (the Live Client ID space).
    pub fn by_key(&self, key: u32) -> Option<&ChampionMeta> {
        self.by_key.get(&key)
    }

    /// Looks up a champion by its display name (e.g. "Ahri", "Wukong"). Used where only a name is
    /// available — champion icons on the FE.
    pub fn by_name(&self, name: &str) -> Option<&ChampionMeta> {
        self.name_to_key
            .get(name)
            .and_then(|key| self.by_key.get(key))
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
                "image": { "full": "Ahri.png" }
            },
            "MonkeyKing": {
                "id": "MonkeyKing", "key": "62", "name": "Wukong",
                "tags": ["Fighter", "Tank"],
                "image": { "full": "MonkeyKing.png" }
            }
        }
    }"#;

    #[test]
    fn indexes_by_numeric_key() {
        let index = parse_champions(SAMPLE).unwrap();
        assert_eq!(index.count(), 2);
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
}
