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
    #[serde(default)]
    plaintext: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    stats: Stats,
}

#[derive(Debug, Default, Deserialize)]
struct Gold {
    #[serde(default)]
    total: u32,
}

/// The subset of DDragon item `stats` the durability estimator needs (flat HP/armor/MR). Every
/// field is `#[serde(default)]` so a stat-less item parses to zero rather than failing the load.
#[derive(Debug, Default, Deserialize)]
struct Stats {
    #[serde(rename = "FlatHPPoolMod", default)]
    flat_hp: f32,
    #[serde(rename = "FlatArmorMod", default)]
    flat_armor: f32,
    #[serde(rename = "FlatSpellBlockMod", default)]
    flat_mr: f32,
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
                        plaintext: raw.plaintext,
                        description: clean_description(&raw.description),
                        flat_hp: raw.stats.flat_hp,
                        flat_armor: raw.stats.flat_armor,
                        flat_mr: raw.stats.flat_mr,
                    },
                );
            }
            Err(err) => log::warn!("DDragon item {id}: skipping unparseable entry: {err}"),
        }
    }
    Ok(map)
}

/// Turns the DDragon `description` HTML blob into readable multi-line plain text.
///
/// Block-level tags (`<br>`, `</stats>`, `<li>`, …) become newlines; every other tag is dropped
/// (its inner text kept); the handful of HTML entities DDragon emits are decoded; whitespace is
/// collapsed. Pure and allocation-bounded — defensive against arbitrary tag soup.
fn clean_description(raw: &str) -> String {
    // 1. Normalize the block-level tags that should read as line breaks.
    let mut s = raw.to_string();
    for br in [
        "<br>",
        "<br/>",
        "<br />",
        "</stats>",
        "<li>",
        "</li>",
        "</mainText>",
    ] {
        s = s.replace(br, "\n");
    }

    // 2. Strip every remaining `<...>` tag, keeping inner text.
    let mut without_tags = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => without_tags.push(ch),
            _ => {}
        }
    }

    // 3. Decode the common entities DDragon emits.
    let decoded = without_tags
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        // `&amp;` last so an already-decoded `&` isn't re-processed.
        .replace("&amp;", "&");

    // 4. Collapse intra-line whitespace (spaces/tabs) per line, then trim each line.
    let mut lines: Vec<String> = decoded
        .split('\n')
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect();

    // 5. Collapse runs of 3+ blank lines down to a single blank line (max one separator).
    let mut collapsed: Vec<String> = Vec::with_capacity(lines.len());
    let mut blanks = 0usize;
    for line in lines.drain(..) {
        if line.is_empty() {
            blanks += 1;
            if blanks <= 1 {
                collapsed.push(line);
            }
        } else {
            blanks = 0;
            collapsed.push(line);
        }
    }

    collapsed.join("\n").trim().to_string()
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
                    "image": { "full": "3157.png" },
                    "stats": { "FlatArmorMod": 45, "FlatHPPoolMod": 0 }
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
        assert_eq!(zhonyas.flat_armor, 45.0);
        assert_eq!(zhonyas.flat_mr, 0.0);
    }

    #[test]
    fn parses_defensive_stats_and_defaults_them_to_zero() {
        let json = br#"{
            "data": {
                "3083": {
                    "name": "Warmog's Armor",
                    "gold": { "total": 3100 },
                    "stats": { "FlatHPPoolMod": 800 }
                },
                "1001": {
                    "name": "Boots",
                    "gold": { "total": 300 }
                }
            }
        }"#;
        let items = parse_items(json).unwrap();
        let warmogs = &items[&3083];
        assert_eq!(warmogs.flat_hp, 800.0);
        assert_eq!(warmogs.flat_armor, 0.0);
        // No `stats` block at all → all three default to zero, not a failed parse.
        let boots = &items[&1001];
        assert_eq!(boots.flat_hp, 0.0);
        assert_eq!(boots.flat_armor, 0.0);
        assert_eq!(boots.flat_mr, 0.0);
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

    #[test]
    fn populates_plaintext_and_description() {
        let json = br#"{
            "data": {
                "3142": {
                    "name": "Youmuu's Ghostblade",
                    "plaintext": "Grants Lethality and Move Speed",
                    "description": "<mainText><stats><attention>18</attention> Lethality<br><attention>200</attention> Health</stats><br><li><passive>Ate Up:</passive> dealing damage gives you energy.</li></mainText>"
                }
            }
        }"#;
        let items = parse_items(json).unwrap();
        let item = &items[&3142];
        assert_eq!(item.plaintext, "Grants Lethality and Move Speed");
        assert_eq!(
            item.description,
            "18 Lethality\n200 Health\n\nAte Up: dealing damage gives you energy."
        );
    }

    #[test]
    fn clean_description_strips_stats_and_passive() {
        // `</stats><br><li>` collapses three newline-makers to a single blank-line separator
        // (3+ newlines → 2), so stats and the passive read as separate paragraphs.
        let raw = "<mainText><stats><attention>18</attention> Lethality<br><attention>200</attention> Health</stats><br><li><passive>Ate Up:</passive> dealing damage...</li></mainText>";
        assert_eq!(
            clean_description(raw),
            "18 Lethality\n200 Health\n\nAte Up: dealing damage..."
        );
    }

    #[test]
    fn clean_description_handles_empty_string() {
        assert_eq!(clean_description(""), "");
    }

    #[test]
    fn clean_description_passes_through_text_without_tags() {
        assert_eq!(
            clean_description("Just plain   text here"),
            "Just plain text here"
        );
    }

    #[test]
    fn clean_description_decodes_entities() {
        assert_eq!(
            clean_description("Fire &amp; Ice &#39;burst&#39; &nbsp;effect"),
            "Fire & Ice 'burst' effect"
        );
    }
}
