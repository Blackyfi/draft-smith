use serde::{Deserialize, Serialize};

/// Lifecycle status of the Data Dragon layer, emitted to the frontend as the `ddragon-status`
/// event (PROJECT_SPEC §4.2).
///
/// Mirrors `DdragonStatus` in `src/types.ts` (serde `kebab-case`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DdragonStatus {
    /// Checking `versions.json` for the latest patch.
    Checking,
    /// A new patch was found; downloading item/champion data to the disk cache.
    Updating,
    /// Data is loaded and ready (from a fresh download or an up-to-date cache).
    Ready,
    /// DDragon is unreachable. Either serving stale cached data, or (no cache) degraded.
    Offline,
}
