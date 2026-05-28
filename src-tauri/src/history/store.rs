//! On-disk persistence for recorded matches (Part A).
//!
//! Each match is one pretty-printed JSON file at `<root>/<id>.json`. The list view parses every
//! file and projects it to a [`MatchSummary`]; a corrupt file is skipped (with a warning), never
//! fatal. All public methods are best-effort and tolerate a missing directory. Ids are validated
//! before being turned into a path so a hostile/garbled id can't escape the matches directory.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use super::model::{MatchRecord, MatchSummary};

/// A handle to the on-disk match store rooted at `app_data_dir/matches`.
#[derive(Debug, Clone)]
pub struct MatchStore {
    root: PathBuf,
}

impl MatchStore {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    /// Persists a record as `<root>/<id>.json` (creating the directory as needed).
    pub fn save(&self, record: &MatchRecord) -> io::Result<()> {
        fs::create_dir_all(&self.root)?;
        let path = self
            .path_for(&record.id)
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "invalid match id"))?;
        let json = serde_json::to_string_pretty(record)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(path, json)
    }

    /// Lists all stored matches as summaries, newest first. Corrupt/unreadable files are skipped
    /// with a warning. A missing matches directory yields an empty list.
    pub fn list(&self) -> Vec<MatchSummary> {
        let Ok(entries) = fs::read_dir(&self.root) else {
            return Vec::new();
        };
        let mut summaries: Vec<MatchSummary> = entries
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|ext| ext == "json"))
            .filter_map(|p| match Self::read_record(&p) {
                Ok(record) => Some(record.summary()),
                Err(err) => {
                    log::warn!("history: skipping unreadable match {}: {err}", p.display());
                    None
                }
            })
            .collect();
        // Newest first (then by id for a stable tiebreak on equal timestamps).
        summaries.sort_by(|a, b| b.ended_at.cmp(&a.ended_at).then_with(|| b.id.cmp(&a.id)));
        summaries
    }

    /// Loads a full record by id, or `None` if it doesn't exist. `Err` only on a present-but-corrupt
    /// file or an invalid id.
    pub fn get(&self, id: &str) -> io::Result<Option<MatchRecord>> {
        let Some(path) = self.path_for(id) else {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid match id",
            ));
        };
        match Self::read_record(&path) {
            Ok(record) => Ok(Some(record)),
            Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(err) => Err(err),
        }
    }

    /// Deletes a match by id. Missing is treated as success (idempotent delete).
    pub fn delete(&self, id: &str) -> io::Result<()> {
        let Some(path) = self.path_for(id) else {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "invalid match id",
            ));
        };
        match fs::remove_file(path) {
            Ok(()) => Ok(()),
            Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(err) => Err(err),
        }
    }

    /// Reads + deserializes one record file.
    fn read_record(path: &Path) -> io::Result<MatchRecord> {
        let raw = fs::read_to_string(path)?;
        serde_json::from_str(&raw).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    /// Maps an id to its file path, but only if the id is filename-safe — rejecting anything with a
    /// path separator, `..`, or characters outside `[A-Za-z0-9_.-]` so a caller-supplied id can't
    /// traverse out of the matches directory.
    fn path_for(&self, id: &str) -> Option<PathBuf> {
        if id.is_empty() || !id.bytes().all(is_safe_id_byte) || id.contains("..") {
            return None;
        }
        Some(self.root.join(format!("{id}.json")))
    }
}

/// Allowed id characters: ASCII alphanumerics plus `_`, `-`, `.` (the id is app-generated as
/// `<unixMs>_<champion>`, but we validate defensively since it crosses the FE→Rust boundary).
fn is_safe_id_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.')
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::history::model::MatchResult;
    use tempfile::tempdir;

    fn sample(id: &str, ended_at: i64) -> MatchRecord {
        MatchRecord {
            id: id.into(),
            started_at: ended_at - 1_000_000,
            ended_at,
            app_version: "0.1.13".into(),
            patch: "16.11.1".into(),
            game_mode: "CLASSIC".into(),
            map_name: "Map11".into(),
            map_number: 11,
            duration_seconds: 1234.0,
            result: MatchResult::Win,
            self_champion: "Ahri".into(),
            players: Vec::new(),
            item_timeline: Vec::new(),
            level_timeline: Vec::new(),
            skill_timeline: Vec::new(),
            events: Vec::new(),
            diagnostics: Vec::new(),
        }
    }

    #[test]
    fn save_list_get_delete_round_trip() {
        let dir = tempdir().unwrap();
        let store = MatchStore::new(dir.path());

        store.save(&sample("100_Ahri", 100)).unwrap();
        store.save(&sample("200_Zed", 200)).unwrap();

        // List is newest-first.
        let list = store.list();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, "200_Zed");
        assert_eq!(list[1].id, "100_Ahri");

        // Get the full record back.
        let got = store.get("100_Ahri").unwrap().unwrap();
        assert_eq!(got.self_champion, "Ahri");
        assert!(store.get("nope").unwrap().is_none());

        // Delete is idempotent.
        store.delete("100_Ahri").unwrap();
        store.delete("100_Ahri").unwrap();
        assert_eq!(store.list().len(), 1);
    }

    #[test]
    fn empty_or_missing_dir_lists_nothing() {
        let dir = tempdir().unwrap();
        let store = MatchStore::new(dir.path().join("does-not-exist"));
        assert!(store.list().is_empty());
    }

    #[test]
    fn corrupt_file_is_skipped_not_fatal() {
        let dir = tempdir().unwrap();
        let store = MatchStore::new(dir.path());
        store.save(&sample("100_Ahri", 100)).unwrap();
        fs::write(dir.path().join("garbage.json"), b"{ not json ]").unwrap();
        // The good record still lists; the garbage one is skipped.
        let list = store.list();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "100_Ahri");
    }

    #[test]
    fn rejects_unsafe_ids() {
        let dir = tempdir().unwrap();
        let store = MatchStore::new(dir.path());
        for bad in ["../escape", "a/b", "..", "with space", ""] {
            assert!(store.get(bad).is_err(), "id {bad:?} must be rejected");
        }
    }
}
