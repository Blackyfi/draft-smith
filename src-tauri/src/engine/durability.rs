//! Enemy durability / casts-to-kill estimator (PROJECT_SPEC advisory).
//!
//! Pure & data-driven: branches only on `DamageType`/`RatioStat` and on numeric stats passed in —
//! never on a champion/item name (`.claude/rust.md`). It answers two at-a-glance questions for one
//! enemy: their effective HP against the player's damage, and how many casts of the player's primary
//! nuke (besides the ult) it takes to kill them from full. An honest ESTIMATE — it models a single
//! ability (not the player's full combo) and excludes the enemy's runes, current HP, shields,
//! healing/damage-reduction, and bonus-HP/level passives (e.g. Cho'Gath Feast stacks) — none of
//! which a Riot-sanctioned source exposes for an enemy. Read it as a relative gauge, not a kill count.

use crate::engine::input::{ResolvedDefenses, SelfAbilities, SelfDamageStats};
use crate::model::engine::{AbilitySlot, DamageType, Durability, ResistKind};
use crate::rules::{AbilityDamage, RatioStat};

/// Estimates an enemy's durability vs the player and the casts-to-kill for the player's primary
/// nuke. Returns `None` when the enemy's defenses haven't been resolved (DDragon unavailable).
///
/// When `ability` is `Some`, the relevant resist is the spell's `damage_type` (armor for physical,
/// MR for magic, none for true). When it's `None`, the player's damage type is unknown to this pure
/// fn, so the gauge honestly reports raw HP with no resist applied and no cast count.
pub fn estimate(
    defenses: Option<&ResolvedDefenses>,
    self_stats: &SelfDamageStats,
    self_abilities: &SelfAbilities,
    ability: Option<&AbilityDamage>,
) -> Option<Durability> {
    let defenses = defenses?;
    let raw_hp_f = defenses.hp.max(0.0);
    let raw_hp = round_u32(raw_hp_f);

    let Some(ability) = ability else {
        // No authored player nuke -> honest raw-HP gauge, no resist, no cast count.
        return Some(Durability {
            effective_hp: raw_hp,
            raw_hp,
            resist: 0,
            resist_after_pen: 0,
            resist_kind: ResistKind::None,
            casts_to_kill: None,
            ability_slot: None,
            ability_name: None,
            per_cast_damage: None,
            secondary_resist_kind: None,
        });
    };

    // The PRIMARY component's resist drives the gauge (a relative-tankiness bar). A hybrid spell's
    // secondary component is folded into the per-cast/casts numbers below, not into the gauge.
    let (resist_f, after_f, resist_kind) = resist_for(ability.damage_type, defenses, self_stats);
    let effective_hp = round_u32(raw_hp_f * (100.0 + after_f) / 100.0);

    // The resist dimension of the secondary component, if this ability is hybrid (drives UI labeling).
    let secondary_resist_kind = ability
        .secondary
        .as_ref()
        .map(|s| resist_for(s.damage_type, defenses, self_stats).2);

    // The current rank of the nuke's slot, clamped to the authored table length.
    let max_rank = ability.base_by_rank.len() as u32;
    let rank = ability_rank(self_abilities, ability.slot).min(max_rank);

    if rank == 0 {
        // Slot not yet leveled (or no base table): show the gauge, but no per-cast / casts numbers.
        return Some(Durability {
            effective_hp,
            raw_hp,
            resist: round_u32(resist_f),
            resist_after_pen: round_u32(after_f),
            resist_kind,
            casts_to_kill: None,
            ability_slot: None,
            ability_name: None,
            per_cast_damage: None,
            secondary_resist_kind,
        });
    }

    // Post-mitigation per-cast damage, summed across the ability's components. Each component is
    // mitigated by ITS OWN resist (so a true-damage return pass is never reduced by MR), keeping
    // hybrid abilities honest. Single-type abilities (no `secondary`) match the previous result.
    let primary_post = component_post(
        ability.damage_type,
        ability.ratio_stat,
        ability.ratio,
        &ability.base_by_rank,
        rank,
        self_stats,
        defenses,
    );
    let secondary_post = ability
        .secondary
        .as_ref()
        .map(|s| {
            component_post(
                s.damage_type,
                s.ratio_stat,
                s.ratio,
                &s.base_by_rank,
                rank,
                self_stats,
                defenses,
            )
        })
        .unwrap_or(0.0);
    let total_post = primary_post + secondary_post;

    let per_cast = round_u32(total_post);
    let casts_to_kill = if total_post > 0.0 {
        Some((raw_hp_f / total_post).ceil() as u32)
    } else {
        None
    };

    Some(Durability {
        effective_hp,
        raw_hp,
        resist: round_u32(resist_f),
        resist_after_pen: round_u32(after_f),
        resist_kind,
        casts_to_kill,
        ability_slot: Some(ability.slot),
        ability_name: Some(slot_name(self_abilities, ability.slot)),
        per_cast_damage: Some(per_cast),
        secondary_resist_kind,
    })
}

/// The resist (before pen), the resist after the player's penetration, and which dimension applies,
/// for a given damage type. True/Mixed ignore resists for this single-nuke estimate.
fn resist_for(
    damage_type: DamageType,
    defenses: &ResolvedDefenses,
    self_stats: &SelfDamageStats,
) -> (f32, f32, ResistKind) {
    match damage_type {
        DamageType::Magic => {
            let r = defenses.mr.max(0.0);
            let after =
                (r * (1.0 - self_stats.magic_pen_percent) - self_stats.magic_pen_flat).max(0.0);
            (r, after, ResistKind::Magic)
        }
        DamageType::Physical => {
            let r = defenses.armor.max(0.0);
            let after =
                (r * (1.0 - self_stats.armor_pen_percent) - self_stats.armor_pen_flat).max(0.0);
            (r, after, ResistKind::Armor)
        }
        _ => (0.0, 0.0, ResistKind::None),
    }
}

/// Post-mitigation per-cast damage for one damage component at the ability's current `rank`,
/// mitigated by the component's own resist. Returns 0 when the slot isn't leveled.
fn component_post(
    damage_type: DamageType,
    ratio_stat: RatioStat,
    ratio: f32,
    base_by_rank: &[f32],
    rank: u32,
    self_stats: &SelfDamageStats,
    defenses: &ResolvedDefenses,
) -> f32 {
    let r = rank.min(base_by_rank.len() as u32);
    if r == 0 {
        return 0.0;
    }
    let base = base_by_rank[(r - 1) as usize];
    let stat = match ratio_stat {
        RatioStat::Ap => self_stats.ability_power,
        RatioStat::Ad => self_stats.attack_damage,
    };
    let raw_dmg = base + ratio * stat;
    let (_, after_f, resist_kind) = resist_for(damage_type, defenses, self_stats);
    // True damage is unmitigated; otherwise scale by the resist that still applies.
    if matches!(resist_kind, ResistKind::None) {
        raw_dmg
    } else {
        raw_dmg * 100.0 / (100.0 + after_f)
    }
}

/// The current rank of an ability slot from the player's live ability state.
fn ability_rank(abilities: &SelfAbilities, slot: AbilitySlot) -> u32 {
    match slot {
        AbilitySlot::Q => abilities.q.rank,
        AbilitySlot::W => abilities.w.rank,
        AbilitySlot::E => abilities.e.rank,
        AbilitySlot::R => abilities.r.rank,
    }
}

/// The display name of an ability slot from the player's live ability state.
fn slot_name(abilities: &SelfAbilities, slot: AbilitySlot) -> String {
    match slot {
        AbilitySlot::Q => abilities.q.name.clone(),
        AbilitySlot::W => abilities.w.name.clone(),
        AbilitySlot::E => abilities.e.name.clone(),
        AbilitySlot::R => abilities.r.name.clone(),
    }
}

/// Rounds to the nearest integer, clamping negatives to 0.
fn round_u32(x: f32) -> u32 {
    if x <= 0.0 {
        0
    } else {
        x.round() as u32
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::input::AbilityState;
    use crate::rules::DamageComponent;

    fn abilities_q_rank(rank: u32) -> SelfAbilities {
        SelfAbilities {
            q: AbilityState {
                rank,
                name: "Orb of Deception".into(),
            },
            ..Default::default()
        }
    }

    fn ahri_q() -> AbilityDamage {
        AbilityDamage {
            slot: AbilitySlot::Q,
            damage_type: DamageType::Magic,
            ratio_stat: RatioStat::Ap,
            ratio: 0.40,
            base_by_rank: vec![40.0, 65.0, 90.0, 115.0, 140.0],
            secondary: None,
        }
    }

    #[test]
    fn magic_case_with_known_numbers() {
        // Enemy: 2000 HP, 60 MR. Player: 200 AP, no pen, Q at rank 3 (base 90).
        let defenses = ResolvedDefenses {
            hp: 2000.0,
            armor: 80.0,
            mr: 60.0,
        };
        let stats = SelfDamageStats {
            ability_power: 200.0,
            ..Default::default()
        };
        let d = estimate(
            Some(&defenses),
            &stats,
            &abilities_q_rank(3),
            Some(&ahri_q()),
        )
        .expect("defenses present");

        // No pen -> resist after pen == 60. effective HP = 2000 * (160/100) = 3200.
        assert_eq!(d.resist, 60);
        assert_eq!(d.resist_after_pen, 60);
        assert_eq!(d.resist_kind, ResistKind::Magic);
        assert_eq!(d.raw_hp, 2000);
        assert_eq!(d.effective_hp, 3200);
        // raw nuke = 90 + 0.40*200 = 170; post-mitigation = 170 * 100/160 = 106.25 -> 106.
        assert_eq!(d.per_cast_damage, Some(106));
        // casts = ceil(2000 / 106.25) = ceil(18.82) = 19.
        assert_eq!(d.casts_to_kill, Some(19));
        assert_eq!(d.ability_slot, Some(AbilitySlot::Q));
        assert_eq!(d.ability_name.as_deref(), Some("Orb of Deception"));
    }

    #[test]
    fn true_damage_ignores_resist() {
        let defenses = ResolvedDefenses {
            hp: 1000.0,
            armor: 100.0,
            mr: 100.0,
        };
        let stats = SelfDamageStats {
            ability_power: 100.0,
            ..Default::default()
        };
        let mut ability = ahri_q();
        ability.damage_type = DamageType::True; // base 90 @ rank 3, ratio 0.40
        let d = estimate(
            Some(&defenses),
            &stats,
            &abilities_q_rank(3),
            Some(&ability),
        )
        .unwrap();

        assert_eq!(d.resist_kind, ResistKind::None);
        assert_eq!(d.resist, 0);
        assert_eq!(d.resist_after_pen, 0);
        // No resist -> effective HP == raw HP.
        assert_eq!(d.effective_hp, 1000);
        // raw nuke = 90 + 0.40*100 = 130, unmitigated.
        assert_eq!(d.per_cast_damage, Some(130));
        // casts = ceil(1000/130) = 8.
        assert_eq!(d.casts_to_kill, Some(8));
    }

    #[test]
    fn hybrid_sums_components_each_by_its_own_resist() {
        // A hybrid Q: magic on the way out + TRUE on the return. The true portion must NOT be
        // reduced by MR. Enemy: 1000 HP, 100 MR, no pen. Player: 100 AP.
        let defenses = ResolvedDefenses {
            hp: 1000.0,
            armor: 0.0,
            mr: 100.0,
        };
        let stats = SelfDamageStats {
            ability_power: 100.0,
            ..Default::default()
        };
        let mut ability = ahri_q();
        ability.damage_type = DamageType::Magic;
        ability.ratio = 0.60;
        ability.base_by_rank = vec![40.0, 0.0, 0.0, 0.0, 0.0]; // rank 1 -> base 40
        ability.secondary = Some(DamageComponent {
            damage_type: DamageType::True,
            ratio_stat: RatioStat::Ap,
            ratio: 0.40,
            base_by_rank: vec![50.0, 0.0, 0.0, 0.0, 0.0], // rank 1 -> base 50
        });
        let d = estimate(
            Some(&defenses),
            &stats,
            &abilities_q_rank(1),
            Some(&ability),
        )
        .unwrap();

        // Primary magic: raw = 40 + 0.60*100 = 100; after 100 MR -> 100 * 100/200 = 50.
        // Secondary true: raw = 50 + 0.40*100 = 90; unmitigated -> 90.
        // Total per cast = 140; casts = ceil(1000/140) = 8.
        assert_eq!(d.per_cast_damage, Some(140));
        assert_eq!(d.casts_to_kill, Some(8));
        // Gauge resist stays the PRIMARY dimension; the secondary dimension is surfaced separately.
        assert_eq!(d.resist_kind, ResistKind::Magic);
        assert_eq!(d.resist, 100);
        assert_eq!(d.secondary_resist_kind, Some(ResistKind::None));
    }

    #[test]
    fn no_defenses_yields_none() {
        let stats = SelfDamageStats::default();
        assert!(estimate(None, &stats, &abilities_q_rank(3), Some(&ahri_q())).is_none());
    }

    #[test]
    fn rank_zero_gives_gauge_without_cast_count() {
        let defenses = ResolvedDefenses {
            hp: 1500.0,
            armor: 50.0,
            mr: 40.0,
        };
        let stats = SelfDamageStats {
            ability_power: 100.0,
            ..Default::default()
        };
        // Q not yet leveled.
        let d = estimate(
            Some(&defenses),
            &stats,
            &abilities_q_rank(0),
            Some(&ahri_q()),
        )
        .unwrap();
        assert_eq!(d.raw_hp, 1500);
        // Resist + effective HP still computed (gauge shows), but no cast numbers.
        assert_eq!(d.resist, 40);
        assert_eq!(d.resist_kind, ResistKind::Magic);
        assert!(d.casts_to_kill.is_none());
        assert!(d.per_cast_damage.is_none());
        assert!(d.ability_slot.is_none());
        assert!(d.ability_name.is_none());
    }

    #[test]
    fn unauthored_ability_shows_raw_hp_gauge() {
        let defenses = ResolvedDefenses {
            hp: 1800.0,
            armor: 90.0,
            mr: 70.0,
        };
        let stats = SelfDamageStats::default();
        let d = estimate(Some(&defenses), &stats, &abilities_q_rank(5), None).unwrap();
        assert_eq!(d.resist_kind, ResistKind::None);
        assert_eq!(d.resist, 0);
        assert_eq!(d.resist_after_pen, 0);
        // No player damage type known -> gauge is raw HP, honestly.
        assert_eq!(d.effective_hp, d.raw_hp);
        assert_eq!(d.raw_hp, 1800);
        assert!(d.casts_to_kill.is_none());
        assert!(d.per_cast_damage.is_none());
    }

    #[test]
    fn flat_and_percent_pen_reduce_resist() {
        // 100 MR, 35% magic pen then 10 flat: 100*0.65 - 10 = 55.
        let defenses = ResolvedDefenses {
            hp: 1000.0,
            armor: 0.0,
            mr: 100.0,
        };
        let stats = SelfDamageStats {
            ability_power: 0.0,
            magic_pen_percent: 0.35,
            magic_pen_flat: 10.0,
            ..Default::default()
        };
        let d = estimate(
            Some(&defenses),
            &stats,
            &abilities_q_rank(1),
            Some(&ahri_q()),
        )
        .unwrap();
        assert_eq!(d.resist, 100);
        assert_eq!(d.resist_after_pen, 55);
    }
}
