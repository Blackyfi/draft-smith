//! User-facing application settings (PROJECT_SPEC §6.6).
//!
//! This is the typed FE↔Rust contract for the `get_settings` / `set_settings` commands; it is
//! mirrored exactly in `src/types.ts`. Like the rest of `model/`, it is generic — it carries no
//! champion/item knowledge and has no bearing on the data-driven engine invariant.

use serde::{Deserialize, Serialize};

/// Poll cadence bounds (seconds). PROJECT_SPEC §3.1 / §6.6 allow 2–5 s; values are clamped to this
/// range on the way in so a hand-edited `settings.json` can never push the poller out of spec.
pub const MIN_POLL_INTERVAL_SECS: u8 = 2;
pub const MAX_POLL_INTERVAL_SECS: u8 = 5;
pub const DEFAULT_POLL_INTERVAL_SECS: u8 = 3;

/// Default Data Dragon locale. Discovery/version/icons are locale-agnostic; only the item/champion
/// text blobs vary by locale (PROJECT_SPEC §3.2).
pub const DEFAULT_LOCALE: &str = "en_US";

/// Active color theme. Dark-first per PROJECT_SPEC §6.1; applied on the frontend (`<html>` class).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Theme {
    Dark,
    Light,
}

/// Recommendation aggressiveness (PROJECT_SPEC §5.3, §6.6). `RulesOnly` is the only behavior that
/// ships in v1 (Tier A); `StatsBiased` is the Tier B prior, reserved for M7 — persisted but inert,
/// and surfaced as disabled in the UI until then.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Aggressiveness {
    RulesOnly,
    StatsBiased,
}

/// Rank cohort for the Tier B "Meta" build panel (PROJECT_SPEC §3.5, sourced from u.gg). Default
/// Diamond+. Wire values are snake_case so they pass straight through as the `get_meta_build` rank
/// argument and match u.gg's rank buckets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Rank {
    Challenger,
    MasterPlus,
    #[default]
    DiamondPlus,
    EmeraldPlus,
    PlatinumPlus,
}

/// Keyboard layout for displaying ability keys in the skill-order coach. The Live Client never
/// exposes a player's custom binds, so this is a pure display choice (slot → letter).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum KeyLayout {
    /// Q W E R (default).
    Qwerty,
    /// A Z E R (AZERTY ability row).
    Azerty,
    /// User-defined letters from `AbilityKeys::custom`.
    Custom,
}

/// In-game movement scheme, which changes how the Q/W ability slots are pressed.
///
/// - `Mouse` (default): classic right-click-to-move. Abilities are cast with the [`KeyLayout`]
///   letters (Q W E R / A Z E R / custom).
/// - `Keyboard`: League's "Keyboard (WASD) Input" mode. Movement is on W A S D, so the **Q ability
///   moves to the right mouse button** and the **W ability moves to Left Shift**; E and R stay on
///   their layout keys (the same physical keys, including on AZERTY). The display reflects this.
///
/// This is a pure display choice — the Live Client never exposes the player's control scheme.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum MovementMode {
    /// Right-click to move; abilities on the layout letters (default).
    #[default]
    Mouse,
    /// Keyboard (WASD) movement; Q → right-click, W → Left Shift, E/R unchanged.
    Keyboard,
}

/// How ability slots (Q/W/E/R) are labeled in the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AbilityKeys {
    pub layout: KeyLayout,
    /// Display letters for slots `[Q, W, E, R]`, used only when `layout == Custom`.
    pub custom: [String; 4],
    /// In-game movement scheme; remaps the Q/W slot labels in `Keyboard` (WASD) mode. Defaults to
    /// `Mouse` so a `settings.json` written before this field existed still loads.
    #[serde(default)]
    pub movement_mode: MovementMode,
}

impl Default for AbilityKeys {
    fn default() -> Self {
        Self {
            layout: KeyLayout::Qwerty,
            custom: ["Q".into(), "W".into(), "E".into(), "R".into()],
            movement_mode: MovementMode::Mouse,
        }
    }
}

/// User settings. Persisted to `app_data_dir/settings.json`; defaults are used when the file is
/// absent or unreadable so the app always has a valid configuration (never panics on bad data).
///
/// Mirrors `Settings` in `src/types.ts` — keep both sides in sync (PROJECT_SPEC §4.2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// Live Client poll cadence in seconds, clamped to [`MIN_POLL_INTERVAL_SECS`]..=[`MAX_POLL_INTERVAL_SECS`].
    pub poll_interval_secs: u8,
    pub theme: Theme,
    /// Whether the main window stays above other windows.
    pub always_on_top: bool,
    /// Data Dragon text locale (e.g. "en_US", "fr_FR"). Changing it triggers a re-download.
    pub locale: String,
    pub aggressiveness: Aggressiveness,
    /// How ability keys are displayed in the skill-order coach (display-only).
    #[serde(default)]
    pub ability_keys: AbilityKeys,
    /// Rank cohort for the Tier B "Meta" build panel (PROJECT_SPEC §3.5). Default Diamond+.
    #[serde(default)]
    pub meta_rank: Rank,
    /// Whether the Tier B "Meta" panel is shown beside the Tier A recommendation. Default on.
    #[serde(default = "default_show_meta_panel")]
    pub show_meta_panel: bool,
    /// Whether the transient enemy-jungler gank-window alert is emitted. Default on. (Advisory
    /// prediction from champion gank-style + level + clock — never map vision.)
    #[serde(default = "default_true")]
    pub gank_alerts_enabled: bool,
    /// Whether the gank-window alert plays a sound. Default on.
    #[serde(default = "default_true")]
    pub gank_alert_sound: bool,
}

/// `#[serde(default)]` for a `bool` would yield `false`; the Meta panel ships on by default, so an
/// upgrading user whose `settings.json` predates this field still sees it.
fn default_show_meta_panel() -> bool {
    true
}

/// Shared default for the gank-alert bool toggles, which ship on so an upgrading user whose
/// `settings.json` predates these fields still gets the alerts.
fn default_true() -> bool {
    true
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            poll_interval_secs: DEFAULT_POLL_INTERVAL_SECS,
            theme: Theme::Dark,
            always_on_top: false,
            locale: DEFAULT_LOCALE.to_string(),
            aggressiveness: Aggressiveness::RulesOnly,
            ability_keys: AbilityKeys::default(),
            meta_rank: Rank::default(),
            show_meta_panel: true,
            gank_alerts_enabled: true,
            gank_alert_sound: true,
        }
    }
}

impl Settings {
    /// Returns a copy with every field forced into a valid range, so neither a hand-edited
    /// `settings.json` nor a buggy client can drive the app out of spec. Currently clamps the poll
    /// interval and falls back to the default locale if blank.
    pub fn sanitized(&self) -> Self {
        let mut out = self.clone();
        out.poll_interval_secs = out
            .poll_interval_secs
            .clamp(MIN_POLL_INTERVAL_SECS, MAX_POLL_INTERVAL_SECS);
        if out.locale.trim().is_empty() {
            out.locale = DEFAULT_LOCALE.to_string();
        }
        // Custom ability-key letters: trim, uppercase, and fall back to the default Q/W/E/R letter
        // for any blank slot, so a hand-edited settings file can't blank the badges.
        const DEFAULTS: [&str; 4] = ["Q", "W", "E", "R"];
        for (slot, letter) in out.ability_keys.custom.iter_mut().enumerate() {
            let trimmed = letter.trim().to_uppercase();
            *letter = if trimmed.is_empty() {
                DEFAULTS[slot].to_string()
            } else {
                trimmed
            };
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_in_spec() {
        let s = Settings::default();
        assert_eq!(s.poll_interval_secs, DEFAULT_POLL_INTERVAL_SECS);
        assert!((MIN_POLL_INTERVAL_SECS..=MAX_POLL_INTERVAL_SECS).contains(&s.poll_interval_secs));
        assert_eq!(s.theme, Theme::Dark); // dark-first (§6.1)
        assert_eq!(s.locale, DEFAULT_LOCALE);
    }

    #[test]
    fn sanitize_clamps_poll_interval() {
        let too_fast = Settings {
            poll_interval_secs: 0,
            ..Default::default()
        };
        assert_eq!(
            too_fast.sanitized().poll_interval_secs,
            MIN_POLL_INTERVAL_SECS
        );
        let too_slow = Settings {
            poll_interval_secs: 60,
            ..Default::default()
        };
        assert_eq!(
            too_slow.sanitized().poll_interval_secs,
            MAX_POLL_INTERVAL_SECS
        );
    }

    #[test]
    fn sanitize_restores_blank_locale() {
        let blank = Settings {
            locale: "  ".into(),
            ..Default::default()
        };
        assert_eq!(blank.sanitized().locale, DEFAULT_LOCALE);
    }

    #[test]
    fn round_trips_through_json_in_camel_case() {
        // The camelCase wire format is the FE↔Rust contract; src/types.ts depends on it.
        let s = Settings::default();
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"pollIntervalSecs\""));
        assert!(json.contains("\"alwaysOnTop\""));
        assert!(json.contains("\"rules-only\"")); // aggressiveness enum is kebab-case
        assert!(json.contains("\"metaRank\":\"diamond_plus\"")); // Tier B rank (§3.5)
        assert!(json.contains("\"showMetaPanel\":true"));
        assert!(json.contains("\"gankAlertsEnabled\":true"));
        assert!(json.contains("\"gankAlertSound\":true"));
        let back: Settings = serde_json::from_str(&json).unwrap();
        assert_eq!(s, back);
    }

    #[test]
    fn ability_keys_default_to_mouse_movement() {
        // A settings.json (or abilityKeys blob) written before movementMode existed must still
        // load, defaulting to classic right-click-to-move so Q/W labels stay on the layout letters.
        let legacy = r#"{"layout":"qwerty","custom":["Q","W","E","R"]}"#;
        let keys: AbilityKeys = serde_json::from_str(legacy).unwrap();
        assert_eq!(keys.movement_mode, MovementMode::Mouse);

        // And it round-trips on the kebab-case wire format the FE expects.
        let json = serde_json::to_string(&AbilityKeys::default()).unwrap();
        assert!(json.contains("\"movementMode\":\"mouse\""));
        let keyboard = AbilityKeys {
            movement_mode: MovementMode::Keyboard,
            ..Default::default()
        };
        let json = serde_json::to_string(&keyboard).unwrap();
        assert!(json.contains("\"movementMode\":\"keyboard\""));
    }

    #[test]
    fn meta_fields_default_when_absent() {
        // A settings.json written before the Tier B fields existed must still load, with the
        // Meta panel defaulting on and Diamond+.
        let legacy = r#"{"pollIntervalSecs":3,"theme":"dark","alwaysOnTop":false,
            "locale":"en_US","aggressiveness":"rules-only"}"#;
        let s: Settings = serde_json::from_str(legacy).unwrap();
        assert_eq!(s.meta_rank, Rank::DiamondPlus);
        assert!(s.show_meta_panel);
        // The gank-alert toggles also predate this legacy file and must default on.
        assert!(s.gank_alerts_enabled);
        assert!(s.gank_alert_sound);
    }
}
