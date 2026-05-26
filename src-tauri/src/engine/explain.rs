//! Natural-language reason generation (PROJECT_SPEC §5.2 step 6).
//!
//! Pure string formatting over abstract conditions and the enemies that triggered them — the
//! "why" that makes each recommendation defensible. No champion/item special-casing: the only
//! champion-specific text is names echoed back from the data as values, never branched on.

use crate::engine::aggregate::ActiveCondition;
use crate::rules::CounterCondition;

/// A short human label for a condition, used inside generated reasons (e.g. "a fed assassin").
pub fn condition_phrase(condition: CounterCondition) -> &'static str {
    match condition {
        CounterCondition::FedAssassin => "a fed assassin",
        CounterCondition::Lethality => "lethality burst",
        CounterCondition::HasSustain => "heavy healing",
        CounterCondition::HealthStacking => "a health-stacked frontline",
        CounterCondition::ArmorStacking => "stacked armor",
        CounterCondition::MrStacking => "stacked magic resist",
        CounterCondition::PhysicalHeavy => "mostly physical damage",
        CounterCondition::MagicHeavy => "mostly magic damage",
        CounterCondition::HardCc => "heavy crowd control",
        CounterCondition::Mobility => "high mobility",
    }
}

/// The player-facing build action that answers a condition — used by the Enemy Items panel's
/// `counter_hint` (e.g. "Answer with anti-heal (Grievous Wounds)."). Pure: maps an abstract
/// condition to a phrase, never a champion/item name.
pub fn counter_action(condition: CounterCondition) -> &'static str {
    match condition {
        CounterCondition::HasSustain => "anti-heal (Grievous Wounds)",
        CounterCondition::HealthStacking => "%max-HP damage",
        CounterCondition::ArmorStacking => "armor penetration",
        CounterCondition::MrStacking => "magic penetration",
        CounterCondition::Lethality => "armor or a stasis item",
        CounterCondition::FedAssassin => "a stasis item / spellshield",
        CounterCondition::PhysicalHeavy => "armor",
        CounterCondition::MagicHeavy => "magic resist",
        CounterCondition::HardCc => "tenacity / QSS",
        CounterCondition::Mobility => "move speed",
    }
}

/// Joins enemy names into an English clause: "Zed", "Zed and Darius", "Zed, Darius and Vi".
/// Caps the list at three names (+"others") so a whole-team condition stays readable.
pub fn join_enemies(enemies: &[String]) -> String {
    match enemies {
        [] => "the enemy team".to_string(),
        [a] => a.clone(),
        [a, b] => format!("{a} and {b}"),
        [a, b, c] => format!("{a}, {b} and {c}"),
        [a, b, rest @ ..] => format!("{a}, {b} and {} others", rest.len()),
    }
}

/// The reason for an item picked to answer a specific condition: cites the enemies and the
/// counter's rationale fragment (e.g. "Counters Zed (a fed assassin) — negates the all-in window.").
pub fn item_reason(active: &ActiveCondition, fragment: &str) -> String {
    format!(
        "Counters {} ({}) — {}.",
        join_enemies(&active.enemies),
        condition_phrase(active.condition),
        fragment
    )
}

/// The reason for an always-core anchor item — taken regardless of matchup.
pub fn anchor_reason(champion: &str) -> String {
    format!("Core on {champion} — your reliable power-spike anchor.")
}

/// Fallback reason for a build slot no live condition specifically drove (rounds out the path).
pub fn filler_reason() -> String {
    "Rounds out the build — strong general-purpose pick for this champion.".to_string()
}

/// The swap trigger line: "If their healing grows", framed from the condition.
pub fn swap_trigger(condition: CounterCondition) -> String {
    let when = match condition {
        CounterCondition::FedAssassin => "an assassin snowballs",
        CounterCondition::Lethality => "their lethality grows",
        CounterCondition::HasSustain => "their healing grows",
        CounterCondition::HealthStacking => "they stack more health",
        CounterCondition::ArmorStacking => "they stack more armor",
        CounterCondition::MrStacking => "they stack more magic resist",
        CounterCondition::PhysicalHeavy => "physical damage piles up",
        CounterCondition::MagicHeavy => "magic damage piles up",
        CounterCondition::HardCc => "their crowd control grows",
        CounterCondition::Mobility => "they get harder to pin down",
    };
    format!("If {when}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn joins_enemy_names_grammatically() {
        assert_eq!(join_enemies(&[]), "the enemy team");
        assert_eq!(join_enemies(&["Zed".into()]), "Zed");
        assert_eq!(join_enemies(&["Zed".into(), "Vi".into()]), "Zed and Vi");
        assert_eq!(
            join_enemies(&["Zed".into(), "Vi".into(), "Darius".into()]),
            "Zed, Vi and Darius"
        );
        assert_eq!(
            join_enemies(&["A".into(), "B".into(), "C".into(), "D".into()]),
            "A, B and 2 others"
        );
    }

    #[test]
    fn counter_action_maps_conditions_to_build_actions() {
        assert_eq!(
            counter_action(CounterCondition::HasSustain),
            "anti-heal (Grievous Wounds)"
        );
        assert_eq!(
            counter_action(CounterCondition::HealthStacking),
            "%max-HP damage"
        );
        assert_eq!(
            counter_action(CounterCondition::ArmorStacking),
            "armor penetration"
        );
        assert_eq!(
            counter_action(CounterCondition::MrStacking),
            "magic penetration"
        );
        assert_eq!(
            counter_action(CounterCondition::Lethality),
            "armor or a stasis item"
        );
    }

    #[test]
    fn item_reason_cites_enemies_and_condition() {
        let active = ActiveCondition {
            condition: CounterCondition::FedAssassin,
            enemies: vec!["Zed".into()],
        };
        assert_eq!(
            item_reason(&active, "negates the all-in window"),
            "Counters Zed (a fed assassin) — negates the all-in window."
        );
    }
}
