//! The Live Client poller (PROJECT_SPEC §3.1, §4.2; M2): a tokio loop that polls `/allgamedata`
//! every few seconds, drives the `connection-status` lifecycle, and — only when the game state
//! *meaningfully* changes — stashes the snapshot and emits `game-state-changed`.
//!
//! ### Diffing (don't recompute on noise)
//! `gameTime` advances every poll and gold ticks up passively, so naively diffing the whole
//! payload would fire constantly. We compare a [`StateSignature`] built only from inputs that move
//! the recommendation: the roster, each player's level, and their owned items. Gold and the clock
//! are excluded by construction. M3/M4 hang the actual recompute off this same change signal.

mod gank;

use crate::engine::input::ResolvedDefenses;
use crate::engine::{self, EngineInput};
use crate::history::model::MatchSummary;
use crate::history::MatchRecorder;
use crate::live_client::model::AllGameData;
use crate::live_client::LiveClient;
use crate::model::settings::{MAX_POLL_INTERVAL_SECS, MIN_POLL_INTERVAL_SECS};
use crate::model::{ConnectionStatus, GameStateSummary, GankAlert, Recommendation};
use crate::rules::RuleSet;
use crate::state::{DdragonState, HistoryState, LiveState, SettingsState};
use crate::tray;
use gank::GankAlertState;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Default poll cadence. PROJECT_SPEC §3.1 allows 2–5 s (configurable in M5 settings); 3 s is a
/// balanced default.
pub const DEFAULT_POLL_INTERVAL: Duration = Duration::from_secs(3);

/// A fingerprint of the game state used to decide whether anything worth recomputing changed.
/// Built only from purchase/level/roster signals — never from gold or the clock (see module docs).
#[derive(Debug, Clone, PartialEq, Eq)]
struct StateSignature {
    players: Vec<PlayerSignature>,
    /// Active player's ability ranks (Q, W, E, R). Player level already lives in `players`, but
    /// *spending* a skill point changes only this — track it so the skill-order advice re-computes.
    abilities: (u32, u32, u32, u32),
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct PlayerSignature {
    champion: String,
    team: String,
    level: u32,
    /// `(item_id, count)` pairs, sorted so slot reordering alone isn't a "change".
    items: Vec<(u32, u32)>,
}

impl StateSignature {
    fn from_data(data: &AllGameData) -> Self {
        let players = data
            .all_players
            .iter()
            .map(|p| {
                let mut items: Vec<(u32, u32)> =
                    p.items.iter().map(|i| (i.item_id, i.count)).collect();
                items.sort_unstable();
                PlayerSignature {
                    champion: p.champion_name.clone(),
                    team: p.team.clone(),
                    level: p.level,
                    items,
                }
            })
            .collect();
        let abilities = data
            .active_player
            .as_ref()
            .map(|a| {
                let ab = &a.abilities;
                (
                    ab.q.ability_level,
                    ab.w.ability_level,
                    ab.e.ability_level,
                    ab.r.ability_level,
                )
            })
            .unwrap_or_default();
        Self { players, abilities }
    }
}

fn summarize(data: &AllGameData) -> GameStateSummary {
    GameStateSummary {
        game_time: data.game_data.game_time,
        game_mode: data.game_data.game_mode.clone(),
        self_champion: data.self_champion().map(str::to_owned),
        player_count: data.all_players.len(),
    }
}

/// Finds the enemy jungler and runs the pure gank evaluator against it, returning any alert to
/// fire this tick. The jungler is identified by Smite (the only Riot-sanctioned role signal we
/// have), falling back to a `JUNGLE` position. Champion gank-style comes from the data-driven rule
/// set — no champion name is branched on here.
fn detect_gank(
    data: &AllGameData,
    rules: &RuleSet,
    gank_state: &mut GankAlertState,
) -> Option<GankAlert> {
    let enemies = data.enemies();
    let jungler = enemies
        .iter()
        .find(|p| p.has_smite())
        .or_else(|| enemies.iter().find(|p| p.position == "JUNGLE"))?;
    let style = rules.gank_style(&jungler.champion_name);
    gank::evaluate(
        &jungler.champion_name,
        style,
        jungler.level,
        data.game_data.game_time,
        gank_state,
    )
}

/// An effect the poller wants to surface to the frontend. `run_loop` maps these onto Tauri
/// events; keeping them as a plain enum is what lets [`poll_once`] be tested without a Tauri app
/// (the `test` runtime won't link on Windows).
#[derive(Debug, Clone, PartialEq)]
enum PollEvent {
    /// `connection-status` — emitted only when the status actually changes.
    ConnectionStatus(ConnectionStatus),
    /// `game-state-changed` — emitted when the diff signature changes.
    GameStateChanged(GameStateSummary),
    /// `recommendation-updated` — emitted alongside a state change once the engine recomputes.
    RecommendationUpdated(Recommendation),
    /// `gank-alert` — a transient one-shot enemy-jungler gank-window prediction. Fired off the
    /// per-poll gank evaluator (not the diff branch), since a pure time threshold can be crossed
    /// with no roster/level change.
    GankAlert(GankAlert),
    /// `match-saved` — fired once when a finished game's record is flushed to disk, so the history
    /// list can refresh while the window is open. Carries the new match's summary.
    MatchSaved(MatchSummary),
}

/// Spawns the poll loop on the async runtime. Returns immediately; the loop runs for the life of
/// the app. Startup must never block on this (mirrors the DDragon bootstrap in `lib.rs`).
pub fn spawn<R: Runtime>(app: AppHandle<R>) {
    let client = match LiveClient::new() {
        Ok(client) => client,
        Err(err) => {
            // Without a client we can't poll at all; report a hard error and stop.
            log::error!("Live Client init failed: {err}");
            *app.state::<LiveState>()
                .status
                .lock()
                .expect("status mutex poisoned") = ConnectionStatus::Error;
            let _ = app.emit("connection-status", ConnectionStatus::Error);
            return;
        }
    };
    tauri::async_runtime::spawn(run_loop(app, client));
}

/// Reads the configured poll cadence from [`SettingsState`], clamped to the in-spec range. Falls
/// back to [`DEFAULT_POLL_INTERVAL`] if settings aren't managed yet (shouldn't happen in
/// production, where settings are registered before the poller spawns).
fn poll_interval<R: Runtime>(app: &AppHandle<R>) -> Duration {
    app.try_state::<SettingsState>()
        .map(|s| {
            let secs = s
                .current()
                .poll_interval_secs
                .clamp(MIN_POLL_INTERVAL_SECS, MAX_POLL_INTERVAL_SECS);
            Duration::from_secs(u64::from(secs))
        })
        .unwrap_or(DEFAULT_POLL_INTERVAL)
}

/// Loads the embedded engine rule set once for the poller. A parse failure (only possible from a
/// bad edit to the bundled JSON) disables recommendations but never stops polling — the connection
/// and game-state surface keep working.
fn load_rules() -> Option<RuleSet> {
    match RuleSet::load() {
        Ok(rules) => Some(rules),
        Err(err) => {
            log::error!("engine rule set failed to load; recommendations disabled: {err}");
            None
        }
    }
}

/// The poll loop: probe, react, sleep, forever. The per-iteration work lives in [`poll_once`],
/// which is decoupled from Tauri (operates on `&LiveState` + an emit sink) so it can be driven in
/// tests against a mock server without the infinite loop or a Tauri runtime.
async fn run_loop<R: Runtime>(app: AppHandle<R>, client: LiveClient) {
    let state = app.state::<LiveState>();
    let rules = load_rules();
    // The installed app version, stamped into every saved match record (read once; immutable).
    let app_version = app.package_info().version.to_string();
    let mut emit = |event: PollEvent| match event {
        PollEvent::ConnectionStatus(status) => {
            // Reflect the status in the tray tooltip (PROJECT_SPEC §6.2), then notify the FE.
            tray::set_status(&app, status);
            let _ = app.emit("connection-status", status);
        }
        PollEvent::GameStateChanged(summary) => {
            let _ = app.emit("game-state-changed", &summary);
        }
        PollEvent::RecommendationUpdated(rec) => {
            let _ = app.emit("recommendation-updated", &rec);
        }
        PollEvent::GankAlert(alert) => {
            let _ = app.emit("gank-alert", &alert);
        }
        PollEvent::MatchSaved(summary) => {
            let _ = app.emit("match-saved", &summary);
        }
    };

    // Announce we're attempting to connect before the first probe.
    transition(&state, ConnectionStatus::Connecting, &mut emit);
    let mut last_signature: Option<StateSignature> = None;
    // One-shot gank-alert tracker for the current game; reset on the no-game branch so a new game
    // re-arms both windows.
    let mut gank_state = GankAlertState::default();

    loop {
        // Read the gank-alert toggle live each iteration so a settings change takes effect at once.
        let gank_enabled = app
            .try_state::<SettingsState>()
            .map(|s| s.current().gank_alerts_enabled)
            .unwrap_or(true);
        poll_once(
            &client,
            &state,
            rules.as_ref(),
            Some(&*app.state::<DdragonState>()),
            Some(&*app.state::<HistoryState>()),
            &app_version,
            &mut last_signature,
            gank_enabled,
            &mut gank_state,
            &mut emit,
        )
        .await;
        // Read the cadence live each iteration so a settings change takes effect without a restart.
        tokio::time::sleep(poll_interval(&app)).await;
    }
}

/// One poll iteration. Fetches `/allgamedata`, updates the shared status (emitting
/// `connection-status` only on a transition), and — on a meaningful state change — stashes the
/// snapshot and emits `game-state-changed`. Leaving a game clears the snapshot and signature so a
/// later game starts clean. Effects flow through [`LiveState`] and the `emit` sink; nothing is
/// returned. No Tauri coupling, so tests can drive it directly.
#[allow(clippy::too_many_arguments)]
async fn poll_once(
    client: &LiveClient,
    state: &LiveState,
    rules: Option<&RuleSet>,
    ddragon: Option<&DdragonState>,
    history: Option<&HistoryState>,
    app_version: &str,
    last_signature: &mut Option<StateSignature>,
    gank_enabled: bool,
    gank_state: &mut GankAlertState,
    // `+ Send`: the loop future is spawned on the async runtime, which requires `Send`, and this
    // reference is held across the `.await` below.
    emit: &mut (dyn FnMut(PollEvent) + Send),
) {
    match client.all_game_data().await {
        Ok(data) => {
            transition(state, ConnectionStatus::InGame, emit);
            // Record the match (Part A). Feed EVERY in-game poll — not just the diff branch — so the
            // duration, event feed, and any between-diff item/level changes are all captured. The
            // recorder is idempotent on unchanged input, clockless, and IO-free; the lock is brief
            // and never held across an `.await`.
            {
                let mut guard = state.recorder.lock().expect("recorder mutex poisoned");
                // Stamp the start wall-clock once, when the recorder is first created for this game.
                guard
                    .get_or_insert_with(|| MatchRecorder::starting_at(now_unix_ms()))
                    .observe(&data);
            }
            // Gank detection runs EVERY poll (not just on the diff branch): a pure time threshold
            // can be crossed without any roster/level change. Skipped if disabled or rules are
            // unavailable (gank-style is data-driven).
            if gank_enabled {
                if let Some(rules) = rules {
                    if let Some(alert) = detect_gank(&data, rules, gank_state) {
                        emit(PollEvent::GankAlert(alert));
                    }
                }
            }
            let signature = StateSignature::from_data(&data);
            let changed = last_signature.as_ref() != Some(&signature);
            if changed {
                *last_signature = Some(signature);
                emit(PollEvent::GameStateChanged(summarize(&data)));
                // Recompute only on a meaningful change (PROJECT_SPEC §5.2 step 7). Skipped if the
                // rule set failed to load or the local player isn't identifiable yet.
                if let Some((rules, mut input)) = rules
                    .and_then(|rules| EngineInput::from_all_game_data(&data).map(|i| (rules, i)))
                {
                    // Resolve enemy defenses from DDragon and inject them so the engine can estimate
                    // durability. Done only here on the `changed` branch (not per poll), and only
                    // when DDragon data is present — the no-DDragon path leaves defenses `None`.
                    if let Some(ddragon) = ddragon {
                        if let Some(resolved) = ddragon.data.read().await.clone() {
                            for enemy in &mut input.enemies {
                                if let Some((hp, armor, mr)) = crate::ddragon::enemy_defenses(
                                    &enemy.champion,
                                    enemy.level,
                                    &enemy.items,
                                    &resolved,
                                ) {
                                    enemy.defenses = Some(ResolvedDefenses { hp, armor, mr });
                                }
                            }
                        }
                    }
                    let rec = engine::recommend(&input, rules);
                    *state.recommendation.write().await = Some(rec.clone());
                    emit(PollEvent::RecommendationUpdated(rec));
                }
            }
            *state.snapshot.write().await = Some(data);
        }
        Err(err) if err.is_no_game() => {
            transition(state, ConnectionStatus::NoGame, emit);
            // Leaving a game flushes the recorded match to disk (Part A) before clearing live state.
            flush_recorder(state, history, ddragon, app_version, emit).await;
            // Leaving a game invalidates the last snapshot/signature/recommendation, and re-arms
            // the one-shot gank alerts for the next game.
            *last_signature = None;
            *gank_state = GankAlertState::default();
            *state.snapshot.write().await = None;
            *state.recommendation.write().await = None;
        }
        Err(err) => {
            log::warn!("Live Client poll failed: {err}");
            transition(state, ConnectionStatus::Error, emit);
        }
    }
}

/// Current wall-clock time as Unix epoch milliseconds (0 if the clock is before the epoch). Used to
/// stamp a recorded match's start/end; the recorder itself never reads the clock.
fn now_unix_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Takes the in-flight match recorder and, if it holds a game worth keeping, flushes it to disk and
/// emits `match-saved` (Part A). Always clears the recorder so the next game starts clean — even
/// when there's nothing to save, no history state (tests), or the write fails.
///
/// The wall-clock timestamp is read here (the poller, not the pure recorder); the patch comes from
/// the loaded DDragon data, and the app version is passed in from the loop.
async fn flush_recorder(
    state: &LiveState,
    history: Option<&HistoryState>,
    ddragon: Option<&DdragonState>,
    app_version: &str,
    emit: &mut (dyn FnMut(PollEvent) + Send),
) {
    // Take the recorder out under a brief sync lock (never held across an `.await`).
    let recorder = state
        .recorder
        .lock()
        .expect("recorder mutex poisoned")
        .take();

    let (Some(recorder), Some(history)) = (recorder, history) else {
        return;
    };
    if !recorder.is_worth_saving() {
        return;
    }

    // Patch the game was played on, from the loaded DDragon data (best-effort).
    let patch = match ddragon {
        Some(d) => d
            .data
            .read()
            .await
            .as_ref()
            .map(|data| data.version.clone())
            .unwrap_or_else(|| "unknown".to_string()),
        None => "unknown".to_string(),
    };
    let ended_at = now_unix_ms();
    let record = recorder.into_record(ended_at, app_version.to_string(), patch);
    let summary = record.summary();
    let store = history.store();
    // Persist off the async runtime (disk write), then surface the new entry to the FE.
    match tokio::task::spawn_blocking(move || store.save(&record)).await {
        Ok(Ok(())) => {
            log::info!(
                "match recorded: {} ({}, {:.0}s)",
                summary.id,
                summary.self_champion,
                summary.duration_seconds
            );
            emit(PollEvent::MatchSaved(summary));
        }
        Ok(Err(err)) => log::warn!("failed to save match {}: {err}", summary.id),
        Err(err) => log::warn!("match-save task failed: {err}"),
    }
}

/// Updates the shared status and emits `connection-status` **only on a transition**, so the FE
/// isn't spammed with identical statuses every poll.
fn transition(
    state: &LiveState,
    status: ConnectionStatus,
    emit: &mut (dyn FnMut(PollEvent) + Send),
) {
    // Decide whether to emit while holding the lock, but release it *before* calling `emit` — the
    // callback must never run under the status lock (a future emitter that touched `status` would
    // otherwise self-deadlock).
    let changed = {
        let mut current = state.status.lock().expect("status mutex poisoned");
        if *current != status {
            *current = status;
            true
        } else {
            false
        }
    };
    if changed {
        emit(PollEvent::ConnectionStatus(status));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(json: &str) -> AllGameData {
        serde_json::from_str(json).unwrap()
    }

    const FIXTURE: &str = include_str!("../live_client/fixtures/allgamedata.json");

    #[test]
    fn signature_ignores_gold_and_clock() {
        // Same roster/levels/items, different gameTime and currentGold → no change.
        let a = parse(FIXTURE);
        let mut b = parse(FIXTURE);
        b.game_data.game_time += 42.0;
        if let Some(active) = b.active_player.as_mut() {
            active.current_gold += 999.0;
        }
        assert_eq!(
            StateSignature::from_data(&a),
            StateSignature::from_data(&b),
            "gold/clock drift must not register as a change"
        );
    }

    #[test]
    fn signature_changes_when_an_enemy_buys_an_item() {
        let a = parse(FIXTURE);
        let mut b = parse(FIXTURE);
        // Enemy Zed picks up an item.
        b.all_players[5]
            .items
            .push(crate::live_client::model::Item {
                item_id: 3142,
                count: 1,
                slot: 2,
                display_name: "Youmuu's Ghostblade".into(),
            });
        assert_ne!(
            StateSignature::from_data(&a),
            StateSignature::from_data(&b),
            "a new purchase must register as a change"
        );
    }

    #[test]
    fn signature_changes_on_level_up() {
        let a = parse(FIXTURE);
        let mut b = parse(FIXTURE);
        b.all_players[0].level += 1;
        assert_ne!(StateSignature::from_data(&a), StateSignature::from_data(&b));
    }

    #[test]
    fn signature_ignores_item_slot_reordering() {
        let a = parse(FIXTURE);
        let mut b = parse(FIXTURE);
        b.all_players[0].items.reverse();
        for (i, item) in b.all_players[0].items.iter_mut().enumerate() {
            item.slot = i as u32;
        }
        assert_eq!(StateSignature::from_data(&a), StateSignature::from_data(&b));
    }

    #[test]
    fn summary_reports_self_champion_and_count() {
        let summary = summarize(&parse(FIXTURE));
        assert_eq!(summary.self_champion.as_deref(), Some("Ahri"));
        assert_eq!(summary.player_count, 10);
        assert_eq!(summary.game_mode, "CLASSIC");
    }

    // --- Loop-glue tests: drive `poll_once` against a mock server / dead port, exercising the
    // real status-transition, snapshot, and emit logic without Tauri (PROJECT_SPEC §9, M2). ---

    use crate::live_client::LiveClient;
    use crate::state::LiveState;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const ALL_GAME_DATA_PATH: &str = "/liveclientdata/allgamedata";

    async fn mock_in_game_server() -> MockServer {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path(ALL_GAME_DATA_PATH))
            .respond_with(ResponseTemplate::new(200).set_body_raw(FIXTURE, "application/json"))
            .mount(&server)
            .await;
        server
    }

    #[tokio::test]
    async fn poll_once_in_game_sets_status_stashes_snapshot_and_emits() {
        let server = mock_in_game_server().await;
        let state = LiveState::default();
        let client = LiveClient::with_base(server.uri()).unwrap();

        let rules = RuleSet::load().unwrap();
        let mut sig = None;
        let mut gank = GankAlertState::default();
        let mut events = Vec::new();
        poll_once(
            &client,
            &state,
            Some(&rules),
            None,
            None,
            "test",
            &mut sig,
            false,
            &mut gank,
            &mut |e| events.push(e),
        )
        .await;

        assert_eq!(*state.status.lock().unwrap(), ConnectionStatus::InGame);
        assert!(
            state.snapshot.read().await.is_some(),
            "snapshot populated while in-game"
        );
        assert!(
            state.recorder.lock().unwrap().is_some(),
            "match recorder initialized + fed on the first in-game poll"
        );
        assert!(
            sig.is_some(),
            "signature recorded after the first in-game poll"
        );
        // First in-game poll from the default NoGame status: a status transition + a summary.
        assert!(events
            .iter()
            .any(|e| matches!(e, PollEvent::ConnectionStatus(ConnectionStatus::InGame))));
        assert!(events
            .iter()
            .any(|e| matches!(e, PollEvent::GameStateChanged(_))));
        // ...and the engine recomputed: an event fired and the recommendation is cached for the
        // `get_current_recommendation` command (the Ahri fixture is fully authored).
        assert!(events
            .iter()
            .any(|e| matches!(e, PollEvent::RecommendationUpdated(_))));
        let rec = state.recommendation.read().await;
        assert_eq!(rec.as_ref().map(|r| r.self_champion.as_str()), Some("Ahri"));
    }

    #[tokio::test]
    async fn poll_once_no_game_clears_a_stale_snapshot() {
        let state = LiveState::default();
        // Pretend a game had been running: seed a snapshot + signature + recommendation.
        *state.snapshot.write().await = Some(parse(FIXTURE));
        *state.recommendation.write().await = Some(Recommendation {
            self_champion: "Ahri".into(),
            build_path: Vec::new(),
            swaps: Vec::new(),
            threats: Vec::new(),
            enemy_items: Vec::new(),
            focus: Vec::new(),
            skill: None,
            ability_ranks: Default::default(),
        });
        let mut sig = Some(StateSignature::from_data(&parse(FIXTURE)));

        // Nothing listening → connection refused → the benign "no game" path.
        let client = LiveClient::with_base("http://127.0.0.1:1").unwrap();
        // Pretend the previous game already fired both gank alerts; the no-game branch must re-arm.
        let mut gank = GankAlertState {
            first_fired: true,
            six_fired: true,
        };
        poll_once(
            &client,
            &state,
            None,
            None,
            None,
            "test",
            &mut sig,
            false,
            &mut gank,
            &mut |_| {},
        )
        .await;

        assert_eq!(*state.status.lock().unwrap(), ConnectionStatus::NoGame);
        assert!(
            state.snapshot.read().await.is_none(),
            "snapshot cleared when the game ends"
        );
        assert!(sig.is_none(), "signature reset when the game ends");
        assert!(
            state.recommendation.read().await.is_none(),
            "recommendation cleared when the game ends"
        );
        assert!(
            !gank.first_fired && !gank.six_fired,
            "gank alerts re-armed when the game ends"
        );
    }

    #[tokio::test]
    async fn poll_once_no_game_flushes_recorded_match() {
        use crate::history::model::MatchResult;
        use crate::state::HistoryState;
        use tempfile::tempdir;

        let dir = tempdir().unwrap();
        let history = HistoryState::new(dir.path().to_path_buf());
        let state = LiveState::default();

        // Seed the recorder as if a full game had been observed (past the 60s save floor).
        let snapshot = parse(
            r#"{
                "activePlayer": { "riotIdGameName": "Me", "level": 11,
                    "abilities": { "Q": { "abilityLevel": 5, "displayName": "Orb of Deception" } } },
                "allPlayers": [
                    { "championName": "Ahri", "riotId": "Me#EUW", "team": "ORDER", "level": 11,
                      "items": [ { "itemID": 6655, "count": 1, "slot": 0, "displayName": "Luden's" } ],
                      "scores": { "kills": 7, "deaths": 2, "assists": 9, "creepScore": 180 } },
                    { "championName": "Zed", "riotId": "Foe#EUW", "team": "CHAOS", "level": 11 }
                ],
                "events": { "Events": [
                    { "EventID": 1, "EventName": "GameEnd", "EventTime": 1500.0, "Result": "Win" } ] },
                "gameData": { "gameMode": "CLASSIC", "gameTime": 1500.0, "mapName": "Map11", "mapNumber": 11 }
            }"#,
        );
        {
            let mut rec = MatchRecorder::default();
            rec.observe(&snapshot);
            *state.recorder.lock().unwrap() = Some(rec);
        }

        // Dead port → benign no-game branch → flush the recorded match.
        let client = LiveClient::with_base("http://127.0.0.1:1").unwrap();
        let mut sig = None;
        let mut gank = GankAlertState::default();
        let mut events = Vec::new();
        poll_once(
            &client,
            &state,
            None,
            None,
            Some(&history),
            "0.1.13",
            &mut sig,
            false,
            &mut gank,
            &mut |e| events.push(e),
        )
        .await;

        assert!(
            state.recorder.lock().unwrap().is_none(),
            "recorder is taken + cleared after the flush"
        );
        let saved = history.store().list();
        assert_eq!(saved.len(), 1, "the finished game was written to disk");
        assert_eq!(saved[0].self_champion, "Ahri");
        assert_eq!(saved[0].result, MatchResult::Win);
        assert_eq!(saved[0].kills, 7);
        assert!(
            events.iter().any(|e| matches!(e, PollEvent::MatchSaved(_))),
            "match-saved is emitted for the new record"
        );
    }

    #[tokio::test]
    async fn poll_once_emits_gank_alert_for_smite_jungler_past_threshold() {
        // A synthetic in-game payload: we (Ahri, ORDER) plus an enemy Lee Sin jungler (CHAOS) with
        // Smite, at level 3 and 2:40 — past the early-ganker first-gank threshold.
        let body = r#"{
            "activePlayer": { "riotIdGameName": "Me" },
            "allPlayers": [
                { "championName": "Ahri", "riotId": "Me#EUW", "team": "ORDER" },
                { "championName": "LeeSin", "riotId": "Enemy#EUW", "team": "CHAOS", "level": 3,
                  "summonerSpells": {
                      "summonerSpellOne": { "displayName": "Flash" },
                      "summonerSpellTwo": { "displayName": "Smite" } } }
            ],
            "gameData": { "gameMode": "CLASSIC", "gameTime": 160.0 }
        }"#;
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path(ALL_GAME_DATA_PATH))
            .respond_with(ResponseTemplate::new(200).set_body_raw(body, "application/json"))
            .mount(&server)
            .await;

        let state = LiveState::default();
        let client = LiveClient::with_base(server.uri()).unwrap();
        let rules = RuleSet::load().unwrap();
        let mut sig = None;
        let mut gank = GankAlertState::default();
        let mut events = Vec::new();
        poll_once(
            &client,
            &state,
            Some(&rules),
            None,
            None,
            "test",
            &mut sig,
            true,
            &mut gank,
            &mut |e| events.push(e),
        )
        .await;

        let alert = events.iter().find_map(|e| match e {
            PollEvent::GankAlert(a) => Some(a),
            _ => None,
        });
        let alert = alert.expect("a gank alert fires for the Smite jungler past the threshold");
        assert_eq!(alert.jungler, "LeeSin");
        assert!(gank.first_fired, "the first-gank window is consumed");
    }

    #[tokio::test]
    async fn status_and_summary_emit_only_on_change() {
        let server = mock_in_game_server().await;
        let state = LiveState::default();
        let client = LiveClient::with_base(server.uri()).unwrap();

        let mut status_emits = 0;
        let mut summary_emits = 0;
        let mut sig = None;
        let mut gank = GankAlertState::default();
        {
            let mut count = |e: PollEvent| match e {
                PollEvent::ConnectionStatus(_) => status_emits += 1,
                PollEvent::GameStateChanged(_) => summary_emits += 1,
                PollEvent::RecommendationUpdated(_)
                | PollEvent::GankAlert(_)
                | PollEvent::MatchSaved(_) => {}
            };
            // Two identical in-game polls: status transitions once (NoGame→InGame), and the diff
            // signature is unchanged on the second poll, so the summary fires only once.
            poll_once(
                &client, &state, None, None, None, "test", &mut sig, false, &mut gank, &mut count,
            )
            .await;
            poll_once(
                &client, &state, None, None, None, "test", &mut sig, false, &mut gank, &mut count,
            )
            .await;
        }

        assert_eq!(
            status_emits, 1,
            "connection-status fires once per transition, not once per poll"
        );
        assert_eq!(
            summary_emits, 1,
            "game-state-changed fires only when the diff signature changes"
        );
    }
}
