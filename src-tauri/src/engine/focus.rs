//! Focus-target advice (PROJECT_SPEC §5.2 — advisory "who to fight"): which enemy to prioritize in
//! a fight, derived from enemy archetypes + live signals relative to the player's own archetype.
//!
//! Pure and data-driven: every decision branches on an `Archetype`/`DamageType`/`LiveSignal` — never
//! on a champion name. The champion *names* that appear here are display values echoed from the
//! profile into the output, not control-flow branches (`.claude/rust.md`, the data-driven invariant).

use crate::model::engine::{Archetype, FocusPriority, FocusTarget, LiveSignal, ThreatProfile};

/// How killable an archetype is, ignoring items — the base of the "kill value" score. Squishy
/// carries are worth deleting; tanks are a poor focus target. Reasoned over the abstract role only.
fn squishiness(archetype: Archetype) -> f32 {
    match archetype {
        // Squishy, high-value: little innate durability.
        Archetype::Marksman
        | Archetype::BurstMage
        | Archetype::Artillery
        | Archetype::Assassin
        | Archetype::Enchanter => 3.0,
        // Medium durability.
        Archetype::Battlemage | Archetype::Catcher => 1.5,
        // Tanky frontline: poor focus target.
        Archetype::Bruiser | Archetype::Juggernaut | Archetype::Tank => 0.0,
    }
}

/// Whether an archetype is a primary damage carry — the threat you most want gone. A bump on top of
/// raw squishiness so a carry edges out an equally-squishy non-carry (e.g. a marksman over an
/// enchanter).
fn is_primary_carry(archetype: Archetype) -> bool {
    matches!(
        archetype,
        Archetype::Marksman | Archetype::BurstMage | Archetype::Artillery
    )
}

/// The "kill value" of an enemy: how rewarding it is to focus them. Higher ⇒ better focus target.
fn kill_value(profile: &ThreatProfile) -> f32 {
    let mut score = squishiness(profile.archetype);
    if profile.signals.contains(&LiveSignal::Fed) {
        // A fed enemy is snowballing — removing them swings the fight hardest.
        score += 2.0;
    }
    if is_primary_carry(profile.archetype) {
        score += 1.0;
    }
    score
}

/// A short "why this target" fragment, from the most salient reason the enemy scored high.
fn why_fragment(profile: &ThreatProfile) -> &'static str {
    if profile.signals.contains(&LiveSignal::Fed) {
        "they're fed and snowballing"
    } else if is_primary_carry(profile.archetype) {
        "their squishiest high-value carry"
    } else if squishiness(profile.archetype) >= 3.0 {
        "a squishy, high-value target"
    } else {
        "the best target available"
    }
}

/// Builds the player-archetype-aware reason line for a focus target. The framing adapts to *how the
/// player wins a fight* — kill, dive, lock down, or peel — branching only on the player's
/// `Archetype` (or `None`); the champion name is an echoed display value.
fn reason_for(player: Option<Archetype>, profile: &ThreatProfile) -> String {
    let champ = &profile.champion;
    let why = why_fragment(profile);
    match player {
        Some(Archetype::Assassin)
        | Some(Archetype::BurstMage)
        | Some(Archetype::Marksman)
        | Some(Archetype::Artillery) => {
            format!("Delete {champ} — {why}.")
        }
        Some(Archetype::Bruiser) | Some(Archetype::Juggernaut) => {
            format!("Pressure and dive {champ} — {why}.")
        }
        Some(Archetype::Tank) | Some(Archetype::Catcher) => {
            format!("Lock down {champ} for your team — {why}.")
        }
        Some(Archetype::Enchanter) => {
            format!("Peel for your carry against {champ} — {why}.")
        }
        Some(Archetype::Battlemage) | None => {
            format!("Focus {champ} first — {why}.")
        }
    }
}

/// Recommends who to prioritize in fights: the top 1–2 enemies by "kill value", framed for the
/// player's archetype. Pure and deterministic — ties break by the profiles' existing order (the
/// classifier already orders them stably), no RNG.
///
/// Returns the highest-value enemy as [`FocusPriority::Primary`] and, when a second enemy exists,
/// the next as [`FocusPriority::Secondary`]. Empty input ⇒ empty output.
pub fn focus_targets(
    player_archetype: Option<Archetype>,
    profiles: &[ThreatProfile],
) -> Vec<FocusTarget> {
    if profiles.is_empty() {
        return Vec::new();
    }

    // Rank by kill value (desc); the original index is the deterministic tie-break (stable order).
    let mut ranked: Vec<(usize, &ThreatProfile)> = profiles.iter().enumerate().collect();
    ranked.sort_by(|(ai, a), (bi, b)| {
        kill_value(b)
            .partial_cmp(&kill_value(a))
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(ai.cmp(bi))
    });

    ranked
        .iter()
        .take(2)
        .enumerate()
        .map(|(rank, (_, profile))| {
            let priority = if rank == 0 {
                FocusPriority::Primary
            } else {
                FocusPriority::Secondary
            };
            FocusTarget {
                champion: profile.champion.clone(),
                priority,
                reason: reason_for(player_archetype, profile),
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::engine::DamageType;

    fn profile(champion: &str, archetype: Archetype, signals: &[LiveSignal]) -> ThreatProfile {
        ThreatProfile {
            champion: champion.into(),
            archetype,
            damage_type: DamageType::Mixed,
            signals: signals.to_vec(),
        }
    }

    #[test]
    fn empty_input_yields_empty() {
        assert!(focus_targets(Some(Archetype::Assassin), &[]).is_empty());
    }

    #[test]
    fn squishy_carry_chosen_over_a_tank() {
        let profiles = [
            profile("BigTank", Archetype::Tank, &[]),
            profile("Carry", Archetype::Marksman, &[]),
        ];
        let focus = focus_targets(Some(Archetype::Assassin), &profiles);
        assert_eq!(focus[0].champion, "Carry");
        assert_eq!(focus[0].priority, FocusPriority::Primary);
        // Tank still appears as the secondary (only two enemies).
        assert_eq!(focus[1].champion, "BigTank");
        assert_eq!(focus[1].priority, FocusPriority::Secondary);
    }

    #[test]
    fn a_fed_enemy_outranks_a_healthier_squishy() {
        // Two marksmen of equal base value; the fed one wins.
        let profiles = [
            profile("Calm", Archetype::Marksman, &[]),
            profile("Snowball", Archetype::Marksman, &[LiveSignal::Fed]),
        ];
        let focus = focus_targets(None, &profiles);
        assert_eq!(focus[0].champion, "Snowball");
        assert_eq!(focus[0].priority, FocusPriority::Primary);
    }

    #[test]
    fn squishy_enchanter_outranks_a_fed_bruiser() {
        // Squishy enchanter (3.0) vs a fed bruiser (0.0 + 2.0 = 2.0): the enchanter still wins,
        // confirming squishiness dominates a single fed bump on a tanky target.
        let profiles = [
            profile("FedBruiser", Archetype::Bruiser, &[LiveSignal::Fed]),
            profile("Healer", Archetype::Enchanter, &[]),
        ];
        let focus = focus_targets(None, &profiles);
        assert_eq!(focus[0].champion, "Healer");
    }

    #[test]
    fn carry_bump_breaks_a_squishiness_tie() {
        // Assassin and Marksman are both squishy (3.0); the marksman gets the carry bump.
        let profiles = [
            profile("Sneaky", Archetype::Assassin, &[]),
            profile("Shooter", Archetype::Marksman, &[]),
        ];
        let focus = focus_targets(None, &profiles);
        assert_eq!(focus[0].champion, "Shooter");
    }

    #[test]
    fn player_archetype_changes_the_framing() {
        let profiles = [profile("Zed", Archetype::Marksman, &[])];

        let assassin = focus_targets(Some(Archetype::Assassin), &profiles);
        assert!(assassin[0].reason.starts_with("Delete Zed"));

        let bruiser = focus_targets(Some(Archetype::Bruiser), &profiles);
        assert!(bruiser[0].reason.starts_with("Pressure and dive Zed"));

        let tank = focus_targets(Some(Archetype::Tank), &profiles);
        assert!(tank[0].reason.starts_with("Lock down Zed"));

        let enchanter = focus_targets(Some(Archetype::Enchanter), &profiles);
        assert!(enchanter[0]
            .reason
            .starts_with("Peel for your carry against Zed"));

        let neutral = focus_targets(None, &profiles);
        assert!(neutral[0].reason.starts_with("Focus Zed first"));
    }

    #[test]
    fn tie_breaks_deterministically_by_input_order() {
        let profiles = [
            profile("First", Archetype::Marksman, &[]),
            profile("Second", Archetype::Marksman, &[]),
        ];
        let focus = focus_targets(None, &profiles);
        assert_eq!(focus[0].champion, "First");
        assert_eq!(focus[1].champion, "Second");
    }
}
