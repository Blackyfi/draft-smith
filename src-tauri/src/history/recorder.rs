//! The match recorder: a pure, cross-poll accumulator that turns a stream of `/allgamedata`
//! snapshots into a [`MatchRecord`] (Part A).
//!
//! **Purity:** like the engine, the recorder takes no clock and does no I/O — every timestamp comes
//! from `gameData.gameTime` in the payload, so it is fully deterministic and unit-testable by
//! feeding synthetic snapshots. Wall-clock time, the app version, and the patch are supplied by the
//! caller (the poller) at flush, not read here. It records abstract facts only — no champion/item
//! branching — so the data-driven invariant is untouched.

use std::collections::{HashMap, HashSet};

use crate::live_client::model::{AllGameData, GameEvent, Player};
use crate::model::engine::AbilitySlot;

use super::model::{
    ItemEvent, ItemEventKind, ItemRef, LevelEvent, MatchEvent, MatchPlayer, MatchRecord,
    MatchResult, SkillEvent,
};

/// Games shorter than this (in seconds of observed game time) are treated as aborted/remade lobbies
/// and not saved. Keeps the history free of dodge/reconnect noise.
pub const MIN_DURATION_SECS: f64 = 60.0;

/// The sentinel `gameMode` the dev mock server advertises so its games are never written to the
/// user's real match history. The mock replays a real `CLASSIC` payload over the actual Live Client
/// origin (`127.0.0.1:2999`), so it is otherwise indistinguishable from a real game — this sentinel
/// is the one thing that marks it. Mirrored in `scripts/mock-live-server.mjs`.
pub const MOCK_GAME_MODE: &str = "DRAFTSMITHMOCK";

/// Game modes that are never recorded — they aren't real matches: the in-client Tutorial and
/// Practice Tool, and the dev mock. Compared case-insensitively against the Live Client `gameMode`.
const NON_RECORDABLE_MODES: [&str; 3] = ["TUTORIAL", "PRACTICETOOL", MOCK_GAME_MODE];

/// Whether a game in `mode` should be persisted to match history. An empty/unknown mode is
/// recordable (a real game always reports one; we never want to silently drop real matches).
fn is_recordable_mode(mode: &str) -> bool {
    !NON_RECORDABLE_MODES.contains(&mode.to_ascii_uppercase().as_str())
}

/// Per-player running state: latest identity + scoreline, plus the diff trackers the timelines
/// derive from.
#[derive(Debug, Clone, Default)]
struct PlayerAccum {
    champion: String,
    riot_id: String,
    summoner_name: String,
    team: String,
    position: String,
    is_bot: bool,
    is_self: bool,
    summoner_spells: [String; 2],
    final_level: u32,
    kills: u32,
    deaths: u32,
    assists: u32,
    creep_score: u32,
    ward_score: f64,
    final_items: Vec<ItemRef>,
    /// Item ids owned as of the last observation, for diffing acquisitions/removals.
    last_items: HashSet<u32>,
    /// Champion level as of the last observation, for diffing level-ups.
    last_level: u32,
}

/// Accumulates a single game's data across polls. Construct with [`MatchRecorder::default`], feed
/// every in-game snapshot to [`observe`](Self::observe), then [`into_record`](Self::into_record) at
/// game end.
#[derive(Debug, Clone, Default)]
pub struct MatchRecorder {
    player_order: Vec<String>,
    players: HashMap<String, PlayerAccum>,
    self_key: Option<String>,
    self_champion: Option<String>,

    item_timeline: Vec<ItemEvent>,
    level_timeline: Vec<LevelEvent>,
    skill_timeline: Vec<SkillEvent>,
    /// Local player's last-seen ability ranks (Q, W, E, R), for diffing skill-point spends.
    last_ability_ranks: [u32; 4],

    game_mode: String,
    map_name: String,
    map_number: u32,
    max_game_time: f64,

    events: Vec<MatchEvent>,
    seen_event_ids: HashSet<u32>,
    result: MatchResult,

    /// Wall-clock time (Unix epoch ms) recording began. Supplied by the poller at creation — the
    /// recorder never reads the clock itself, preserving its clockless/testable design.
    started_at: i64,
    observed: bool,
}

impl MatchRecorder {
    /// Creates a recorder stamped with the wall-clock time recording began (the poller passes
    /// `SystemTime::now()`; the recorder itself stays clock-free).
    pub fn starting_at(started_at: i64) -> Self {
        Self {
            started_at,
            ..Self::default()
        }
    }

    /// Folds one `/allgamedata` snapshot into the running record. Idempotent on unchanged input
    /// (no spurious timeline entries), so the poller can call it every poll, not just on a diff.
    pub fn observe(&mut self, data: &AllGameData) {
        self.observed = true;
        let game_time = data.game_data.game_time;
        self.max_game_time = self.max_game_time.max(game_time);
        // Game meta: take the first non-empty values (they don't change mid-game).
        if self.game_mode.is_empty() && !data.game_data.game_mode.is_empty() {
            self.game_mode = data.game_data.game_mode.clone();
        }
        if self.map_name.is_empty() && !data.game_data.map_name.is_empty() {
            self.map_name = data.game_data.map_name.clone();
        }
        if self.map_number == 0 {
            self.map_number = data.game_data.map_number;
        }

        // Identify the local player once (by the same identity logic the engine uses).
        let self_key = data.self_player().map(player_key);
        if let Some(ref key) = self_key {
            self.self_key = Some(key.clone());
            if let Some(me) = data.self_player() {
                self.self_champion = Some(me.champion_name.clone());
            }
        }

        for player in &data.all_players {
            let key = player_key(player);
            let is_self = self_key.as_deref() == Some(key.as_str());
            self.observe_player(&key, player, is_self, game_time);
        }

        self.observe_self_skills(data, game_time);
        self.observe_events(&data.events.events);
    }

    /// Updates one player's accumulator and emits any item/level transitions.
    fn observe_player(&mut self, key: &str, player: &Player, is_self: bool, game_time: f64) {
        if !self.players.contains_key(key) {
            self.player_order.push(key.to_string());
            self.players.insert(key.to_string(), PlayerAccum::default());
        }
        // Pull the accumulator out by value-free borrow split: gather diffs first, then mutate.
        let accum = self.players.get_mut(key).expect("just inserted");

        // Latest identity.
        accum.champion = player.champion_name.clone();
        accum.riot_id = player.riot_id.clone();
        accum.summoner_name = player.summoner_name.clone();
        accum.team = player.team.clone();
        accum.position = player.position.clone();
        accum.is_bot = player.is_bot;
        accum.is_self = is_self;
        accum.summoner_spells = [
            player
                .summoner_spells
                .summoner_spell_one
                .display_name
                .clone(),
            player
                .summoner_spells
                .summoner_spell_two
                .display_name
                .clone(),
        ];
        // Latest scoreline + items.
        accum.final_level = player.level;
        accum.kills = player.scores.kills;
        accum.deaths = player.scores.deaths;
        accum.assists = player.scores.assists;
        accum.creep_score = player.scores.creep_score;
        accum.ward_score = player.scores.ward_score;
        accum.final_items = player
            .items
            .iter()
            .map(|i| ItemRef {
                id: i.item_id,
                name: i.display_name.clone(),
                slot: i.slot,
            })
            .collect();

        // Level diff (skip the no-op zero level some partial payloads carry).
        if player.level != 0 && player.level != accum.last_level {
            self.level_timeline.push(LevelEvent {
                game_time,
                player_key: key.to_string(),
                level: player.level,
            });
            accum.last_level = player.level;
        }

        // Item diff (presence-based; stack-count changes are ignored to avoid potion spam).
        let current: HashSet<u32> = player.items.iter().map(|i| i.item_id).collect();
        // Acquisitions: in current, not in last. Name from the live slot.
        for item in &player.items {
            if !accum.last_items.contains(&item.item_id) {
                self.item_timeline.push(ItemEvent {
                    game_time,
                    player_key: key.to_string(),
                    item_id: item.item_id,
                    name: item.display_name.clone(),
                    kind: ItemEventKind::Acquired,
                });
            }
        }
        // Removals: in last, not in current. Name resolved from prior final_items if known.
        for &old in accum.last_items.iter() {
            if !current.contains(&old) {
                self.item_timeline.push(ItemEvent {
                    game_time,
                    player_key: key.to_string(),
                    item_id: old,
                    name: String::new(),
                    kind: ItemEventKind::Removed,
                });
            }
        }
        accum.last_items = current;
    }

    /// Emits skill-point spends for the local player by diffing the active player's ability ranks.
    fn observe_self_skills(&mut self, data: &AllGameData, game_time: f64) {
        let Some(active) = data.active_player.as_ref() else {
            return;
        };
        let ab = &active.abilities;
        let slots = [
            (AbilitySlot::Q, &ab.q),
            (AbilitySlot::W, &ab.w),
            (AbilitySlot::E, &ab.e),
            (AbilitySlot::R, &ab.r),
        ];
        for (idx, (slot, ability)) in slots.into_iter().enumerate() {
            let last = self.last_ability_ranks[idx];
            let new = ability.ability_level;
            if new > last {
                // One event per rank gained, so a missed poll that jumped two ranks still records
                // both points (same time/level — the best estimate available).
                for rank in (last + 1)..=new {
                    self.skill_timeline.push(SkillEvent {
                        game_time,
                        slot,
                        ability_rank: rank,
                        champion_level: active.level,
                        ability_name: ability.display_name.clone(),
                    });
                }
                self.last_ability_ranks[idx] = new;
            }
        }
    }

    /// Folds new entries from the (cumulative) event feed, de-duplicating by `EventID`, and tracks
    /// the terminal result.
    fn observe_events(&mut self, events: &[GameEvent]) {
        for ev in events {
            if !self.seen_event_ids.insert(ev.event_id) {
                continue;
            }
            if ev.event_name == "GameEnd" {
                self.result = match ev.result.as_str() {
                    "Win" => MatchResult::Win,
                    "Lose" | "Loss" | "Defeat" => MatchResult::Loss,
                    _ => MatchResult::Unknown,
                };
            }
            self.events.push(normalize_event(ev));
        }
    }

    /// Whether this recorder holds a game worth persisting: a real, identified game past the
    /// duration floor and in a recordable mode (not the dev mock / Tutorial / Practice Tool).
    pub fn is_worth_saving(&self) -> bool {
        self.observed
            && self.self_key.is_some()
            && self.max_game_time >= MIN_DURATION_SECS
            && is_recordable_mode(&self.game_mode)
    }

    /// Finalizes into a [`MatchRecord`]. The caller supplies the game-end wall-clock time (`ended_at`,
    /// paired with the `started_at` stamped at creation), app version, and patch — the recorder is
    /// clockless/IO-free by design.
    pub fn into_record(self, ended_at: i64, app_version: String, patch: String) -> MatchRecord {
        let self_champion = self.self_champion.clone().unwrap_or_default();
        let id = make_id(ended_at, &self_champion);

        let players = self
            .player_order
            .iter()
            .filter_map(|key| {
                let a = self.players.get(key)?;
                Some(MatchPlayer {
                    key: key.clone(),
                    champion: a.champion.clone(),
                    riot_id: a.riot_id.clone(),
                    summoner_name: a.summoner_name.clone(),
                    team: a.team.clone(),
                    position: a.position.clone(),
                    is_bot: a.is_bot,
                    is_self: a.is_self,
                    summoner_spells: a.summoner_spells.clone(),
                    final_level: a.final_level,
                    kills: a.kills,
                    deaths: a.deaths,
                    assists: a.assists,
                    creep_score: a.creep_score,
                    ward_score: a.ward_score,
                    final_items: a.final_items.clone(),
                })
            })
            .collect();

        MatchRecord {
            id,
            started_at: self.started_at,
            ended_at,
            app_version,
            patch,
            game_mode: self.game_mode,
            map_name: self.map_name,
            map_number: self.map_number,
            duration_seconds: self.max_game_time,
            result: self.result,
            self_champion,
            players,
            item_timeline: self.item_timeline,
            level_timeline: self.level_timeline,
            skill_timeline: self.skill_timeline,
            events: self.events,
        }
    }
}

/// A stable per-game identity for a player: Riot ID game-name → summoner name → champion (so a
/// bot/partial row still keys to *something*). The exact value doesn't matter as long as it's stable
/// across polls within one game, which all three sources are.
pub fn player_key(player: &Player) -> String {
    let riot = player
        .riot_id
        .split_once('#')
        .map(|(name, _)| name)
        .unwrap_or(&player.riot_id);
    if !riot.is_empty() {
        riot.to_string()
    } else if !player.summoner_name.is_empty() {
        player.summoner_name.clone()
    } else {
        // Last-resort fallback for identity-less rows (some bot/partial payloads carry neither a
        // Riot ID nor a summoner name): champion + team. A champion appears at most once per team in
        // every mode, so this stays unique across the roster — whereas champion alone would merge a
        // mirror pick on the opposing team into one accumulator.
        format!("{}#{}", player.champion_name, player.team)
    }
}

/// Builds the record id / file stem from the flush time and the player's champion, keeping only
/// filename-safe characters.
fn make_id(recorded_at: i64, self_champion: &str) -> String {
    let champ: String = self_champion
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    if champ.is_empty() {
        format!("{recorded_at}")
    } else {
        format!("{recorded_at}_{champ}")
    }
}

/// Normalizes a raw [`GameEvent`] into a [`MatchEvent`]: empty strings become `None`, the `Stolen`
/// string becomes a `bool`.
fn normalize_event(ev: &GameEvent) -> MatchEvent {
    let opt = |s: &str| (!s.is_empty()).then(|| s.to_string());
    MatchEvent {
        game_time: ev.event_time,
        kind: ev.event_name.clone(),
        killer: opt(&ev.killer_name),
        victim: opt(&ev.victim_name),
        assisters: ev.assisters.clone(),
        recipient: opt(&ev.recipient),
        dragon_type: opt(&ev.dragon_type),
        stolen: (!ev.stolen.is_empty()).then(|| ev.stolen.eq_ignore_ascii_case("true")),
        turret: opt(&ev.turret_killed),
        inhib: opt(&ev.inhib_killed),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(json: &str) -> AllGameData {
        serde_json::from_str(json).unwrap()
    }

    /// Builds a minimal in-game payload for the local player (Ahri) + one enemy (Zed), with
    /// configurable game time, the player's items/level/abilities, and an optional events block.
    fn snapshot(game_time: f64, self_items: &str, q_rank: u32, level: u32, events: &str) -> String {
        format!(
            r#"{{
                "activePlayer": {{
                    "riotIdGameName": "Me", "level": {level},
                    "abilities": {{ "Q": {{ "abilityLevel": {q_rank}, "displayName": "Orb of Deception" }} }}
                }},
                "allPlayers": [
                    {{ "championName": "Ahri", "riotId": "Me#EUW", "team": "ORDER", "level": {level},
                       "items": {self_items},
                       "scores": {{ "kills": 3, "deaths": 1, "assists": 5, "creepScore": 120 }} }},
                    {{ "championName": "Zed", "riotId": "Foe#EUW", "team": "CHAOS", "level": 5,
                       "items": [] }}
                ],
                "events": {{ "Events": {events} }},
                "gameData": {{ "gameMode": "CLASSIC", "gameTime": {game_time}, "mapName": "Map11", "mapNumber": 11 }}
            }}"#
        )
    }

    #[test]
    fn records_items_levels_skills_and_result_across_polls() {
        let mut rec = MatchRecorder::default();
        // t=10: no items, level 1, Q rank 1.
        rec.observe(&parse(&snapshot(10.0, "[]", 1, 1, "[]")));
        // t=30: buys Doran's Ring (1056), still level 1, Q rank 1 (no new skill).
        rec.observe(&parse(&snapshot(
            30.0,
            r#"[{ "itemID": 1056, "count": 1, "slot": 0, "displayName": "Doran's Ring" }]"#,
            1,
            1,
            "[]",
        )));
        // t=95: level 3, Q rank 2 (one skill point), keeps the item.
        rec.observe(&parse(&snapshot(
            95.0,
            r#"[{ "itemID": 1056, "count": 1, "slot": 0, "displayName": "Doran's Ring" }]"#,
            2,
            3,
            "[]",
        )));
        // t=1800: a kill event + GameEnd Win.
        rec.observe(&parse(&snapshot(
            1800.0,
            r#"[{ "itemID": 1056, "count": 1, "slot": 0, "displayName": "Doran's Ring" }]"#,
            2,
            3,
            r#"[
                { "EventID": 1, "EventName": "ChampionKill", "EventTime": 600.0, "KillerName": "Me#EUW", "VictimName": "Foe#EUW" },
                { "EventID": 2, "EventName": "GameEnd", "EventTime": 1800.0, "Result": "Win" }
            ]"#,
        )));

        let record = rec.into_record(1_700_000_000_000, "0.1.13".into(), "16.11.1".into());

        // Item timeline: exactly one acquisition (Doran's Ring at t=30) for the local player.
        let acquisitions: Vec<_> = record
            .item_timeline
            .iter()
            .filter(|e| e.kind == ItemEventKind::Acquired)
            .collect();
        assert_eq!(acquisitions.len(), 1);
        assert_eq!(acquisitions[0].item_id, 1056);
        assert_eq!(acquisitions[0].game_time, 30.0);
        assert_eq!(acquisitions[0].player_key, "Me");

        // Level timeline: level 1 (t=10) then level 3 (t=95) for the local player. Zed stays 5 → one
        // entry at first sight.
        let me_levels: Vec<u32> = record
            .level_timeline
            .iter()
            .filter(|e| e.player_key == "Me")
            .map(|e| e.level)
            .collect();
        assert_eq!(me_levels, vec![1, 3]);

        // Skill timeline: Q to rank 1 (t=10) then rank 2 (t=95).
        assert_eq!(record.skill_timeline.len(), 2);
        assert_eq!(record.skill_timeline[0].slot, AbilitySlot::Q);
        assert_eq!(record.skill_timeline[0].ability_rank, 1);
        assert_eq!(record.skill_timeline[1].ability_rank, 2);
        assert_eq!(record.skill_timeline[1].champion_level, 3);

        // Events de-duplicated; result captured.
        assert_eq!(record.events.len(), 2);
        assert_eq!(record.result, MatchResult::Win);
        assert_eq!(record.duration_seconds, 1800.0);
        assert_eq!(record.game_mode, "CLASSIC");
        assert_eq!(record.map_number, 11);

        // Roster: the local player flagged, both teams present.
        assert_eq!(record.players.len(), 2);
        let me = record.players.iter().find(|p| p.is_self).unwrap();
        assert_eq!(me.champion, "Ahri");
        assert_eq!(me.kills, 3);
        assert_eq!(me.final_items.len(), 1);
        assert_eq!(record.self_champion, "Ahri");
        assert!(record.id.starts_with("1700000000000_Ahri"));
    }

    #[test]
    fn events_are_not_double_counted_across_polls() {
        let evs = r#"[{ "EventID": 1, "EventName": "ChampionKill", "EventTime": 60.0, "KillerName": "Me#EUW", "VictimName": "Foe#EUW" }]"#;
        let mut rec = MatchRecorder::default();
        rec.observe(&parse(&snapshot(60.0, "[]", 1, 2, evs)));
        rec.observe(&parse(&snapshot(90.0, "[]", 1, 2, evs)));
        let record = rec.into_record(0, "v".into(), "p".into());
        assert_eq!(
            record.events.len(),
            1,
            "the same EventID is only recorded once"
        );
        assert_eq!(record.events[0].killer.as_deref(), Some("Me#EUW"));
    }

    #[test]
    fn item_removal_is_recorded() {
        let with = r#"[{ "itemID": 2003, "count": 1, "slot": 0, "displayName": "Health Potion" }]"#;
        let mut rec = MatchRecorder::default();
        rec.observe(&parse(&snapshot(30.0, with, 1, 1, "[]")));
        rec.observe(&parse(&snapshot(60.0, "[]", 1, 1, "[]"))); // potion consumed
        let record = rec.into_record(0, "v".into(), "p".into());
        let removals: Vec<_> = record
            .item_timeline
            .iter()
            .filter(|e| e.kind == ItemEventKind::Removed)
            .collect();
        assert_eq!(removals.len(), 1);
        assert_eq!(removals[0].item_id, 2003);
        assert_eq!(removals[0].game_time, 60.0);
    }

    #[test]
    fn non_match_modes_are_not_recorded() {
        // A long, fully-identified game is still dropped if its mode is the dev mock, the Practice
        // Tool, or a Tutorial — none are real matches and must never reach the user's history.
        let payload = |mode: &str| {
            format!(
                r#"{{ "activePlayer": {{ "riotIdGameName": "Me" }},
                      "allPlayers": [ {{ "championName": "Ahri", "riotId": "Me#EUW", "team": "ORDER", "level": 9 }} ],
                      "gameData": {{ "gameMode": "{mode}", "gameTime": 900.0 }} }}"#
            )
        };
        for mode in ["DRAFTSMITHMOCK", "PRACTICETOOL", "TUTORIAL", "practicetool"] {
            let mut rec = MatchRecorder::default();
            rec.observe(&parse(&payload(mode)));
            assert!(
                !rec.is_worth_saving(),
                "{mode} must not be saved to match history"
            );
        }
        // A real matchmade mode of the same length is still recorded.
        let mut real = MatchRecorder::default();
        real.observe(&parse(&payload("CLASSIC")));
        assert!(real.is_worth_saving());
    }

    #[test]
    fn started_at_is_carried_into_the_record() {
        let mut rec = MatchRecorder::starting_at(111);
        rec.observe(&parse(&snapshot(120.0, "[]", 1, 2, "[]")));
        let record = rec.into_record(999, "v".into(), "p".into());
        assert_eq!(record.started_at, 111);
        assert_eq!(record.ended_at, 999);
    }

    #[test]
    fn identity_less_mirror_picks_get_distinct_keys() {
        // A payload where two players share a champion (a mirror pick) but carry no Riot ID or
        // summoner name must not collapse to one accumulator — the champion+team fallback keeps them
        // distinct so their timelines don't interleave.
        let data: AllGameData = serde_json::from_str(
            r#"{ "allPlayers": [
                { "championName": "Yasuo", "team": "ORDER" },
                { "championName": "Yasuo", "team": "CHAOS" }
            ] }"#,
        )
        .unwrap();
        let k0 = player_key(&data.all_players[0]);
        let k1 = player_key(&data.all_players[1]);
        assert_ne!(k0, k1);
        assert_eq!(k0, "Yasuo#ORDER");
    }

    #[test]
    fn short_or_unidentified_games_are_not_worth_saving() {
        // Under the duration floor.
        let mut short = MatchRecorder::default();
        short.observe(&parse(&snapshot(30.0, "[]", 1, 1, "[]")));
        assert!(!short.is_worth_saving());

        // Past the floor with an identified local player → worth saving.
        let mut ok = MatchRecorder::default();
        ok.observe(&parse(&snapshot(120.0, "[]", 1, 2, "[]")));
        assert!(ok.is_worth_saving());

        // A spectated payload (no identifiable active player) is never worth saving.
        let mut spec = MatchRecorder::default();
        spec.observe(&parse(
            r#"{ "allPlayers": [ { "championName": "Ahri", "team": "ORDER" } ],
                 "gameData": { "gameTime": 900.0 } }"#,
        ));
        assert!(!spec.is_worth_saving());
    }
}
