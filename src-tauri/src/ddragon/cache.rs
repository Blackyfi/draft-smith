//! On-disk cache for Data Dragon data.
//!
//! Layout under the cache root (the app-data dir in production, a tempdir in tests):
//!
//! ```text
//! <root>/
//!   version              # plain-text patch marker, e.g. "14.10.1"
//!   locale               # plain-text locale marker, e.g. "en_US"
//!   item.json            # raw DDragon item.json
//!   champion.json        # raw DDragon champion.json
//!   icons/item/<f>.png   # lazily downloaded item icons
//!   icons/champion/<f>.png
//! ```
//!
//! All reads are tolerant: a missing/corrupt cache surfaces as "absent", never a panic.

use crate::ddragon::error::Result;
use std::fs;
use std::path::{Path, PathBuf};

const VERSION_MARKER: &str = "version";
const LOCALE_MARKER: &str = "locale";
const ITEM_JSON: &str = "item.json";
const CHAMPION_JSON: &str = "champion.json";

/// Handle to the DDragon disk cache rooted at a directory.
#[derive(Debug, Clone)]
pub struct DdragonCache {
    root: PathBuf,
}

impl DdragonCache {
    /// Creates a cache handle. Does not touch the filesystem; directories are created lazily on write.
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn item_json_path(&self) -> PathBuf {
        self.root.join(ITEM_JSON)
    }

    pub fn champion_json_path(&self) -> PathBuf {
        self.root.join(CHAMPION_JSON)
    }

    /// On-disk path for an item icon file (e.g. `"1001.png"`); the file may or may not exist.
    pub fn item_icon_path(&self, file: &str) -> PathBuf {
        self.root.join("icons").join("item").join(file)
    }

    /// On-disk path for a champion icon file (e.g. `"Ahri.png"`); the file may or may not exist.
    pub fn champion_icon_path(&self, file: &str) -> PathBuf {
        self.root.join("icons").join("champion").join(file)
    }

    /// The patch version recorded in the cache, if any. An empty/whitespace marker reads as `None`.
    pub fn cached_version(&self) -> Option<String> {
        let raw = fs::read_to_string(self.root.join(VERSION_MARKER)).ok()?;
        let trimmed = raw.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    }

    /// True when both core JSON blobs are present, i.e. the cache can serve a full offline load.
    pub fn has_core_data(&self) -> bool {
        self.item_json_path().is_file() && self.champion_json_path().is_file()
    }

    /// The Data Dragon text locale recorded in the cache, if any. An empty/whitespace marker (or an
    /// older cache written before locale tracking existed) reads as `None`.
    pub fn cached_locale(&self) -> Option<String> {
        let raw = fs::read_to_string(self.root.join(LOCALE_MARKER)).ok()?;
        let trimmed = raw.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    }

    /// Records the patch version marker (written last, after the data it describes).
    pub fn write_version(&self, version: &str) -> Result<()> {
        self.write_bytes(&self.root.join(VERSION_MARKER), version.as_bytes())
    }

    /// Records the locale the cached blobs were downloaded for, so a later run can detect a locale
    /// switch on the same patch and force a re-download.
    pub fn write_locale(&self, locale: &str) -> Result<()> {
        self.write_bytes(&self.root.join(LOCALE_MARKER), locale.as_bytes())
    }

    pub fn write_item_json(&self, bytes: &[u8]) -> Result<()> {
        self.write_bytes(&self.item_json_path(), bytes)
    }

    pub fn write_champion_json(&self, bytes: &[u8]) -> Result<()> {
        self.write_bytes(&self.champion_json_path(), bytes)
    }

    pub fn read_item_json(&self) -> Result<Vec<u8>> {
        Ok(fs::read(self.item_json_path())?)
    }

    pub fn read_champion_json(&self) -> Result<Vec<u8>> {
        Ok(fs::read(self.champion_json_path())?)
    }

    /// Writes raw bytes to `path`, creating parent directories as needed. Used for icon files.
    pub fn write_bytes(&self, path: &Path, bytes: &[u8]) -> Result<()> {
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
    fn version_marker_round_trips() {
        let dir = tempdir().unwrap();
        let cache = DdragonCache::new(dir.path());
        assert_eq!(cache.cached_version(), None);
        cache.write_version("14.10.1").unwrap();
        assert_eq!(cache.cached_version().as_deref(), Some("14.10.1"));
    }

    #[test]
    fn blank_version_marker_reads_as_none() {
        let dir = tempdir().unwrap();
        let cache = DdragonCache::new(dir.path());
        cache.write_version("   \n").unwrap();
        assert_eq!(cache.cached_version(), None);
    }

    #[test]
    fn has_core_data_requires_both_blobs() {
        let dir = tempdir().unwrap();
        let cache = DdragonCache::new(dir.path());
        assert!(!cache.has_core_data());
        cache.write_item_json(b"{}").unwrap();
        assert!(!cache.has_core_data());
        cache.write_champion_json(b"{}").unwrap();
        assert!(cache.has_core_data());
    }

    #[test]
    fn json_blobs_round_trip() {
        let dir = tempdir().unwrap();
        let cache = DdragonCache::new(dir.path());
        cache.write_item_json(br#"{"data":{}}"#).unwrap();
        assert_eq!(cache.read_item_json().unwrap(), br#"{"data":{}}"#);
    }
}
