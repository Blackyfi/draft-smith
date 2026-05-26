//! Pure decode of a u.gg overview JSON `Value` into a [`MetaBuild`] for a given role + rank.
//!
//! No network, no disk, no clock — fully unit-testable against a captured fixture. The functions
//! here resolve item *names* from a DDragon item map, but that is descriptive metadata only; this
//! module is a stats-provider adapter and never touches the data-driven recommendation engine.
//!
//! ## u.gg's enum tables (NOT engine logic — just the provider's wire format)
//! The overview JSON nests as `data[region][rank][role] -> [block, timestamp]`. The string keys are
//! u.gg's own enums, mapped here:
//!
//! - region: `"12"` = World (the only one we read).
//! - rank: see [`rank_key`] — accepts a friendly name ("diamond_plus", ...) and maps to u.gg's code.
//! - role: see [`ROLES`] — `"1"`=jungle, `"2"`=support, `"3"`=adc, `"4"`=top, `"5"`=mid.
//!
//! `block` is an array; the indices we read (verified against the Ahri fixture):
//! - `block[2]` = starting items: `[_, _, [itemIds...]]`
//! - `block[3]` = core items: `[_, _, [itemIds...]]`
//! - `block[4]` = skill order: `[_, _, ["Q","W",...], "QWE"]`
//! - `block[5]` = situational item-option groups: `[[[id, wins, games], ...], ...]`
//! - `block[6]` = `[wins, games]` for the whole role/rank sample (the reliable overall win rate).
//!
//! ### Win-rate interpretation (the spec's open question, resolved against the fixture)
//! The leading two numbers of `block[2]/[3]/[4]` are NOT a clean wins/games pair — the first
//! routinely exceeds the second (e.g. core `[3197, 1685, ...]`), so they are block-popularity
//! counts, not a win rate. The trustworthy overall figure is `block[6] = [wins, games]`: for Ahri
//! mid Diamond+ it reads `[23641, 47359]` (49.9%), and its games count (47359) cleanly identifies
//! the primary role (mid) over the fringe ones (support 301, top 612). So win_rate/games come from
//! `block[6]`, and per-option win rates come from the `[id, wins, games]` triples in `block[5]`
//! (e.g. `[3041, 1549, 1909]` => 81%, sensible). No sibling rankings endpoint is needed.

use crate::model::{ItemMeta, MetaBuild, MetaItem, MetaItemOption};
use std::collections::{HashMap, HashSet};

/// u.gg region code for World (the aggregate across regions).
pub const REGION_WORLD: &str = "12";

/// u.gg role codes mapped to our friendly role names.
pub const ROLES: &[(&str, &str)] = &[
    ("1", "jungle"),
    ("2", "support"),
    ("3", "adc"),
    ("4", "top"),
    ("5", "mid"),
];

/// Maps a friendly rank name to u.gg's rank code. Defaults to Diamond+ ("11") for an unknown name.
pub fn rank_key(rank: &str) -> &'static str {
    match rank {
        "platinum_plus" | "plat_plus" => "10",
        "emerald_plus" => "17",
        "master_plus" => "14",
        "challenger" => "1",
        "diamond" => "3",
        // "diamond_plus" and anything unrecognized fall through to the Diamond+ default.
        _ => "11",
    }
}

/// Maps a u.gg role code to our friendly role name.
fn role_name(code: &str) -> Option<&'static str> {
    ROLES.iter().find(|(c, _)| *c == code).map(|(_, n)| *n)
}

/// Maps our friendly role name to a u.gg role code.
fn role_code(name: &str) -> Option<&'static str> {
    ROLES.iter().find(|(_, n)| *n == name).map(|(c, _)| *c)
}

type Json = serde_json::Value;

/// Resolves an item id to a [`MetaItem`], using DDragon for the name (best-effort: the id as a
/// string when the item is unknown, so we never silently drop a build entry).
fn resolve_item(id: u32, items: &HashMap<u32, ItemMeta>) -> MetaItem {
    let name = items
        .get(&id)
        .map(|m| m.name.clone())
        .unwrap_or_else(|| id.to_string());
    MetaItem { id, name }
}

/// Reads the trailing `[itemIds...]` array from a `[_, _, [ids]]`-shaped block into resolved items.
fn item_list(block: &Json, index: usize, items: &HashMap<u32, ItemMeta>) -> Vec<MetaItem> {
    block
        .get(index)
        .and_then(|b| b.get(2))
        .and_then(Json::as_array)
        .map(|ids| {
            ids.iter()
                .filter_map(|v| v.as_u64())
                .map(|id| resolve_item(id as u32, items))
                .collect()
        })
        .unwrap_or_default()
}

/// DDragon tags marking an item as not part of a champion's *build* (consumables, wards, trinkets).
/// u.gg's situational-option groups mix these in; we drop them so the Meta panel lists only
/// buildable items. This keys off descriptive metadata tags — never specific item ids — so it stays
/// data-driven (no item special-casing). Starting items are NOT filtered: pots belong there.
const NON_BUILD_TAGS: [&str; 3] = ["Consumable", "Trinket", "Vision"];

/// Cap on situational options shown — u.gg lists many thin-sample ids; we keep the most-played.
const MAX_OPTIONS: usize = 6;

/// Target length of the displayed core sequence: u.gg only ships 3 hard "core" items, so we extend
/// up to a full six-item build by promoting each later slot's most-played pick (see [`core_sequence`]).
const CORE_SEQUENCE_LEN: usize = 6;

/// Whether an option item should appear in the situational build list. Unknown items (absent from
/// DDragon) are kept rather than silently dropped — consistent with [`resolve_item`].
fn is_build_item(id: u32, items: &HashMap<u32, ItemMeta>) -> bool {
    match items.get(&id) {
        Some(meta) => !meta
            .tags
            .iter()
            .any(|t| NON_BUILD_TAGS.iter().any(|ex| ex.eq_ignore_ascii_case(t))),
        None => true,
    }
}

/// An option id in `block[5]` is usually a plain int, but some groups carry a `"slot-itemId"`
/// string (e.g. `"3-3175"`). Extract the trailing numeric item id either way.
fn option_id(v: &Json) -> Option<u32> {
    if let Some(n) = v.as_u64() {
        return u32::try_from(n).ok();
    }
    let s = v.as_str()?;
    let tail = s.rsplit('-').next().unwrap_or(s);
    tail.parse::<u32>().ok()
}

/// Flattens all `block[5]` situational-option groups into a deduplicated option list (keeping the
/// entry with the most games per item), each carrying a per-item win rate from `[id, wins, games]`.
/// Items in `exclude` (those already promoted into the core sequence) are dropped so nothing appears
/// in both the "Core build" and "Situational" lists.
fn options(
    block: &Json,
    items: &HashMap<u32, ItemMeta>,
    exclude: &HashSet<u32>,
) -> Vec<MetaItemOption> {
    let Some(groups) = block.get(5).and_then(Json::as_array) else {
        return Vec::new();
    };
    // id -> (wins, games), keeping the highest-games sample if an item appears in several groups.
    let mut best: HashMap<u32, (u64, u64)> = HashMap::new();
    let mut order: Vec<u32> = Vec::new();
    for group in groups {
        let Some(entries) = group.as_array() else {
            continue;
        };
        for entry in entries {
            let Some(arr) = entry.as_array() else {
                continue;
            };
            let (Some(id), Some(wins), Some(games)) = (
                arr.first().and_then(option_id),
                arr.get(1).and_then(Json::as_u64),
                arr.get(2).and_then(Json::as_u64),
            ) else {
                continue;
            };
            if exclude.contains(&id) {
                continue; // already promoted into the core sequence — don't list it twice
            }
            if !is_build_item(id, items) {
                continue; // skip consumables / wards / trinkets (data-driven, by DDragon tag)
            }
            match best.get(&id) {
                Some(&(_, prev_games)) if prev_games >= games => {}
                Some(_) => {
                    best.insert(id, (wins, games));
                }
                None => {
                    best.insert(id, (wins, games));
                    order.push(id);
                }
            }
        }
    }
    let mut opts: Vec<MetaItemOption> = order
        .into_iter()
        .map(|id| {
            let (wins, games) = best[&id];
            let item = resolve_item(id, items);
            MetaItemOption {
                id: item.id,
                name: item.name,
                win_rate: (games > 0).then(|| wins as f64 / games as f64),
                games: Some(games),
            }
        })
        .collect();
    // u.gg returns options in an arbitrary group order, interleaving thin samples. Surface the
    // most-played first (popularity is a steadier signal than a small-sample win rate) and cap the
    // list so the panel shows meaningful choices rather than every id u.gg lists.
    opts.sort_by_key(|o| std::cmp::Reverse(o.games));
    opts.truncate(MAX_OPTIONS);
    opts
}

/// Builds the displayed core *sequence*: u.gg's three hard core items (`block[3]`) followed by the
/// most-played buildable pick from each subsequent item-slot group in `block[5]`, de-duplicated and
/// capped at a full six-item build.
///
/// u.gg only marks three items as "core"; the 4th/5th/6th slots live as the same option groups we
/// surface under "Situational". Promoting each slot's top pick turns the panel's "Core build" from a
/// 3-item stub into a complete build path, while [`options`] drops anything promoted here so an item
/// never shows in both lists. Consumables/wards/trinkets are skipped (data-driven, by DDragon tag),
/// as are ids already in the sequence.
fn core_sequence(block: &Json, items: &HashMap<u32, ItemMeta>) -> Vec<MetaItem> {
    let mut seq = item_list(block, 3, items);
    let mut seen: HashSet<u32> = seq.iter().map(|i| i.id).collect();

    let Some(groups) = block.get(5).and_then(Json::as_array) else {
        return seq;
    };
    for group in groups {
        if seq.len() >= CORE_SEQUENCE_LEN {
            break;
        }
        let Some(entries) = group.as_array() else {
            continue;
        };
        // The most-played buildable, not-yet-included pick in this slot group (`[id, wins, games]`).
        // First-wins on a games tie (`>` keeps the earlier entry), matching [`options`]'s tie rule so
        // the two lists stay consistent. (`max_by_key` would instead keep the *last* tied entry.)
        let best = entries
            .iter()
            .filter_map(|entry| {
                let arr = entry.as_array()?;
                let id = arr.first().and_then(option_id)?;
                let games = arr.get(2).and_then(Json::as_u64).unwrap_or(0);
                (is_build_item(id, items) && !seen.contains(&id)).then_some((id, games))
            })
            .fold(None::<(u32, u64)>, |best, (id, games)| match best {
                Some((_, best_games)) if best_games >= games => best,
                _ => Some((id, games)),
            });
        if let Some((id, _)) = best {
            seen.insert(id);
            seq.push(resolve_item(id, items));
        }
    }
    seq
}

/// Reads the skill order (`block[4][2]`) and max-priority string (`block[4][3]`).
fn skills(block: &Json) -> (Vec<String>, String) {
    let b4 = block.get(4);
    let order = b4
        .and_then(|b| b.get(2))
        .and_then(Json::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default();
    let max_priority = b4
        .and_then(|b| b.get(3))
        .and_then(Json::as_str)
        .unwrap_or_default()
        .to_string();
    (order, max_priority)
}

/// Reads `block[6] = [wins, games]` into `(win_rate, games)`. Returns `(None, None)` if absent or
/// games is zero (no reliable rate).
fn overall(block: &Json) -> (Option<f64>, Option<u64>) {
    let Some(pair) = block.get(6).and_then(Json::as_array) else {
        return (None, None);
    };
    let wins = pair.first().and_then(Json::as_u64);
    let games = pair.get(1).and_then(Json::as_u64);
    match (wins, games) {
        (Some(w), Some(g)) if g > 0 => (Some(w as f64 / g as f64), Some(g)),
        (_, g) => (None, g),
    }
}

/// The `block` array for a region/rank/role, if present: `data[region][rank][role][0]`.
fn block_for<'a>(overview: &'a Json, rank_code: &str, role_code: &str) -> Option<&'a Json> {
    overview
        .get(REGION_WORLD)?
        .get(rank_code)?
        .get(role_code)?
        .get(0)
}

/// All roles u.gg has data for at this rank, as friendly names (sorted for a stable order).
fn available_roles(overview: &Json, rank_code: &str) -> Vec<String> {
    let Some(roles) = overview.get(REGION_WORLD).and_then(|r| r.get(rank_code)) else {
        return Vec::new();
    };
    let mut names: Vec<String> = ROLES
        .iter()
        .filter(|(code, _)| roles.get(code).is_some())
        .map(|(_, name)| (*name).to_string())
        .collect();
    names.sort();
    names
}

/// The role with the most games at this rank (`block[6][1]`), used as the primary-role default.
fn primary_role_code<'a>(overview: &'a Json, rank_code: &str) -> Option<&'a str> {
    let roles = overview.get(REGION_WORLD)?.get(rank_code)?.as_object()?;
    roles
        .iter()
        .filter(|(code, _)| role_name(code).is_some())
        .map(|(code, role)| {
            let games = role
                .get(0)
                .and_then(|b| b.get(6))
                .and_then(Json::as_array)
                .and_then(|p| p.get(1))
                .and_then(Json::as_u64)
                .unwrap_or(0);
            (code.as_str(), games)
        })
        .max_by_key(|(_, games)| *games)
        .map(|(code, _)| code)
}

/// Decodes the overview JSON into a [`MetaBuild`] for `champion` at `role` (or the primary role if
/// `role` is `None`) and `rank` (a friendly name; defaults to Diamond+).
///
/// Returns `None` when u.gg has no data for the requested champion/role/rank combination. `patch`
/// is the DDragon patch string ("15.9"), echoed into the payload for display.
pub fn build_for(
    overview: &Json,
    champion: &str,
    role: Option<&str>,
    rank: &str,
    patch: &str,
    items: &HashMap<u32, ItemMeta>,
) -> Option<MetaBuild> {
    let rank_code = rank_key(rank);

    // Resolve the requested role to a u.gg code; None => the primary (most-games) role.
    let role_code: &str = match role {
        Some(name) => role_code(name)?,
        None => primary_role_code(overview, rank_code)?,
    };
    let resolved_role = role_name(role_code)?;

    let block = block_for(overview, rank_code, role_code)?;

    let (win_rate, games) = overall(block);
    let starting_items = item_list(block, 2, items);
    let core_items = core_sequence(block, items);
    let core_ids: HashSet<u32> = core_items.iter().map(|i| i.id).collect();
    let opts = options(block, items, &core_ids);
    let (skill_order, skill_max_priority) = skills(block);

    // A wholly empty role block is treated as "no data" so the caller can show an empty state.
    if core_items.is_empty() && starting_items.is_empty() && skill_order.is_empty() {
        return None;
    }

    Some(MetaBuild {
        champion: champion.to_string(),
        role: resolved_role.to_string(),
        available_roles: available_roles(overview, rank_code),
        rank: rank.to_string(),
        patch: patch.to_string(),
        win_rate,
        games,
        starting_items,
        core_items,
        options: opts,
        skill_order,
        skill_max_priority,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const OVERVIEW: &str = include_str!("fixtures/overview_ahri.json");

    fn overview() -> Json {
        serde_json::from_str(OVERVIEW).expect("fixture parses")
    }

    /// A small DDragon item map covering the ids the Ahri Diamond+ mid build references, so the
    /// snapshot shows resolved names rather than bare ids. Unknown ids fall back to the id string.
    fn items() -> HashMap<u32, ItemMeta> {
        let mut m = HashMap::new();
        // Tags mirror DDragon's: consumables/wards carry "Consumable"/"Vision" so the option filter
        // is exercised (they must be dropped from situational options but kept in starting items).
        for (id, name, tags) in [
            (1056u32, "Doran's Ring", &[][..]),
            (2003, "Health Potion", &["Consumable"][..]),
            (3118, "Malignance", &[][..]),
            (3020, "Sorcerer's Shoes", &["Boots"][..]),
            (4645, "Shadowflame", &[][..]),
            (3041, "Mejai's Soulstealer", &[][..]),
            (3089, "Rabadon's Deathcap", &[][..]),
            (3157, "Zhonya's Hourglass", &[][..]),
            (3135, "Void Staff", &[][..]),
            (2055, "Control Ward", &["Consumable", "Vision"][..]),
            (2139, "Elixir of Sorcery", &["Consumable"][..]),
            (3175, "Imaginary Item", &[][..]),
        ] {
            m.insert(
                id,
                ItemMeta {
                    id,
                    name: name.to_string(),
                    total_cost: 0,
                    tags: tags.iter().map(|t| t.to_string()).collect(),
                    image: format!("{id}.png"),
                },
            );
        }
        m
    }

    #[test]
    fn diamond_plus_mid_is_the_primary_role() {
        // role None => primary role; Ahri's by-far-most-played role is mid.
        let build = build_for(&overview(), "Ahri", None, "diamond_plus", "15.9", &items())
            .expect("Ahri Diamond+ has data");
        assert_eq!(build.role, "mid");
        assert!(build.available_roles.contains(&"mid".to_string()));
    }

    #[test]
    fn explicit_role_is_honored() {
        let build = build_for(
            &overview(),
            "Ahri",
            Some("support"),
            "diamond_plus",
            "15.9",
            &items(),
        )
        .expect("Ahri Diamond+ support has data");
        assert_eq!(build.role, "support");
    }

    #[test]
    fn decodes_core_skills_options_and_winrate() {
        let build = build_for(
            &overview(),
            "Ahri",
            Some("mid"),
            "diamond_plus",
            "15.9",
            &items(),
        )
        .expect("Ahri Diamond+ mid has data");

        // Core sequence: the three hard core items (block[3] = [3118, 3020, 4645]) extended with the
        // most-played pick from each later slot group in block[5] — 3089 (4950 games), then 3157
        // (1741, since 3089 is already in), then 3135 (275) — for a full six-item build.
        assert_eq!(
            build.core_items.iter().map(|i| i.id).collect::<Vec<_>>(),
            vec![3118, 3020, 4645, 3089, 3157, 3135]
        );
        assert_eq!(build.core_items[0].name, "Malignance");

        // Promoted items must not also appear in the situational options (no double-listing).
        for promoted in [3089u32, 3157, 3135] {
            assert!(
                !build.options.iter().any(|o| o.id == promoted),
                "item {promoted} promoted to core should be excluded from options"
            );
        }

        // Skill order + max priority from block[4].
        assert_eq!(build.skill_max_priority, "QWE");
        assert!(build.skill_order.len() >= 16);

        // Overall WR/games from block[6] = [23641, 47359] => 49.9%.
        let wr = build.win_rate.expect("overall win rate available");
        assert!((0.49..0.51).contains(&wr), "win rate {wr} near 50%");
        assert_eq!(build.games, Some(47359));

        // Options carry per-item win rates derived from [id, wins, games] in block[5].
        assert!(!build.options.is_empty());
        for opt in &build.options {
            if let (Some(wr), Some(g)) = (opt.win_rate, opt.games) {
                assert!((0.0..=1.0).contains(&wr), "per-option WR in range");
                assert!(g > 0);
            }
        }
    }

    #[test]
    fn unknown_role_or_rank_defaults_gracefully() {
        // An unknown rank falls back to Diamond+; an unknown role name yields None.
        let by_default_rank = build_for(
            &overview(),
            "Ahri",
            Some("mid"),
            "totally_made_up",
            "15.9",
            &items(),
        );
        assert!(by_default_rank.is_some());
        let bad_role = build_for(
            &overview(),
            "Ahri",
            Some("bottom"),
            "diamond_plus",
            "15.9",
            &items(),
        );
        assert!(bad_role.is_none());
    }

    #[test]
    fn snapshot_resolved_build() {
        let build = build_for(&overview(), "Ahri", None, "diamond_plus", "15.9", &items())
            .expect("Ahri Diamond+ primary role has data");
        insta::assert_yaml_snapshot!(build);
    }
}
