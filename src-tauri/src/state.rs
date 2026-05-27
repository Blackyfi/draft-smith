//! Tauri-managed application state.

use crate::ddragon::ResolvedData;
use crate::live_client::AllGameData;
use crate::model::{ConnectionStatus, Recommendation, Settings};
use std::path::PathBuf;
use std::sync::Mutex;
use tokio::sync::RwLock;

/// In-memory DDragon data plus the on-disk cache location.
///
/// `data` is `None` until the startup bootstrap (or a `force_refresh_ddragon` call) populates it.
/// Reads take the read lock; the bootstrap takes the write lock briefly to swap in fresh data.
pub struct DdragonState {
    pub cache_root: PathBuf,
    pub data: RwLock<Option<ResolvedData>>,
}

impl DdragonState {
    pub fn new(cache_root: PathBuf) -> Self {
        Self {
            cache_root,
            data: RwLock::new(None),
        }
    }
}

/// Meta-build ("Tier B") layer state: the on-disk cache root for u.gg overview JSON.
///
/// Mirrors [`DdragonState`]: the cache root lives in the app-data dir alongside the DDragon cache.
/// The u.gg HTTP client is cheap to build per request (an `Arc` internally) and stateless, so it is
/// constructed on demand in the command rather than held here.
pub struct MetaState {
    pub cache_root: PathBuf,
}

impl MetaState {
    pub fn new(cache_root: PathBuf) -> Self {
        Self { cache_root }
    }
}

/// Live game state owned by the M2 poller.
///
/// `status` is the current [`ConnectionStatus`] (read by the `get_status` command); the poller
/// updates it and emits `connection-status` on transitions. `snapshot` holds the latest parsed
/// `/allgamedata`, populated while in-game and cleared when the game ends. A plain `Mutex` guards
/// the tiny status; the larger snapshot uses an async `RwLock` since the poller writes it from
/// async code. `recommendation` holds the latest engine output (the body of the most recent
/// `recommendation-updated` event), recomputed by the poller only when the game state changes and
/// served by the `get_current_recommendation` command; cleared when the game ends.
pub struct LiveState {
    pub status: Mutex<ConnectionStatus>,
    pub snapshot: RwLock<Option<AllGameData>>,
    pub recommendation: RwLock<Option<Recommendation>>,
}

impl Default for LiveState {
    fn default() -> Self {
        Self {
            status: Mutex::new(ConnectionStatus::NoGame),
            snapshot: RwLock::new(None),
            recommendation: RwLock::new(None),
        }
    }
}

/// User [`Settings`] plus the on-disk location they persist to (`app_data_dir/settings.json`).
///
/// The current value is read synchronously and very frequently (the poller reads the cadence every
/// iteration, the tray reads the pin state on toggle), so a plain `std::sync::Mutex` guards it: the
/// locks are tiny and never held across `.await`. The file is the source of truth across restarts;
/// the in-memory copy is updated on every `save` so reads never touch disk. Load degrades to
/// [`Settings::default`] on a missing or corrupt file — it never panics (PROJECT_SPEC §6.6).
pub struct SettingsState {
    path: PathBuf,
    settings: Mutex<Settings>,
}

impl SettingsState {
    /// Loads settings from `path`, falling back to defaults when the file is absent, unreadable, or
    /// corrupt (logging a warning, never panicking). The stored value is always [`Settings::sanitized`]
    /// so a hand-edited file can't drive the app out of spec.
    pub fn load(path: PathBuf) -> Self {
        let settings = match std::fs::read_to_string(&path) {
            Ok(raw) => match serde_json::from_str::<Settings>(&raw) {
                Ok(parsed) => parsed.sanitized(),
                Err(err) => {
                    log::warn!(
                        "settings: {} is corrupt ({err}); using defaults",
                        path.display()
                    );
                    Settings::default()
                }
            },
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Settings::default(),
            Err(err) => {
                log::warn!(
                    "settings: {} unreadable ({err}); using defaults",
                    path.display()
                );
                Settings::default()
            }
        };
        Self {
            path,
            settings: Mutex::new(settings),
        }
    }

    /// Returns a clone of the current in-memory settings.
    pub fn current(&self) -> Settings {
        self.settings
            .lock()
            .expect("settings mutex poisoned")
            .clone()
    }

    /// Persists `settings` to disk as pretty JSON (creating the parent dir as needed) and updates
    /// the in-memory copy. Callers should pass an already-[`Settings::sanitized`] value.
    pub fn save(&self, settings: &Settings) -> std::io::Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let json = serde_json::to_string_pretty(settings)
            .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))?;
        std::fs::write(&self.path, json)?;
        *self.settings.lock().expect("settings mutex poisoned") = settings.clone();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn load_defaults_when_missing() {
        let dir = tempdir().unwrap();
        let state = SettingsState::load(dir.path().join("settings.json"));
        assert_eq!(state.current(), Settings::default());
    }

    #[test]
    fn load_defaults_when_corrupt() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, b"{ not valid json ]").unwrap();
        let state = SettingsState::load(path);
        assert_eq!(state.current(), Settings::default());
    }

    #[test]
    fn save_then_load_round_trips() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("nested").join("settings.json");
        let custom = Settings {
            poll_interval_secs: crate::model::settings::MAX_POLL_INTERVAL_SECS,
            always_on_top: true,
            locale: "fr_FR".into(),
            ..Default::default()
        };

        let state = SettingsState::load(path.clone());
        state.save(&custom).unwrap();
        assert_eq!(state.current(), custom);

        // A fresh load reads the same value back from disk (parent dir was created).
        let reloaded = SettingsState::load(path);
        assert_eq!(reloaded.current(), custom);
    }

    #[test]
    fn load_sanitizes_out_of_spec_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("settings.json");
        // poll interval 99 is out of spec; a blank locale should fall back to the default.
        std::fs::write(
            &path,
            br#"{"pollIntervalSecs":99,"theme":"dark","alwaysOnTop":false,"locale":"  ","aggressiveness":"rules-only"}"#,
        )
        .unwrap();
        let state = SettingsState::load(path);
        let s = state.current();
        assert_eq!(
            s.poll_interval_secs,
            crate::model::settings::MAX_POLL_INTERVAL_SECS
        );
        assert_eq!(s.locale, crate::model::settings::DEFAULT_LOCALE);
    }
}
