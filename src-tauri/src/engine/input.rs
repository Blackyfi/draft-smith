//! The boundary between raw Live Client data and the pure engine.
//!
//! The engine reasons over [`EngineInput`] — abstract, API-free. This adapter is the *only* place
//! that touches `live_client` types, and it does no I/O (pure mapping), so the engine itself stays
//! free of API coupling and the data-driven invariant is easy to audit: champion names/item ids
//! enter here only as data-lookup keys, never as control-flow branches.

use crate::live_client::model::AllGameData;

/// Everything the engine needs about the current game, in abstract form.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct EngineInput {
    /// The player's champion (Live Client `championName`); a lookup key into the rule set.
    pub self_champion: String,
    /// Item ids the player already owns (for marking the path and not re-recommending).
    pub self_items: Vec<u32>,
    /// Allied champion names (comp context; reserved for ally-gap heuristics).
    pub allies: Vec<String>,
    pub enemies: Vec<EnemyInput>,
    pub game_time: f64,
    pub gold: f64,
    /// The player's champion level (1–18); drives skill-order timing. 0 when not yet known.
    pub self_level: u32,
    /// The player's current ability ranks + names, for the skill-order coach.
    pub self_abilities: SelfAbilities,
    /// The player's live offensive stats, for the durability / casts-to-kill estimator.
    pub self_stats: SelfDamageStats,
}

/// The active player's offensive stats the durability estimator reasons over — abstract numbers,
/// no champion identity. The `*_percent` pen values are fractions in `0.0..=1.0`; flat pen already
/// includes lethality-derived armor pen (mirrors the Live Client `championStats`).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SelfDamageStats {
    pub ability_power: f32,
    pub attack_damage: f32,
    pub magic_pen_flat: f32,
    pub magic_pen_percent: f32,
    pub armor_pen_flat: f32,
    pub armor_pen_percent: f32,
}

/// One enemy's resolved defensive stats at their current level + items, injected by the poller from
/// DDragon (the pure engine has no DDragon access). An at-a-glance estimate: excludes the enemy's
/// runes, current HP, and level passives, which no Riot-sanctioned source exposes.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct ResolvedDefenses {
    pub hp: f32,
    pub armor: f32,
    pub mr: f32,
}

/// The active player's four ability slots (rank + display name), in canonical order.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SelfAbilities {
    pub q: AbilityState,
    pub w: AbilityState,
    pub e: AbilityState,
    pub r: AbilityState,
}

/// One ability slot's live state.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct AbilityState {
    /// Current rank (points invested): 0–5 for basics, 0–3 for the ultimate.
    pub rank: u32,
    /// Display name from the Live Client (e.g. "Spirit Rush"); may be empty.
    pub name: String,
}

/// One enemy, reduced to what classification needs.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct EnemyInput {
    pub champion: String,
    pub items: Vec<u32>,
    pub level: u32,
    pub kills: u32,
    pub deaths: u32,
    pub assists: u32,
    /// Resolved defensive stats (HP/armor/MR) at this enemy's level + items, injected by the poller
    /// from DDragon. `None` until resolved — `from_all_game_data` leaves it `None`.
    pub defenses: Option<ResolvedDefenses>,
}

impl EngineInput {
    /// Builds engine input from a `/allgamedata` snapshot, or `None` if the local player can't be
    /// identified (e.g. a spectated game) — in which case there is nothing to recommend.
    pub fn from_all_game_data(data: &AllGameData) -> Option<Self> {
        let me = data.self_player()?;
        let my_team = &me.team;

        let allies = data
            .all_players
            .iter()
            .filter(|p| !p.is_same_player(me) && !p.team.is_empty() && &p.team == my_team)
            .map(|p| p.champion_name.clone())
            .collect();

        let enemies = data
            .enemies()
            .into_iter()
            .map(|p| EnemyInput {
                champion: p.champion_name.clone(),
                items: p.items.iter().map(|i| i.item_id).collect(),
                level: p.level,
                kills: p.scores.kills,
                deaths: p.scores.deaths,
                assists: p.scores.assists,
                // The poller resolves defenses from DDragon and injects them on recompute; the pure
                // adapter has no DDragon access, so it leaves them unresolved here.
                defenses: None,
            })
            .collect();

        let active = data.active_player.as_ref();
        let abilities = active.map(|a| &a.abilities);
        let ability_state = |pick: fn(
            &crate::live_client::model::Abilities,
        ) -> &crate::live_client::model::Ability| {
            abilities.map_or_else(AbilityState::default, |ab| {
                let a = pick(ab);
                AbilityState {
                    rank: a.ability_level,
                    name: a.display_name.clone(),
                }
            })
        };

        Some(Self {
            self_champion: me.champion_name.clone(),
            self_items: me.items.iter().map(|i| i.item_id).collect(),
            allies,
            enemies,
            game_time: data.game_data.game_time,
            gold: active.map_or(0.0, |a| a.current_gold),
            self_level: active.map_or(0, |a| a.level),
            self_abilities: SelfAbilities {
                q: ability_state(|ab| &ab.q),
                w: ability_state(|ab| &ab.w),
                e: ability_state(|ab| &ab.e),
                r: ability_state(|ab| &ab.r),
            },
            self_stats: active.map_or_else(SelfDamageStats::default, |a| {
                let s = &a.champion_stats;
                SelfDamageStats {
                    ability_power: s.ability_power,
                    attack_damage: s.attack_damage,
                    magic_pen_flat: s.magic_penetration_flat,
                    magic_pen_percent: s.magic_penetration_percent,
                    armor_pen_flat: s.armor_penetration_flat,
                    armor_pen_percent: s.armor_penetration_percent,
                }
            }),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../live_client/fixtures/allgamedata.json");

    #[test]
    fn maps_captured_snapshot_to_engine_input() {
        let data: AllGameData = serde_json::from_str(FIXTURE).unwrap();
        let input = EngineInput::from_all_game_data(&data).expect("self is identifiable");

        assert_eq!(input.self_champion, "Ahri");
        // Ahri owns Luden's, Sorc Shoes, and Health Potions in the fixture.
        assert!(input.self_items.contains(&6655));
        // The four same-team allies, with the local player excluded by identity (not pointer).
        assert_eq!(input.allies.len(), 4);
        assert!(
            !input.allies.contains(&"Ahri".to_string()),
            "the local player must not appear among their own allies"
        );
        assert_eq!(input.enemies.len(), 5);

        let zed = input.enemies.iter().find(|e| e.champion == "Zed").unwrap();
        assert!(zed.items.contains(&6692)); // Eclipse
        assert_eq!(zed.kills, 4);
        assert_eq!(zed.deaths, 2);
    }

    #[test]
    fn no_self_player_yields_none() {
        // A spectated/partial payload with no identifiable active player → nothing to recommend.
        let data: AllGameData = serde_json::from_str("{}").unwrap();
        assert!(EngineInput::from_all_game_data(&data).is_none());
    }
}
