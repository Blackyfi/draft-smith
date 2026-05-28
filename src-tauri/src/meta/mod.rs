//! "Tier B meta-build" layer: fetch a champion's highest-win-rate build from u.gg, cache the raw
//! overview JSON to disk, and decode it into the typed [`MetaBuild`] contract.
//!
//! This is a **resolver/adapter**, not engine code. It carries concrete item IDs/names from an
//! external stats provider and never feeds the data-driven recommendation engine in `engine/`
//! (whose purity invariant is untouched here). I/O lives in [`fetch`]/[`cache`]; [`parse`] is pure.
//!
//! ### "No repeated fetch mid-game" (CLAUDE.md #6)
//! One u.gg overview JSON holds every region/rank/role for a champion, so [`ensure_overview`]
//! fetches + caches **once per champion + patch** and every later role/rank request indexes the
//! warm cache with no network. A new patch is a new cache key (a miss), so it refetches exactly
//! once. The only possible mid-game request is that single warm-up fetch at game start.

pub mod cache;
pub mod error;
pub mod fetch;
pub mod parse;

use crate::ddragon::ResolvedData;
use crate::model::MetaBuild;
use cache::MetaCache;
use fetch::MetaFetcher;

pub use error::{MetaError, Result};

/// Ensures the champion's raw overview JSON is on disk for the given DDragon patch, fetching once on
/// a cache miss, and returns the parsed `serde_json::Value`.
///
/// A warm cache does **no** network. Derives the u.gg patch segment from `ddragon_version`
/// ("15.9.1" -> "15_9"); errors with [`MetaError::MissingVersion`] if that can't be derived.
pub async fn ensure_overview(
    cache: &MetaCache,
    fetcher: &MetaFetcher,
    ddragon_version: &str,
    champion_key: u32,
) -> Result<serde_json::Value> {
    let ugg_patch = fetch::ugg_patch(ddragon_version).ok_or(MetaError::MissingVersion)?;

    let cached = cache
        .has_overview(&ugg_patch, champion_key)
        .then(|| cache.read_overview(&ugg_patch, champion_key))
        .flatten();

    let bytes = if let Some(cached) = cached {
        cached
    } else {
        let fetched = fetcher.fetch_overview(&ugg_patch, champion_key).await?;
        // Persist before returning so the next request is a warm read. A write failure is logged
        // but not fatal: we can still parse what we just fetched this run.
        if let Err(err) = cache.write_overview(&ugg_patch, champion_key, &fetched) {
            log::warn!("meta: failed to cache overview for champ {champion_key}: {err}");
        }
        fetched
    };

    serde_json::from_slice(&bytes).map_err(|e| MetaError::Parse(e.to_string()))
}

/// Fetches the champion's overview from the newest patch u.gg actually serves, returning the parsed
/// JSON **plus the DDragon version it corresponds to** (so the caller can label the build honestly).
///
/// u.gg lags DDragon: for a day or two after a patch ships, the current patch 403/404s while the
/// previous one still has data. So we try the current patch first and, only on a network failure
/// (the stale-patch 403/404, or offline), fall back to the immediately previous patch. A non-network
/// error (missing version, a real parse/IO fault) is returned as-is — falling back wouldn't help.
async fn overview_with_fallback(
    cache: &MetaCache,
    fetcher: &MetaFetcher,
    ddragon_version: &str,
    champion_key: u32,
) -> Result<(serde_json::Value, String)> {
    let mut last_err = None;
    for version in fallback_versions(ddragon_version) {
        match ensure_overview(cache, fetcher, &version, champion_key).await {
            Ok(overview) => return Ok((overview, version)),
            Err(MetaError::Network(err)) => {
                log::debug!(
                    "meta: overview unavailable for patch {version} (champ {champion_key}): {err}; \
                     trying the previous patch"
                );
                last_err = Some(MetaError::Network(err));
            }
            // MissingVersion / Parse / Io: a previous patch can't fix these.
            Err(other) => return Err(other),
        }
    }
    Err(last_err.unwrap_or(MetaError::MissingVersion))
}

/// The DDragon versions to try for a u.gg overview, newest first: the current patch, then the
/// immediately previous minor. Stops at a season boundary (minor ≤ 1) rather than guessing across
/// it. Only the major.minor matter downstream (`ugg_patch` / `patch_label`), so the previous entry
/// drops the hotfix component.
fn fallback_versions(ddragon_version: &str) -> Vec<String> {
    let mut out = vec![ddragon_version.to_string()];
    if let Some(prev) = previous_minor(ddragon_version) {
        out.push(prev);
    }
    out
}

/// `"16.11.1"` -> `Some("16.10")`. `None` when the version has no parseable minor or the minor is
/// ≤ 1 (a season rollover, where the previous patch number isn't derivable from the string alone).
fn previous_minor(version: &str) -> Option<String> {
    let mut parts = version.split('.');
    let major = parts.next()?;
    let minor: u32 = parts.next()?.trim().parse().ok()?;
    if minor <= 1 {
        return None;
    }
    Some(format!("{major}.{}", minor - 1))
}

/// Resolves a [`MetaBuild`] for `champion` (a DDragon id like "Ahri", the form the Live Client
/// passes), `role` (a friendly name; `None` => the primary/most-played role), and `rank` (a friendly
/// name such as "diamond_plus"; an unknown value falls back to Diamond+).
///
/// Ensures the overview is cached (one network fetch on a cold cache, none when warm), then indexes
/// it purely. Returns `Ok(None)` when the champion is unknown to DDragon or u.gg has no data for the
/// requested role/rank.
pub async fn build_for(
    cache: &MetaCache,
    fetcher: &MetaFetcher,
    ddragon: &ResolvedData,
    champion: &str,
    role: Option<&str>,
    rank: &str,
) -> Result<Option<MetaBuild>> {
    let Some(champ) = ddragon.champions.by_name_or_id(champion) else {
        // Unknown champion: not an error, just no data.
        return Ok(None);
    };
    let champion_key = champ.key;
    // Echo back the DDragon id (canonical), regardless of which form the caller passed.
    let champion_id = champ.id.clone();

    // u.gg lags DDragon: a freshly-released patch 403s for a day or two. Fetch the newest patch u.gg
    // actually serves — the current one, or the immediately previous if the current is unpublished —
    // and label the build with whichever patch we used.
    let (overview, used_version) =
        overview_with_fallback(cache, fetcher, &ddragon.version, champion_key).await?;
    let patch = patch_label(&used_version);

    Ok(parse::build_for(
        &overview,
        &champion_id,
        role,
        rank,
        &patch,
        &ddragon.items,
    ))
}

/// Display patch label: DDragon "15.9.1" -> "15.9" (major.minor), falling back to the raw string if
/// it has fewer than two dotted components.
fn patch_label(ddragon_version: &str) -> String {
    let mut parts = ddragon_version.split('.');
    match (parts.next(), parts.next()) {
        (Some(major), Some(minor)) if !major.is_empty() && !minor.is_empty() => {
            format!("{major}.{minor}")
        }
        _ => ddragon_version.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const OVERVIEW: &str = include_str!("fixtures/overview_ahri.json");

    #[test]
    fn patch_label_drops_the_hotfix_component() {
        assert_eq!(patch_label("15.9.1"), "15.9");
        assert_eq!(patch_label("14.10.1"), "14.10");
        assert_eq!(patch_label("oddball"), "oddball");
    }

    /// Cold cache: one fetch, persisted to disk. Warm cache: zero fetches. Proven by serving the
    /// fixture from a mock that we then drop, so a second read can't hit the network.
    #[tokio::test]
    async fn ensure_overview_fetches_once_then_reads_warm_cache() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path(MetaFetcher::overview_path("15_9", 103)))
            .respond_with(ResponseTemplate::new(200).set_body_raw(OVERVIEW, "application/json"))
            .expect(1) // exactly one network call across both reads
            .mount(&server)
            .await;

        let dir = tempdir().unwrap();
        let cache = MetaCache::new(dir.path());
        let fetcher = MetaFetcher::with_base(server.uri()).unwrap();

        // Cold: fetch + cache.
        let first = ensure_overview(&cache, &fetcher, "15.9.1", 103)
            .await
            .unwrap();
        assert!(first.get("12").is_some(), "World region present");
        assert!(cache.has_overview("15_9", 103), "overview cached to disk");

        // Warm: served from disk, no network (the mock's expect(1) verifies on drop).
        let second = ensure_overview(&cache, &fetcher, "15.9.1", 103)
            .await
            .unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn fallback_versions_lists_current_then_previous_minor() {
        assert_eq!(
            fallback_versions("16.11.1"),
            vec!["16.11.1".to_string(), "16.10".to_string()]
        );
        // Season boundary (minor 1): don't guess the previous patch number.
        assert_eq!(fallback_versions("16.1.1"), vec!["16.1.1".to_string()]);
        // Unparseable: just the current string, no fallback.
        assert_eq!(fallback_versions("oddball"), vec!["oddball".to_string()]);
    }

    /// The real u.gg-lag scenario: u.gg serves the previous patch (16_10) but 404s the current one
    /// (16_11). The fallback must fetch 16_10 and report it as the patch used — and must NOT
    /// negatively cache the unpublished current patch (so it picks up real data once u.gg catches up).
    #[tokio::test]
    async fn overview_falls_back_to_previous_patch_when_current_is_unpublished() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path(MetaFetcher::overview_path("16_10", 103)))
            .respond_with(ResponseTemplate::new(200).set_body_raw(OVERVIEW, "application/json"))
            .mount(&server)
            .await;
        // The current patch (16_11) is intentionally unmounted → the mock answers 404.

        let dir = tempdir().unwrap();
        let cache = MetaCache::new(dir.path());
        let fetcher = MetaFetcher::with_base(server.uri()).unwrap();

        let (overview, used) = overview_with_fallback(&cache, &fetcher, "16.11.1", 103)
            .await
            .expect("falls back to the previous patch");
        assert_eq!(
            used, "16.10",
            "the build is labeled with the patch actually served"
        );
        assert!(
            overview.get("12").is_some(),
            "previous-patch overview parsed"
        );
        assert!(cache.has_overview("16_10", 103), "previous patch cached");
        assert!(
            !cache.has_overview("16_11", 103),
            "the unpublished current patch must not be negatively cached"
        );
    }

    /// When u.gg has the current patch, the fallback is never reached — current data is used and
    /// labeled with the current patch.
    #[tokio::test]
    async fn overview_uses_current_patch_when_available() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path(MetaFetcher::overview_path("16_11", 103)))
            .respond_with(ResponseTemplate::new(200).set_body_raw(OVERVIEW, "application/json"))
            .mount(&server)
            .await;

        let dir = tempdir().unwrap();
        let cache = MetaCache::new(dir.path());
        let fetcher = MetaFetcher::with_base(server.uri()).unwrap();

        let (_, used) = overview_with_fallback(&cache, &fetcher, "16.11.1", 103)
            .await
            .unwrap();
        assert_eq!(used, "16.11.1");
    }

    #[tokio::test]
    async fn missing_patch_version_is_an_error() {
        let dir = tempdir().unwrap();
        let cache = MetaCache::new(dir.path());
        let fetcher = MetaFetcher::with_base("http://127.0.0.1:1").unwrap();
        let err = ensure_overview(&cache, &fetcher, "15", 103)
            .await
            .unwrap_err();
        assert!(matches!(err, MetaError::MissingVersion));
    }
}
