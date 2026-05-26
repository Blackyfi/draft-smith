//! On-disk cache for u.gg overview JSON, one file per champion + patch.
//!
//! Layout under the cache root (alongside the DDragon cache in the app-data dir, a tempdir in
//! tests):
//!
//! ```text
//! <root>/
//!   overview/<patch>/<championKey>.json   # raw u.gg overview JSON
//! ```
//!
//! Keying the file by patch means a new patch can't serve a stale build: a different patch is a
//! different path, a cache miss, and a fresh fetch. All reads are tolerant — a missing/unreadable
//! file reads as "absent", never a panic.

use crate::meta::error::Result;
use std::fs;
use std::path::PathBuf;

/// Handle to the meta disk cache rooted at a directory.
#[derive(Debug, Clone)]
pub struct MetaCache {
    root: PathBuf,
}

impl MetaCache {
    /// Creates a cache handle. Does not touch the filesystem; directories are created lazily on write.
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// On-disk path for a champion's overview JSON on a given u.gg patch segment. The patch is part
    /// of the path, so freshness is structural: a new patch is a new (missing) file.
    fn overview_path(&self, ugg_patch: &str, champion_key: u32) -> PathBuf {
        self.root
            .join("overview")
            .join(ugg_patch)
            .join(format!("{champion_key}.json"))
    }

    /// Reads the cached overview JSON, or `None` on a cache miss / unreadable file.
    pub fn read_overview(&self, ugg_patch: &str, champion_key: u32) -> Option<Vec<u8>> {
        fs::read(self.overview_path(ugg_patch, champion_key)).ok()
    }

    /// True when a cached overview exists for this champion + patch (a warm-cache read does no I/O
    /// beyond this check).
    pub fn has_overview(&self, ugg_patch: &str, champion_key: u32) -> bool {
        self.overview_path(ugg_patch, champion_key).is_file()
    }

    /// Writes raw overview JSON to the cache, creating parent directories as needed.
    pub fn write_overview(&self, ugg_patch: &str, champion_key: u32, bytes: &[u8]) -> Result<()> {
        let path = self.overview_path(ugg_patch, champion_key);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(path, bytes)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn overview_round_trips_keyed_by_patch() {
        let dir = tempdir().unwrap();
        let cache = MetaCache::new(dir.path());
        assert!(!cache.has_overview("15_9", 103));
        assert_eq!(cache.read_overview("15_9", 103), None);

        cache
            .write_overview("15_9", 103, br#"{"hello":1}"#)
            .unwrap();
        assert!(cache.has_overview("15_9", 103));
        assert_eq!(
            cache.read_overview("15_9", 103).as_deref(),
            Some(&br#"{"hello":1}"#[..])
        );
    }

    #[test]
    fn a_new_patch_is_a_cache_miss() {
        // Freshness is structural: writing 15_9 must not satisfy a 15_10 lookup.
        let dir = tempdir().unwrap();
        let cache = MetaCache::new(dir.path());
        cache.write_overview("15_9", 103, b"{}").unwrap();
        assert!(cache.has_overview("15_9", 103));
        assert!(!cache.has_overview("15_10", 103));
    }
}
