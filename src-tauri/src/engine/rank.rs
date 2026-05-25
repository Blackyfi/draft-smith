//! Item selection, ordering, and the assembled recommendation (PROJECT_SPEC §5.2 steps 4–7).
//!
//! `recommend` is the engine's entry point and the function the snapshot corpus pins. It is pure:
//! same `EngineInput` + `RuleSet` ⇒ same `Recommendation`, with deterministic tie-breaks throughout
//! (no clock, no RNG). It branches only on abstract attributes — `Archetype`, `IntentTag`, the
//! derived `CounterCondition`s — never on a champion name or item id.

use crate::engine::aggregate::{active_conditions, ActiveCondition};
use crate::engine::classify::classify_enemy;
use crate::engine::explain;
use crate::engine::input::EngineInput;
use crate::engine::skill::recommend_skill;
use crate::model::{BuildStep, EnemyThreatView, Recommendation, SwapSuggestion, ThreatProfile};
use crate::rules::{CounterRule, RuleSet};

/// Total items in the recommended path (anchors + boots + situational), I1→I6.
const BUILD_PATH_LEN: usize = 6;
/// How many situational swaps to surface.
const MAX_SWAPS: usize = 3;

/// One active condition paired with the counter rule that answers it. The basis for both scoring
/// and explanations.
struct Demand {
    active: ActiveCondition,
    rule: CounterRule,
}

/// An item scored against the current demands.
struct Scored {
    id: u32,
    score: f32,
    /// Authored order within its source list — the deterministic tie-break (favours the build
    /// author's intended sequence over raw id order).
    order: usize,
    /// Index of the strongest demand this item answers, if any (drives the reason).
    best_demand: Option<usize>,
}

/// Produces the full recommendation for the current game state.
///
/// If the player's champion has no authored build graph, returns a recommendation with the enemy
/// threat board populated but an empty path (we can still show *why*, just not *what* — better than
/// nothing for an unauthored champion).
pub fn recommend(input: &EngineInput, rules: &RuleSet) -> Recommendation {
    let profiles: Vec<ThreatProfile> = input
        .enemies
        .iter()
        .map(|e| classify_enemy(e, rules))
        .collect();

    let demands = build_demands(&profiles, rules);
    let threats = profiles.iter().map(threat_view).collect();

    // Skill-order advice is independent of the build graph (an enemy-less champ still levels up),
    // so compute it once up front and attach it to whichever recommendation we return.
    let skill = rules
        .skill_plan(&input.self_champion)
        .and_then(|plan| recommend_skill(input.self_level, &input.self_abilities, plan));

    let Some(graph) = rules
        .champion(&input.self_champion)
        .and_then(|c| c.build_graph.as_ref())
    else {
        return Recommendation {
            self_champion: input.self_champion.clone(),
            build_path: Vec::new(),
            swaps: Vec::new(),
            threats,
            skill,
        };
    };

    // Anchors are always-core, taken in their authored order.
    let mut path: Vec<u32> = graph.anchors.clone();

    // Pick the single best boots for the matchup (defaulting to the first listed). Guard against a
    // mis-listed non-boots id by filtering to items actually flagged `is_boots` (falling back to
    // the authored list if the data flags none).
    let boots_ids: Vec<u32> = graph
        .boots
        .iter()
        .copied()
        .filter(|&id| rules.item(id).is_some_and(|i| i.is_boots))
        .collect();
    let boots_pool = if boots_ids.is_empty() {
        &graph.boots
    } else {
        &boots_ids
    };
    if let Some(boots) = best_of(boots_pool, rules, &demands) {
        if !path.contains(&boots) {
            path.push(boots);
        }
    }

    // Fill the rest with the highest-scoring situational candidates.
    let ranked = ranked_candidates(&graph.candidates, rules, &demands);
    for scored in &ranked {
        if path.len() >= BUILD_PATH_LEN {
            break;
        }
        if !path.contains(&scored.id) {
            path.push(scored.id);
        }
    }
    path.truncate(BUILD_PATH_LEN);

    let build_path = path
        .iter()
        .map(|&id| build_step(id, &graph.anchors, input, rules, &demands))
        .collect();

    // Swaps: the next-best matchup-relevant candidates not already in the core path.
    let swaps = ranked
        .iter()
        .filter(|s| !path.contains(&s.id) && s.best_demand.is_some())
        .take(MAX_SWAPS)
        .filter_map(|s| swap_suggestion(s, rules, &demands))
        .collect();

    Recommendation {
        self_champion: input.self_champion.clone(),
        build_path,
        swaps,
        threats,
        skill,
    }
}

/// Pairs each active condition with its counter rule (dropping any condition the data has no rule
/// for). Order is the deterministic order from [`active_conditions`].
fn build_demands(profiles: &[ThreatProfile], rules: &RuleSet) -> Vec<Demand> {
    active_conditions(profiles)
        .into_iter()
        .filter_map(|active| {
            rules.counter(active.condition).map(|rule| Demand {
                active,
                rule: rule.clone(),
            })
        })
        .collect()
}

/// Scores an item: each demand whose preferred intent-tags the item carries adds that demand's
/// weight. Records the strongest matched demand for the reason. Unknown items score 0.
fn score_item(id: u32, order: usize, rules: &RuleSet, demands: &[Demand]) -> Scored {
    let tags = rules
        .item(id)
        .map(|i| i.intent_tags.as_slice())
        .unwrap_or(&[]);
    let mut score = 0.0;
    let mut best_demand: Option<usize> = None;
    let mut best_weight = f32::NEG_INFINITY;

    for (i, demand) in demands.iter().enumerate() {
        let matches = demand.rule.prefer.iter().any(|t| tags.contains(t));
        if matches {
            score += demand.rule.weight;
            if demand.rule.weight > best_weight {
                best_weight = demand.rule.weight;
                best_demand = Some(i);
            }
        }
    }
    Scored {
        id,
        score,
        order,
        best_demand,
    }
}

/// Ranks candidate ids by score (desc), tie-broken by authored order (asc) for determinism.
fn ranked_candidates(ids: &[u32], rules: &RuleSet, demands: &[Demand]) -> Vec<Scored> {
    let mut scored: Vec<Scored> = ids
        .iter()
        .enumerate()
        .map(|(order, &id)| score_item(id, order, rules, demands))
        .collect();
    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.order.cmp(&b.order))
    });
    scored
}

/// The best-scoring id from a list (e.g. boots), or the first listed if none score.
fn best_of(ids: &[u32], rules: &RuleSet, demands: &[Demand]) -> Option<u32> {
    ranked_candidates(ids, rules, demands).first().map(|s| s.id)
}

fn build_step(
    id: u32,
    anchors: &[u32],
    input: &EngineInput,
    rules: &RuleSet,
    demands: &[Demand],
) -> BuildStep {
    let item = rules.item(id);
    let name = item.map_or_else(|| format!("Item {id}"), |i| i.name.clone());
    let cost = item.map_or(0, |i| i.total_cost);

    let reason = if anchors.contains(&id) {
        explain::anchor_reason(&input.self_champion)
    } else {
        let scored = score_item(id, 0, rules, demands);
        match scored.best_demand {
            Some(i) => explain::item_reason(&demands[i].active, &demands[i].rule.reason),
            None => explain::filler_reason(),
        }
    };

    BuildStep {
        item_id: id,
        name,
        cost,
        owned: input.self_items.contains(&id),
        reason,
    }
}

fn swap_suggestion(scored: &Scored, rules: &RuleSet, demands: &[Demand]) -> Option<SwapSuggestion> {
    let demand = &demands[scored.best_demand?];
    let item = rules.item(scored.id);
    Some(SwapSuggestion {
        trigger: explain::swap_trigger(demand.active.condition),
        item_id: scored.id,
        name: item.map_or_else(|| format!("Item {}", scored.id), |i| i.name.clone()),
        reason: explain::item_reason(&demand.active, &demand.rule.reason),
    })
}

fn threat_view(profile: &ThreatProfile) -> EnemyThreatView {
    EnemyThreatView {
        champion: profile.champion.clone(),
        archetype: profile.archetype,
        signals: profile.signals.clone(),
    }
}
