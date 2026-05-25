//! Tauri-managed application state.

use crate::ddragon::ResolvedData;
use std::path::PathBuf;
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
