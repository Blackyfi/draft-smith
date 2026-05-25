//! Snapshot corpus for the engine (PROJECT_SPEC §5.4, M3 verify bar).
//!
//! Four fixtures spanning four *player* archetypes and four distinct enemy comps, each exercising a
//! different dominant counter:
//!   1. **Ahri** (burst mage) vs the captured live snapshot — fed AD assassin + bruisers + hard CC
//!      ⇒ stasis/spellshield. Routed through the real [`EngineInput::from_all_game_data`] adapter,
//!      so this also pins the live-data → engine boundary.
//!   2. **Jinx** (marksman) vs a tank/health-stacked frontline ⇒ %-hp damage + armor pen.
//!   3. **Sett** (juggernaut) vs a heavy-healing comp ⇒ antiheal.
//!   4. **Ornn** (tank) vs an all-AP burst comp ⇒ magic resist.
//!
//! Snapshots capture the full explained `Recommendation`; review with `cargo insta review` — never
//! blind-accept. The recommendations are produced with **no champion/item special-casing** in
//! `engine/` — only the JSON rule data differs per matchup.

use crate::engine::input::{EnemyInput, EngineInput};
use crate::engine::recommend;
use crate::live_client::model::AllGameData;
use crate::rules::RuleSet;

const CAPTURED: &str = include_str!("../live_client/fixtures/allgamedata.json");

fn rules() -> RuleSet {
    RuleSet::load().expect("embedded rule set parses")
}

/// Compact enemy builder for the hand-authored fixtures.
fn enemy(champion: &str, items: &[u32], k: u32, d: u32, a: u32) -> EnemyInput {
    EnemyInput {
        champion: champion.into(),
        items: items.to_vec(),
        level: 11,
        kills: k,
        deaths: d,
        assists: a,
    }
}

#[test]
fn ahri_vs_captured_ad_assassin_comp() {
    // Through the real adapter: the player is Ahri, enemies are Zed (fed lethality), Darius
    // (Goredrinker sustain), Vi, Kaisa, Leona (hard CC).
    let data: AllGameData = serde_json::from_str(CAPTURED).unwrap();
    let input = EngineInput::from_all_game_data(&data).expect("self identifiable");
    let rec = recommend(&input, &rules());

    assert_eq!(rec.self_champion, "Ahri");
    insta::assert_yaml_snapshot!(rec);
}

#[test]
fn jinx_vs_tank_frontline() {
    let input = EngineInput {
        self_champion: "Jinx".into(),
        self_items: vec![6672], // Kraken already built
        allies: vec!["Thresh".into()],
        enemies: vec![
            enemy("Ornn", &[3068, 4401], 2, 3, 9), // Sunfire → health+armor stacking
            enemy("Sion", &[3084], 1, 4, 7),       // Heartsteel → health stacking
            enemy("Malphite", &[3143], 0, 2, 11),  // Randuin's → armor+health stacking
            enemy("Darius", &[3053], 5, 2, 3),     // Sterak's → health stacking
            enemy("Vi", &[3071, 3053], 3, 3, 6),   // bruiser frontline
        ],
        game_time: 1500.0,
        gold: 1300.0,
        // Synthetic fixture has no live ability data → skill advice is `None` here; the
        // skill-order logic is covered by `engine::skill` unit tests + the Ahri snapshot.
        self_level: 0,
        self_abilities: Default::default(),
    };
    let rec = recommend(&input, &rules());
    assert_eq!(rec.self_champion, "Jinx");
    insta::assert_yaml_snapshot!(rec);
}

#[test]
fn sett_vs_heavy_healing_comp() {
    let input = EngineInput {
        self_champion: "Sett".into(),
        self_items: vec![],
        allies: vec!["Jinx".into()],
        enemies: vec![
            enemy("Aatrox", &[6630], 4, 2, 3),   // Goredrinker → sustain
            enemy("Vladimir", &[3065], 3, 1, 5), // Spirit Visage → sustain + mr stacking
            enemy("Soraka", &[], 0, 2, 12),      // enchanter healer
            enemy("Warwick", &[3072], 5, 2, 4),  // Bloodthirster → sustain
            enemy("Darius", &[6630], 3, 3, 2),   // Goredrinker → sustain
        ],
        game_time: 1700.0,
        gold: 1400.0,
        self_level: 0,
        self_abilities: Default::default(),
    };
    let rec = recommend(&input, &rules());
    assert_eq!(rec.self_champion, "Sett");
    insta::assert_yaml_snapshot!(rec);
}

#[test]
fn ornn_vs_ap_burst_comp() {
    let input = EngineInput {
        self_champion: "Ornn".into(),
        self_items: vec![3068], // Sunfire built
        allies: vec!["Jinx".into()],
        enemies: vec![
            enemy("Syndra", &[6655], 4, 2, 3),
            enemy("Brand", &[6653], 3, 3, 6),
            enemy("Annie", &[3157], 2, 2, 5),
            enemy("Veigar", &[3089], 3, 1, 4),
            enemy("Ahri", &[3135], 5, 2, 3),
        ],
        game_time: 1600.0,
        gold: 1500.0,
        self_level: 0,
        self_abilities: Default::default(),
    };
    let rec = recommend(&input, &rules());
    assert_eq!(rec.self_champion, "Ornn");
    insta::assert_yaml_snapshot!(rec);
}

#[test]
fn unauthored_player_champion_yields_threats_but_no_path() {
    // A champion with no build graph still gets the enemy threat board — we can show *why* even if
    // we can't show *what*. Must not panic.
    let input = EngineInput {
        self_champion: "BrandNewChampion".into(),
        enemies: vec![enemy("Zed", &[6692], 6, 1, 2)],
        ..Default::default()
    };
    let rec = recommend(&input, &rules());
    assert!(rec.build_path.is_empty());
    assert_eq!(rec.threats.len(), 1);
    assert_eq!(rec.threats[0].champion, "Zed");
}
