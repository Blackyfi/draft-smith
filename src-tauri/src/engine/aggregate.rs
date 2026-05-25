//! Team-level threat aggregation (PROJECT_SPEC §5.2 step 3).
//!
//! Turns the per-enemy [`ThreatProfile`]s into a numeric [`TeamThreat`] and the set of *active*
//! counter-conditions (with the enemies that triggered each, for explanations). Thresholds here are
//! engine policy (how much physical damage counts as "physical-heavy"); the *response* to each
//! condition is data (`counters.json`). Pure and deterministic.

use crate::model::engine::{Archetype, DamageType, LiveSignal, ThreatProfile};
use crate::rules::CounterCondition;

/// Damage-mix threshold (of the AD/AP split) above which the team counts as skewed to one side.
const HEAVY_DAMAGE_SHARE: f32 = 0.6;
/// Minimum number of enemies bringing a signal for the team-wide condition to fire.
const TEAM_SIGNAL_THRESHOLD: u32 = 2;

/// An active counter-condition plus the enemy champions that triggered it (for attribution in the
/// generated reasons, e.g. "counters Zed, Darius").
#[derive(Debug, Clone, PartialEq)]
pub struct ActiveCondition {
    pub condition: CounterCondition,
    pub enemies: Vec<String>,
}

/// Aggregates per-enemy profiles into the team-wide numeric threat.
pub fn aggregate(profiles: &[ThreatProfile]) -> crate::model::TeamThreat {
    let (mut phys, mut magic) = (0.0_f32, 0.0_f32);
    for p in profiles {
        match p.damage_type {
            DamageType::Physical => phys += 1.0,
            DamageType::Magic => magic += 1.0,
            DamageType::Mixed => {
                phys += 0.5;
                magic += 0.5;
            }
            DamageType::True => {}
        }
    }
    let total = phys + magic;
    let (physical_share, magic_share) = if total > 0.0 {
        (phys / total, magic / total)
    } else {
        (0.0, 0.0)
    };

    crate::model::TeamThreat {
        physical_share,
        magic_share,
        hard_cc_count: count_signal(profiles, LiveSignal::HardCc),
        has_fed_assassin: profiles
            .iter()
            .any(|p| p.archetype == Archetype::Assassin && p.signals.contains(&LiveSignal::Fed)),
        frontline_bulk: profiles
            .iter()
            .filter(|p| {
                p.signals.contains(&LiveSignal::HealthStacking)
                    || p.signals.contains(&LiveSignal::ArmorStacking)
            })
            .count() as u32,
        healing_present: profiles
            .iter()
            .any(|p| p.signals.contains(&LiveSignal::HasSustain)),
    }
}

/// Derives the active counter-conditions, each annotated with the enemies that triggered it.
/// Returned in descending `condition_priority` so the most build-defining threat is explained
/// first; ordering is stable for deterministic output.
pub fn active_conditions(profiles: &[ThreatProfile]) -> Vec<ActiveCondition> {
    let threat = aggregate(profiles);
    let mut active: Vec<ActiveCondition> = Vec::new();

    // A fed assassin is the single most build-warping signal — surface it first.
    if threat.has_fed_assassin {
        active.push(ActiveCondition {
            condition: CounterCondition::FedAssassin,
            enemies: champs_where(profiles, |p| {
                p.archetype == Archetype::Assassin && p.signals.contains(&LiveSignal::Fed)
            }),
        });
    }

    // Signal-driven conditions: active whenever any enemy exhibits the signal.
    for (signal, condition) in [
        (LiveSignal::Lethality, CounterCondition::Lethality),
        (LiveSignal::HasSustain, CounterCondition::HasSustain),
        (LiveSignal::HealthStacking, CounterCondition::HealthStacking),
        (LiveSignal::ArmorStacking, CounterCondition::ArmorStacking),
        (LiveSignal::MrStacking, CounterCondition::MrStacking),
    ] {
        let enemies = champs_where(profiles, |p| p.signals.contains(&signal));
        if !enemies.is_empty() {
            active.push(ActiveCondition { condition, enemies });
        }
    }

    // Damage-skew conditions: fire on the AD/AP share threshold.
    if threat.physical_share >= HEAVY_DAMAGE_SHARE {
        active.push(ActiveCondition {
            condition: CounterCondition::PhysicalHeavy,
            enemies: champs_where(profiles, |p| {
                matches!(p.damage_type, DamageType::Physical | DamageType::Mixed)
            }),
        });
    }
    if threat.magic_share >= HEAVY_DAMAGE_SHARE {
        active.push(ActiveCondition {
            condition: CounterCondition::MagicHeavy,
            enemies: champs_where(profiles, |p| {
                matches!(p.damage_type, DamageType::Magic | DamageType::Mixed)
            }),
        });
    }

    // Team-wide count conditions: need a critical mass of enemies.
    if threat.hard_cc_count >= TEAM_SIGNAL_THRESHOLD {
        active.push(ActiveCondition {
            condition: CounterCondition::HardCc,
            enemies: champs_where(profiles, |p| p.signals.contains(&LiveSignal::HardCc)),
        });
    }
    if count_signal(profiles, LiveSignal::Mobility) >= TEAM_SIGNAL_THRESHOLD {
        active.push(ActiveCondition {
            condition: CounterCondition::Mobility,
            enemies: champs_where(profiles, |p| p.signals.contains(&LiveSignal::Mobility)),
        });
    }

    active
}

fn count_signal(profiles: &[ThreatProfile], signal: LiveSignal) -> u32 {
    profiles
        .iter()
        .filter(|p| p.signals.contains(&signal))
        .count() as u32
}

fn champs_where(profiles: &[ThreatProfile], pred: impl Fn(&ThreatProfile) -> bool) -> Vec<String> {
    profiles
        .iter()
        .filter(|p| pred(p))
        .map(|p| p.champion.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(
        champ: &str,
        dmg: DamageType,
        arch: Archetype,
        signals: &[LiveSignal],
    ) -> ThreatProfile {
        ThreatProfile {
            champion: champ.into(),
            archetype: arch,
            damage_type: dmg,
            signals: signals.to_vec(),
        }
    }

    #[test]
    fn computes_damage_shares_with_mixed_counted_half() {
        let profiles = [
            profile("A", DamageType::Physical, Archetype::Bruiser, &[]),
            profile("B", DamageType::Physical, Archetype::Marksman, &[]),
            profile("C", DamageType::Mixed, Archetype::Marksman, &[]),
        ];
        let t = aggregate(&profiles);
        // phys = 2 + 0.5 = 2.5, magic = 0.5, total = 3 → ~0.83 physical.
        assert!((t.physical_share - 0.8333).abs() < 0.001);
        assert!(t.physical_share >= HEAVY_DAMAGE_SHARE);
    }

    #[test]
    fn fed_assassin_only_fires_for_a_fed_assassin() {
        let fed_juggernaut = [profile(
            "Darius",
            DamageType::Physical,
            Archetype::Juggernaut,
            &[LiveSignal::Fed],
        )];
        assert!(!aggregate(&fed_juggernaut).has_fed_assassin);

        let fed_assassin = [profile(
            "Zed",
            DamageType::Physical,
            Archetype::Assassin,
            &[LiveSignal::Fed, LiveSignal::Lethality],
        )];
        assert!(aggregate(&fed_assassin).has_fed_assassin);
        assert!(active_conditions(&fed_assassin)
            .iter()
            .any(|c| c.condition == CounterCondition::FedAssassin));
    }

    #[test]
    fn hard_cc_needs_a_critical_mass() {
        let one_cc = [
            profile(
                "A",
                DamageType::Magic,
                Archetype::Catcher,
                &[LiveSignal::HardCc],
            ),
            profile("B", DamageType::Physical, Archetype::Marksman, &[]),
        ];
        assert!(!active_conditions(&one_cc)
            .iter()
            .any(|c| c.condition == CounterCondition::HardCc));

        let two_cc = [
            profile(
                "A",
                DamageType::Magic,
                Archetype::Catcher,
                &[LiveSignal::HardCc],
            ),
            profile(
                "B",
                DamageType::Physical,
                Archetype::Tank,
                &[LiveSignal::HardCc],
            ),
        ];
        let cc = active_conditions(&two_cc)
            .into_iter()
            .find(|c| c.condition == CounterCondition::HardCc)
            .expect("hard-cc active with two CC enemies");
        assert_eq!(cc.enemies, vec!["A", "B"]);
    }

    #[test]
    fn sustain_drives_healing_present_and_condition() {
        let healers = [profile(
            "Soraka",
            DamageType::Magic,
            Archetype::Enchanter,
            &[LiveSignal::HasSustain],
        )];
        assert!(aggregate(&healers).healing_present);
        assert!(active_conditions(&healers)
            .iter()
            .any(|c| c.condition == CounterCondition::HasSustain));
    }
}
