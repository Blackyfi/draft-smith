//! Skill-order coach (PROJECT_SPEC §1.3): which ability to put the next point into.
//!
//! Pure and data-driven. The only per-champion data is the **maxing priority**
//! ([`SkillPlan::max_order`]). The universal rules — unlock each basic early, take the ultimate at
//! 6/11/16, respect the per-level rank caps — are game mechanics shared by *every* champion, so
//! they live here, not in data. No champion is special-cased (audit: this file branches only on
//! ability rank/level and the data-supplied priority, never on a champion name).

use crate::engine::input::SelfAbilities;
use crate::model::engine::{AbilitySlot, SkillAdvice};
use crate::rules::SkillPlan;

/// Highest basic-ability rank reachable at champion `level` (rank 1@1, 2@3, 3@5, 4@7, 5@9).
fn max_basic_rank(level: u32) -> u32 {
    level.div_ceil(2).min(5)
}

/// Highest ultimate rank reachable at champion `level` (rank 1@6, 2@11, 3@16).
fn max_ult_rank(level: u32) -> u32 {
    match level {
        l if l >= 16 => 3,
        l if l >= 11 => 2,
        l if l >= 6 => 1,
        _ => 0,
    }
}

/// The next ability point to spend, or `None` when the game hasn't started (`level == 0`) or
/// everything is already maxed. When a point is unspent right now it advises the current level
/// (`point_available = true`); otherwise it looks ahead to the next level-up.
pub fn recommend_skill(
    level: u32,
    abilities: &SelfAbilities,
    plan: &SkillPlan,
) -> Option<SkillAdvice> {
    if level == 0 {
        return None;
    }

    let rank_of = |slot: AbilitySlot| match slot {
        AbilitySlot::Q => abilities.q.rank,
        AbilitySlot::W => abilities.w.rank,
        AbilitySlot::E => abilities.e.rank,
        AbilitySlot::R => abilities.r.rank,
    };
    let name_of = |slot: AbilitySlot| match slot {
        AbilitySlot::Q => abilities.q.name.clone(),
        AbilitySlot::W => abilities.w.name.clone(),
        AbilitySlot::E => abilities.e.name.clone(),
        AbilitySlot::R => abilities.r.name.clone(),
    };

    let spent = rank_of(AbilitySlot::Q)
        + rank_of(AbilitySlot::W)
        + rank_of(AbilitySlot::E)
        + rank_of(AbilitySlot::R);
    // A point is unspent right now when fewer are invested than the champion's level; otherwise we
    // look ahead to the next level-up.
    let point_available = spent < level;
    let target_level = if point_available {
        level
    } else {
        (level + 1).min(18)
    };

    let make = |slot: AbilitySlot, reason: String| {
        let name = name_of(slot);
        Some(SkillAdvice {
            slot,
            ability_name: name,
            point_available,
            at_level: target_level,
            reason,
        })
    };
    let with_name = |slot: AbilitySlot, prefix: &str, fallback: &str| {
        let name = name_of(slot);
        if name.is_empty() {
            fallback.to_string()
        } else {
            format!("{prefix}{name}.")
        }
    };

    // 1) Ultimate first whenever a new rank just unlocked (6/11/16) — the biggest power spike.
    if rank_of(AbilitySlot::R) < max_ult_rank(target_level) {
        return make(
            AbilitySlot::R,
            "Take your ultimate — your biggest power spike.".to_string(),
        );
    }

    // 2) Unlock phase: one point into each basic early, in maxing priority.
    if let Some(&slot) = plan.max_order.iter().find(|&&s| rank_of(s) == 0) {
        return make(slot, with_name(slot, "Unlock ", "Unlock this ability."));
    }

    // 3) Max phase: rank the highest-priority basic you can still improve, preferring one that is
    // rankable at this level; fall back to the next priority that isn't maxed.
    let cap = max_basic_rank(target_level);
    let slot = plan
        .max_order
        .iter()
        .copied()
        .find(|&s| rank_of(s) < cap)
        .or_else(|| plan.max_order.iter().copied().find(|&s| rank_of(s) < 5))?;
    let is_primary = plan.max_order.first() == Some(&slot);
    let name = name_of(slot);
    let reason = match (name.is_empty(), is_primary) {
        (true, _) => "Keep maxing your priority ability.".to_string(),
        (false, true) => format!("Max {name} first."),
        (false, false) => format!("Max {name} next."),
    };
    make(slot, reason)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::input::AbilityState;

    fn ab(q: u32, w: u32, e: u32, r: u32) -> SelfAbilities {
        let named = |rank, name: &str| AbilityState {
            rank,
            name: name.into(),
        };
        SelfAbilities {
            q: named(q, "Orb of Deception"),
            w: named(w, "Fox-Fire"),
            e: named(e, "Charm"),
            r: named(r, "Spirit Rush"),
        }
    }

    /// Ahri's authored maxing priority Q > W > E.
    fn ahri() -> SkillPlan {
        SkillPlan {
            max_order: vec![AbilitySlot::Q, AbilitySlot::W, AbilitySlot::E],
        }
    }

    #[test]
    fn no_advice_before_the_game_starts() {
        assert!(recommend_skill(0, &ab(0, 0, 0, 0), &ahri()).is_none());
    }

    #[test]
    fn unlocks_each_basic_in_priority_for_the_first_three_levels() {
        // Level 1, nothing spent → unlock the top priority (Q).
        let a = recommend_skill(1, &ab(0, 0, 0, 0), &ahri()).unwrap();
        assert_eq!(a.slot, AbilitySlot::Q);
        assert!(a.point_available);
        assert_eq!(a.at_level, 1);

        // Level 2 with Q up → unlock W; level 3 with Q,W up → unlock E.
        assert_eq!(
            recommend_skill(2, &ab(1, 0, 0, 0), &ahri()).unwrap().slot,
            AbilitySlot::W
        );
        assert_eq!(
            recommend_skill(3, &ab(1, 1, 0, 0), &ahri()).unwrap().slot,
            AbilitySlot::E
        );
    }

    #[test]
    fn maxes_the_priority_ability_after_unlocking() {
        // Level 4, all basics at rank 1 → rank up Q (priority), reason names it "first".
        let a = recommend_skill(4, &ab(1, 1, 1, 0), &ahri()).unwrap();
        assert_eq!(a.slot, AbilitySlot::Q);
        assert!(a.reason.contains("first"));
    }

    #[test]
    fn takes_the_ultimate_at_each_breakpoint() {
        // Level 6 with the ult still at rank 0 → take R.
        let a = recommend_skill(6, &ab(3, 1, 1, 0), &ahri()).unwrap();
        assert_eq!(a.slot, AbilitySlot::R);
        assert!(a.reason.to_lowercase().contains("ultimate"));
    }

    #[test]
    fn respects_the_per_level_rank_cap_when_maxing() {
        // Level 8: Q is at rank 4 (its cap until level 9), so the point goes to the next priority.
        let a = recommend_skill(8, &ab(4, 1, 1, 1), &ahri()).unwrap();
        assert_eq!(a.slot, AbilitySlot::W);
    }

    #[test]
    fn looks_ahead_when_no_point_is_pending() {
        // All points spent (1 == level 1): advise the next level-up, not "now".
        let a = recommend_skill(1, &ab(1, 0, 0, 0), &ahri()).unwrap();
        assert!(!a.point_available);
        assert_eq!(a.at_level, 2);
        assert_eq!(a.slot, AbilitySlot::W);
    }

    #[test]
    fn none_when_everything_is_maxed() {
        assert!(recommend_skill(18, &ab(5, 5, 5, 3), &ahri()).is_none());
    }
}
