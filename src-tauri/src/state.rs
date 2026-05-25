//! Tauri-managed application state.

use crate::ddragon::ResolvedData;
use crate::live_client::AllGameData;
use crate::model::{ConnectionStatus, Recommendation};
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
