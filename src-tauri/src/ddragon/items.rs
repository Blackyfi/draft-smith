//! Parsing of DDragon `item.json` into an `id -> ItemMeta` map.

use crate::ddragon::error::Result;
use crate::model::ItemMeta;
use serde::Deserialize;
use std::collections::HashMap;

/// Top level of `item.json`: `{ "type", "version", "data": { "<id>": {...}, ... } }`.
/// We keep `data` as raw values so a single malformed entry can be skipped rather than failing
/// the whole load (defensive parsing, per CLAUDE.md gotchas).
#[derive(Debug, Deserialize)]
struct ItemFile {
    data: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct RawItem {
    name: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    gold: Gold,
    #[serde(default)]
    image: Image,
}

#[derive(Debug, Default, Deserialize)]
struct Gold {
    #[serde(default)]
    total: u32,
}

#[derive(Debug, Default, Deserialize)]
struct Image {
    #[serde(default)]
    full: String,
}

/// Parses raw `item.json` bytes into `item_id -> ItemMeta`.
///
/// Entries whose key is not a numeric ID, or whose body fails to parse, are skipped with a
/// warning — a few odd entries must not sink the entire catalog.
pub fn parse_items(bytes: &[u8]) -> Result<HashMap<u32, ItemMeta>> {
    let file: ItemFile = serde_json::from_slice(bytes)?;
    let mut map = HashMap::with_capacity(file.data.len());
    for (key, value) in file.data {
        let Ok(id) = key.parse::<u32>() else {
            log::warn!("DDragon item: skipping non-numeric key {key:?}");
            continue;
        };
        match serde_json::from_value::<RawItem>(value) {
            Ok(raw) => {
                map.insert(
                    id,
                    ItemMeta {
                        id,
                        name: raw.name,
                        total_cost: raw.gold.total,
                        tags: raw.tags,
                        image: raw.image.full,
                    },
                );
            }
            Err(err) => log::warn!("DDragon item {id}: skipping unparseable entry: {err}"),
        }
    }
    Ok(map)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_well_formed_items() {
        let json = br#"{
            "type": "item",
            "version": "14.10.1",
            "data": {
                "1001": {
                    "name": "Boots",
                    "tags": ["Boots"],
                    "gold": { "base": 300, "total": 300, "sell": 210, "purchasable": true },
                    "image": { "full": "1001.png" }
                },
                "3157": {
                    "name": "Zhonya's Hourglass",
                    "tags": ["Armor", "SpellDamage"],
                    "gold": { "total": 3250 },
                    "image": { "full": "3157.png" }
                }
            }
        }"#;
        let items = parse_items(json).unwrap();
        assert_eq!(items.len(), 2);
        let zhonyas = &items[&3157];
        assert_eq!(zhonyas.name, "Zhonya's Hourglass");
        assert_eq!(zhonyas.total_cost, 3250);
        assert_eq!(zhonyas.image, "3157.png");
        assert!(zhonyas.tags.contains(&"Armor".to_string()));
    }

    #[test]
    fn tolerates_missing_optional_fields() {
        // No gold, tags, or image: defaults fill in rather than failing.
        let json = br#"{ "data": { "9999": { "name": "Mystery" } } }"#;
        let items = parse_items(json).unwrap();
        let item = &items[&9999];
        assert_eq!(item.total_cost, 0);
        assert!(item.tags.is_empty());
        assert_eq!(item.image, "");
    }

    #[test]
    fn skips_bad_entries_without_failing_the_load() {
        // One non-numeric key, one entry missing the required `name`, one good entry.
        let json = br#"{
            "data": {
                "Accessories": { "name": "Category" },
                "1001": { "name": "Boots", "gold": { "total": 300 } },
                "2222": { "tags": ["NoName"] }
            }
        }"#;
        let items = parse_items(json).unwrap();
        // "Accessories" (non-numeric) and 2222 (no name) are skipped; 1001 survives.
        assert_eq!(items.len(), 1);
        assert!(items.contains_key(&1001));
    }

    #[test]
    fn garbage_top_level_is_an_error_not_a_panic() {
        assert!(parse_items(b"not json at all").is_err());
    }
}
