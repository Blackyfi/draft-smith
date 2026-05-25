//! Icon path resolution with optional lazy download.
//!
//! Per the chosen strategy, icons are **not** prefetched on a patch change: only JSON is cached
//! up front. [`resolve_icon`] returns a cached icon path, optionally downloading and caching it
//! on a miss. Callers that must not hit the network (e.g. the in-game path — never fetch DDragon
//! during a game, PROJECT_SPEC §3.2) pass `allow_download = false`.

use crate::ddragon::cache::DdragonCache;
use crate::ddragon::error::Result;
use crate::ddragon::fetch::DdragonFetcher;
use std::path::PathBuf;

/// Which icon namespace a file belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum IconKind {
    Item,
    Champion,
}

impl IconKind {
    /// DDragon CDN sub-path segment (`/cdn/<ver>/img/<segment>/<file>`).
    fn cdn_segment(self) -> &'static str {
        match self {
            IconKind::Item => "item",
            IconKind::Champion => "champion",
        }
    }

    fn cache_path(self, cache: &DdragonCache, file: &str) -> PathBuf {
        match self {
            IconKind::Item => cache.item_icon_path(file),
            IconKind::Champion => cache.champion_icon_path(file),
        }
    }
}

/// A `file` is a bare DDragon icon name. Reject anything that could escape the icon cache dir
/// when joined into a path. Today these names come only from trusted DDragon JSON, but treating
/// them as untrusted keeps a future caller from turning a stray `..` into a path traversal.
fn is_safe_icon_file(file: &str) -> bool {
    !file.is_empty() && !file.contains("..") && !file.contains(['/', '\\'])
}

/// Resolves the on-disk path for an icon.
///
/// - If the icon is already cached, returns its path (no network).
/// - Otherwise, if `allow_download` is set, fetches it from the CDN, caches it, and returns the path.
/// - Otherwise (cache miss, downloads disallowed) returns `Ok(None)`.
///
/// `version` is the patch the icon belongs to; `file` is the DDragon `image.full` name
/// (e.g. `"1001.png"` / `"Ahri.png"`). A `file` that could escape the cache directory resolves
/// to `Ok(None)`.
pub async fn resolve_icon(
    cache: &DdragonCache,
    fetcher: &DdragonFetcher,
    version: &str,
    kind: IconKind,
    file: &str,
    allow_download: bool,
) -> Result<Option<PathBuf>> {
    if !is_safe_icon_file(file) {
        log::warn!("DDragon: rejecting unsafe icon filename {file:?}");
        return Ok(None);
    }
    let path = kind.cache_path(cache, file);
    if path.is_file() {
        return Ok(Some(path));
    }
    if !allow_download {
        return Ok(None);
    }
    let cdn_path = format!("/cdn/{}/img/{}/{}", version, kind.cdn_segment(), file);
    let bytes = fetcher.get_bytes(&cdn_path).await?;
    cache.write_bytes(&path, &bytes)?;
    Ok(Some(path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn returns_cached_path_without_downloading() {
        let dir = tempdir().unwrap();
        let cache = DdragonCache::new(dir.path());
        let fetcher = DdragonFetcher::new().unwrap();

        // Pre-seed a "downloaded" icon, then resolve with downloads DISABLED: it still resolves.
        let expected = cache.item_icon_path("1001.png");
        cache.write_bytes(&expected, b"\x89PNG fake").unwrap();

        let resolved = resolve_icon(
            &cache,
            &fetcher,
            "14.10.1",
            IconKind::Item,
            "1001.png",
            false,
        )
        .await
        .unwrap();
        assert_eq!(resolved, Some(expected));
    }

    #[tokio::test]
    async fn cache_miss_with_downloads_disabled_is_none() {
        let dir = tempdir().unwrap();
        let cache = DdragonCache::new(dir.path());
        let fetcher = DdragonFetcher::new().unwrap();

        let resolved = resolve_icon(
            &cache,
            &fetcher,
            "14.10.1",
            IconKind::Champion,
            "Ahri.png",
            false,
        )
        .await
        .unwrap();
        assert_eq!(resolved, None);
    }

    #[tokio::test]
    async fn rejects_path_traversal_filenames() {
        let dir = tempdir().unwrap();
        let cache = DdragonCache::new(dir.path());
        let fetcher = DdragonFetcher::new().unwrap();
        for bad in ["../secret.png", "a/b.png", "a\\b.png", ".."] {
            let resolved = resolve_icon(&cache, &fetcher, "14.10.1", IconKind::Item, bad, true)
                .await
                .unwrap();
            assert_eq!(resolved, None, "{bad:?} should be rejected");
        }
    }

    #[test]
    fn item_and_champion_icons_live_in_separate_namespaces() {
        let dir = tempdir().unwrap();
        let cache = DdragonCache::new(dir.path());
        assert_ne!(
            IconKind::Item.cache_path(&cache, "x.png"),
            IconKind::Champion.cache_path(&cache, "x.png")
        );
    }
}
