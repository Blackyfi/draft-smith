//! Pure gank-window evaluator (PROJECT_SPEC §6.4 advisory alerts; the data-driven invariant).
//!
//! This is a PREDICTION, never map vision: the app cannot and must not see the map. Given the
//! enemy jungler's champion gank-style (data, from `rules/data/jungle_timings.json`), live level,
//! and the game clock, it decides whether to fire one of two one-shot alerts per game. It is a
//! pure function — no I/O, no clock, no RNG — so `game_time` and `level` are passed in and it is
//! exhaustively unit-tested. It reasons only over the abstract [`GankStyle`] enum, never a
//! champion name, so adding a jungler is a data edit, not a code change.

use crate::model::gank::{GankAlert, GankAlertKind, GankStyle};

/// Per-game tracker so each alert fires at most once. Reset to default when a game ends so a new
/// game re-arms both windows.
#[derive(Debug, Default)]
pub struct GankAlertState {
    pub first_fired: bool,
    pub six_fired: bool,
}

/// Returns at most one alert to fire this tick — the highest-priority not-yet-fired window whose
/// condition is met — mutating `state` to mark it fired. First-gank takes priority over the
/// level-6 spike within a single call. Pure: `level` and `game_time` are passed in.
pub fn evaluate(
    jungler: &str,
    style: GankStyle,
    level: u32,
    game_time: f64,
    state: &mut GankAlertState,
) -> Option<GankAlert> {
    // First-gank window: timing depends on the champion's gank-style. A farmer has no early gank
    // — its first real threat IS the level-6 ultimate.
    let first_gank_ready = match style {
        GankStyle::Early => level >= 3 && game_time >= 150.0,
        GankStyle::Standard => level >= 4 && game_time >= 190.0,
        GankStyle::Farming => level >= 6,
    };

    if !state.first_fired && first_gank_ready {
        state.first_fired = true;
        // Coalesce with the level-6 spike when the ult is already up: a farmer's first window IS
        // level 6, and if we first observe any jungler already at level ≥6 (e.g. the app launched
        // mid-game) the ult alert would be a redundant catch-up for a window long past. In both
        // cases mark six fired so we never double-alert.
        if style == GankStyle::Farming || level >= 6 {
            state.six_fired = true;
        }
        let message = match style {
            GankStyle::Early => "Early ganker — watch your lane.",
            GankStyle::Standard => "Jungler cleared — gank incoming.",
            GankStyle::Farming => "Power spike — ult online, real gank threat now.",
        };
        return Some(GankAlert {
            jungler: jungler.to_string(),
            kind: GankAlertKind::FirstGank,
            style,
            message: message.to_string(),
        });
    }

    if !state.six_fired && level >= 6 {
        state.six_fired = true;
        return Some(GankAlert {
            jungler: jungler.to_string(),
            kind: GankAlertKind::Ultimate,
            style,
            message: "Level 6 — ultimate online.".to_string(),
        });
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn early_fires_first_gank_then_ultimate() {
        let mut state = GankAlertState::default();
        // Level 3 at 2:30 — early ganker's first window.
        let first = evaluate("LeeSin", GankStyle::Early, 3, 150.0, &mut state)
            .expect("early ganker fires at lvl3/2:30");
        assert_eq!(first.kind, GankAlertKind::FirstGank);
        assert_eq!(first.style, GankStyle::Early);
        assert!(state.first_fired);
        assert!(!state.six_fired, "early's six window is still armed");

        // Later, level 6 — the ultimate spike fires as a distinct second alert.
        let six = evaluate("LeeSin", GankStyle::Early, 6, 360.0, &mut state)
            .expect("ultimate fires at lvl6");
        assert_eq!(six.kind, GankAlertKind::Ultimate);
        assert!(state.six_fired);
    }

    #[test]
    fn standard_fires_at_level_four() {
        let mut state = GankAlertState::default();
        // Below threshold: lvl3 / 3:10 is not enough for a standard jungler.
        assert!(evaluate("Sejuani", GankStyle::Standard, 3, 190.0, &mut state).is_none());
        assert!(evaluate("Sejuani", GankStyle::Standard, 4, 180.0, &mut state).is_none());
        // Both conditions met.
        let alert = evaluate("Sejuani", GankStyle::Standard, 4, 190.0, &mut state)
            .expect("standard fires at lvl4/3:10");
        assert_eq!(alert.kind, GankAlertKind::FirstGank);
        assert_eq!(alert.style, GankStyle::Standard);
    }

    #[test]
    fn farming_fires_one_alert_at_level_six() {
        let mut state = GankAlertState::default();
        // No early window: below level 6 the farmer is silent regardless of clock.
        assert!(evaluate("Karthus", GankStyle::Farming, 5, 600.0, &mut state).is_none());
        assert!(!state.first_fired);

        let alert = evaluate("Karthus", GankStyle::Farming, 6, 480.0, &mut state)
            .expect("farmer fires at lvl6");
        assert_eq!(alert.kind, GankAlertKind::FirstGank);
        assert!(
            state.first_fired && state.six_fired,
            "both windows consumed at once"
        );

        // Never a separate Ultimate alert afterward.
        assert!(evaluate("Karthus", GankStyle::Farming, 7, 540.0, &mut state).is_none());
    }

    #[test]
    fn mid_game_launch_past_level_six_fires_only_once() {
        // App launched (or jungler first seen) when a standard jungler is already level 6+: the
        // first-gank alert fires once and the now-redundant ultimate catch-up is suppressed.
        let mut state = GankAlertState::default();
        let alert = evaluate("Sejuani", GankStyle::Standard, 6, 600.0, &mut state)
            .expect("first-gank fires on first observation");
        assert_eq!(alert.kind, GankAlertKind::FirstGank);
        assert!(
            state.first_fired && state.six_fired,
            "ult window coalesced when already level 6"
        );
        assert!(
            evaluate("Sejuani", GankStyle::Standard, 7, 660.0, &mut state).is_none(),
            "no redundant ultimate alert for a window already past"
        );
    }

    #[test]
    fn below_threshold_returns_none() {
        let mut state = GankAlertState::default();
        // Early ganker, level met but clock too soon, and vice versa.
        assert!(evaluate("Elise", GankStyle::Early, 3, 149.0, &mut state).is_none());
        assert!(evaluate("Elise", GankStyle::Early, 2, 200.0, &mut state).is_none());
        assert!(!state.first_fired);
    }

    #[test]
    fn nothing_fires_twice() {
        let mut state = GankAlertState::default();
        assert!(evaluate("LeeSin", GankStyle::Early, 3, 150.0, &mut state).is_some());
        // Same conditions again — already fired, so silent.
        assert!(evaluate("LeeSin", GankStyle::Early, 3, 150.0, &mut state).is_none());
        // The ultimate fires once at level 6...
        assert!(evaluate("LeeSin", GankStyle::Early, 6, 360.0, &mut state).is_some());
        // ...and never again.
        assert!(evaluate("LeeSin", GankStyle::Early, 7, 400.0, &mut state).is_none());
    }
}
