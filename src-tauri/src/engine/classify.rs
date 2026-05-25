//! Enemy classification (PROJECT_SPEC §5.2 step 2): static archetype + live signals.
//!
//! Pure: a function of the enemy's abstract input and the rule set only. Every decision branches on
//! an `Archetype`/`IntentTag`/`LiveSignal` or a data-derived fact — never on the champion's name.

use crate::engine::input::EnemyInput;
use crate::model::engine::{Archetype, DamageType, LiveSignal, ThreatProfile};
use crate::rules::RuleSet;

/// Classifies one enemy into a [`ThreatProfile`]: their authored archetype/damage type, plus the
/// live signals read off their current build and scoreline.
///
/// Champions absent from the rule set fall back to a neutral `Bruiser`/`Mixed` so an unknown pick
/// never panics and still contributes generic threat (CLAUDE.md "tolerate missing data").
pub fn classify_enemy(enemy: &EnemyInput, rules: &RuleSet) -> ThreatProfile {
    let profile = rules.champion(&enemy.champion);
    let archetype = profile.map_or(Archetype::Bruiser, |p| p.archetype);
    let damage_type = profile.map_or(DamageType::Mixed, |p| p.damage_type);

    let mut signals: Vec<LiveSignal> = Vec::new();
    let add = |s: LiveSignal, sink: &mut Vec<LiveSignal>| {
        if !sink.contains(&s) {
            sink.push(s);
        }
    };

    // Champion facts the engine can't read from items live in the profile.
    if profile.is_some_and(|p| p.cc) {
        add(LiveSignal::HardCc, &mut signals);
    }
    if profile.is_some_and(|p| p.mobility) {
        add(LiveSignal::Mobility, &mut signals);
    }

    // Live signals off the actual build (the heart of "react to what they buy").
    for &id in &enemy.items {
        if let Some(item) = rules.item(id) {
            for &s in &item.grants_signals {
                add(s, &mut signals);
            }
        }
    }

    // Snowballing: a fed enemy is a bigger problem regardless of items.
    if is_fed(enemy) {
        add(LiveSignal::Fed, &mut signals);
    }

    signals.sort_by_key(|s| signal_order(*s));
    ThreatProfile {
        champion: enemy.champion.clone(),
        archetype,
        damage_type,
        signals,
    }
}

/// Whether an enemy is snowballing hard enough to warp the build. Deliberately simple and
/// deterministic (no clock): a strong kill/death ratio with real kills, or a large kill count.
fn is_fed(enemy: &EnemyInput) -> bool {
    let ratio = if enemy.deaths == 0 {
        enemy.kills as f32
    } else {
        enemy.kills as f32 / enemy.deaths as f32
    };
    enemy.kills >= 6 || (enemy.kills >= 3 && ratio >= 2.0)
}

/// Canonical ordering for signals so a profile's `signals` vec is stable across runs (deterministic
/// snapshots) regardless of item slot order.
fn signal_order(signal: LiveSignal) -> u8 {
    match signal {
        LiveSignal::Fed => 0,
        LiveSignal::Lethality => 1,
        LiveSignal::HasSustain => 2,
        LiveSignal::HealthStacking => 3,
        LiveSignal::ArmorStacking => 4,
        LiveSignal::MrStacking => 5,
        LiveSignal::HardCc => 6,
        LiveSignal::Mobility => 7,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules() -> RuleSet {
        RuleSet::load().unwrap()
    }

    #[test]
    fn reads_lethality_and_fed_off_a_snowballing_assassin() {
        // Zed with Eclipse, 4/2: assassin archetype, live lethality, and fed.
        let zed = EnemyInput {
            champion: "Zed".into(),
            items: vec![6692, 3158],
            level: 9,
            kills: 4,
            deaths: 2,
            assists: 2,
        };
        let p = classify_enemy(&zed, &rules());
        assert_eq!(p.archetype, Archetype::Assassin);
        assert_eq!(p.damage_type, DamageType::Physical);
        assert!(p.signals.contains(&LiveSignal::Lethality));
        assert!(p.signals.contains(&LiveSignal::Fed));
    }

    #[test]
    fn reads_health_and_armor_stacking_off_a_tank() {
        // Sunfire grants both health- and armor-stacking; Ornn is a CC tank.
        let ornn = EnemyInput {
            champion: "Ornn".into(),
            items: vec![3068],
            level: 9,
            kills: 1,
            deaths: 1,
            assists: 8,
        };
        let p = classify_enemy(&ornn, &rules());
        assert_eq!(p.archetype, Archetype::Tank);
        assert!(p.signals.contains(&LiveSignal::HealthStacking));
        assert!(p.signals.contains(&LiveSignal::ArmorStacking));
        assert!(p.signals.contains(&LiveSignal::HardCc));
        assert!(!p.signals.contains(&LiveSignal::Fed));
    }

    #[test]
    fn unknown_champion_falls_back_without_panicking() {
        let mystery = EnemyInput {
            champion: "Newest Champion".into(),
            items: vec![],
            level: 1,
            ..Default::default()
        };
        let p = classify_enemy(&mystery, &rules());
        assert_eq!(p.archetype, Archetype::Bruiser);
        assert_eq!(p.damage_type, DamageType::Mixed);
        assert!(p.signals.is_empty());
    }

    #[test]
    fn signals_are_deterministically_ordered_regardless_of_item_order() {
        let a = EnemyInput {
            champion: "Ornn".into(),
            items: vec![3068, 4401],
            ..Default::default()
        };
        let mut reversed = a.clone();
        reversed.items.reverse();
        assert_eq!(
            classify_enemy(&a, &rules()).signals,
            classify_enemy(&reversed, &rules()).signals
        );
    }
}
