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

    let overview = ensure_overview(cache, fetcher, &ddragon.version, champion_key).await?;
    let patch = patch_label(&ddragon.version);

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
