//! Data Dragon layer (PROJECT_SPEC §3.2, M1): patch discovery, CDN fetch, on-disk cache,
//! ID→metadata maps, and lazy icon resolution.
//!
//! Caching contract: read the cached patch on launch; if the CDN reports a newer patch, download
//! `item.json` + `champion.json` and update the version marker; otherwise work entirely from the
//! cache. **Never fetch DDragon during a game** — the M2 poller owns that guard; M1 only refreshes
//! at startup or on an explicit `force_refresh`.

pub mod cache;
pub mod champions;
pub mod error;
pub mod fetch;
pub mod icons;
pub mod items;
pub mod version;

use std::collections::HashMap;

use crate::model::ItemMeta;
use cache::DdragonCache;
use champions::ChampionIndex;
use fetch::DdragonFetcher;

pub use error::{DdragonError, Result};

/// Fully resolved DDragon data for one patch, held in memory after load.
#[derive(Debug, Clone)]
pub struct ResolvedData {
    pub version: String,
    pub items: HashMap<u32, ItemMeta>,
    pub champions: ChampionIndex,
}

/// How [`ensure_up_to_date`] obtained the data — distinguishes a fresh download from a cache hit
/// from a degraded offline load, so the caller can emit the right `ddragon-status`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LoadOutcome {
    /// Downloaded fresh data for a new (or forced) patch.
    Updated,
    /// Cache was already current; loaded from disk.
    UpToDate,
    /// CDN unreachable; served stale cached data.
    Offline,
}

/// Resolves an enemy's estimated defensive stats — base HP/armor/MR at their level plus the flat
/// HP/armor/MR from the items they own — for the durability / casts-to-kill estimate.
///
/// Returns `(hp, armor, mr)`, or `None` if the champion's base stats are unknown. A plain tuple so
/// the engine has no dependency on a DDragon type (the poller maps it onto `ResolvedDefenses`).
/// An at-a-glance estimate: it excludes the enemy's runes, current HP, and level passives, none of
/// which a Riot-sanctioned source exposes.
pub fn enemy_defenses(
    name_or_id: &str,
    level: u32,
    items: &[u32],
    data: &ResolvedData,
) -> Option<(f32, f32, f32)> {
    let (mut hp, mut armor, mut mr) = data.champions.base_stats(name_or_id)?.at_level(level);
    for &id in items {
        if let Some(item) = data.items.get(&id) {
            hp += item.flat_hp;
            armor += item.flat_armor;
            mr += item.flat_mr;
        }
    }
    Some((hp, armor, mr))
}

/// Loads and parses both core blobs from the cache. Errors with [`DdragonError::NoCache`] if the
/// blobs (or version marker) are absent.
pub fn load_from_cache(cache: &DdragonCache) -> Result<ResolvedData> {
    if !cache.has_core_data() {
        return Err(DdragonError::NoCache);
    }
    let version = cache.cached_version().ok_or(DdragonError::NoCache)?;
    let items = items::parse_items(&cache.read_item_json()?)?;
    let champions = champions::parse_champions(&cache.read_champion_json()?)?;
    Ok(ResolvedData {
        version,
        items,
        champions,
    })
}

/// Downloads `item.json` + `champion.json` for `version`, writes them to the cache (version
/// marker written last, after the data it describes), and returns the parsed result.
pub async fn refresh(
    cache: &DdragonCache,
    fetcher: &DdragonFetcher,
    version: &str,
    locale: &str,
) -> Result<ResolvedData> {
    let item_bytes = fetcher
        .get_bytes(&format!("/cdn/{version}/data/{locale}/item.json"))
        .await?;
    let champion_bytes = fetcher
        .get_bytes(&format!("/cdn/{version}/data/{locale}/champion.json"))
        .await?;

    // Parse before persisting so a corrupt download can't replace good cached data.
    let items = items::parse_items(&item_bytes)?;
    let champions = champions::parse_champions(&champion_bytes)?;

    cache.write_item_json(&item_bytes)?;
    cache.write_champion_json(&champion_bytes)?;
    // The locale marker is written before the version marker: `version` is the "data is complete"
    // sentinel, so it stays last (after everything it describes, locale included).
    cache.write_locale(locale)?;
    cache.write_version(version)?;

    Ok(ResolvedData {
        version: version.to_string(),
        items,
        champions,
    })
}

/// Ensures the cache holds the latest patch and returns the resolved data plus how it was obtained.
///
/// - Online + new patch (or `force`, or no usable cache): download and refresh → [`LoadOutcome::Updated`].
/// - Online + cache current: load from disk → [`LoadOutcome::UpToDate`].
/// - Offline + cache present: serve stale cache → [`LoadOutcome::Offline`].
/// - Offline + no cache: [`DdragonError::NoCache`] (degraded; caller surfaces an offline status).
///
/// A change to `locale` is treated like a needed refresh: even on the same patch, switching locale
/// must re-download the text blobs (so it is correct across restarts, not just within one run).
///
/// `on_updating` is invoked exactly once, right before a download begins, so callers can surface
/// an "updating" status. It is not called on the cache-hit or offline paths.
pub async fn ensure_up_to_date(
    cache: &DdragonCache,
    fetcher: &DdragonFetcher,
    force: bool,
    locale: &str,
    on_updating: impl FnOnce(),
) -> Result<(ResolvedData, LoadOutcome)> {
    match version::fetch_latest_version(fetcher).await {
        Ok(latest) => {
            let cached = cache.cached_version();
            let locale_changed = cache.cached_locale().as_deref() != Some(locale);
            if force
                || !cache.has_core_data()
                || locale_changed
                || version::needs_refresh(&latest, cached.as_deref())
            {
                on_updating();
                let data = refresh(cache, fetcher, &latest, locale).await?;
                Ok((data, LoadOutcome::Updated))
            } else {
                Ok((load_from_cache(cache)?, LoadOutcome::UpToDate))
            }
        }
        Err(err) => {
            // The CDN is unreachable. Fall back to cache if we have one; otherwise propagate.
            if cache.has_core_data() {
                log::warn!("DDragon offline ({err}); serving cached patch");
                Ok((load_from_cache(cache)?, LoadOutcome::Offline))
            } else {
                Err(err)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    // A minimal but valid pair of blobs, used to prime a cache without the network.
    const ITEM_JSON: &[u8] = br#"{ "data": { "1001": { "name": "Boots", "gold": { "total": 300 }, "image": { "full": "1001.png" } } } }"#;
    const CHAMPION_JSON: &[u8] = br#"{ "data": { "Ahri": { "id": "Ahri", "key": "103", "name": "Ahri", "image": { "full": "Ahri.png" } } } }"#;

    fn prime_cache(cache: &DdragonCache, version: &str) {
        cache.write_item_json(ITEM_JSON).unwrap();
        cache.write_champion_json(CHAMPION_JSON).unwrap();
        cache.write_version(version).unwrap();
    }

    #[test]
    fn load_from_cache_resolves_names_offline() {
        // The M1 verify bar: an offline run resolves item/champ names from cache.
        let dir = tempdir().unwrap();
        let cache = DdragonCache::new(dir.path());
        prime_cache(&cache, "14.10.1");

        let data = load_from_cache(&cache).unwrap();
        assert_eq!(data.version, "14.10.1");
        assert_eq!(data.items[&1001].name, "Boots");
        assert_eq!(data.champions.by_key(103).unwrap().name, "Ahri");
    }

    /// A cache that already holds the same patch but a *different* locale must be re-downloaded,
    /// not served from disk — even though `needs_refresh` (patch-only) would say it's current.
    /// Driven against a local mock CDN so it needs no network.
    #[tokio::test]
    async fn locale_marker_mismatch_forces_refresh() {
        use crate::ddragon::fetch::DdragonFetcher;
        use wiremock::matchers::{method, path};
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/api/versions.json"))
            .respond_with(
                ResponseTemplate::new(200).set_body_raw(br#"["14.10.1"]"#, "application/json"),
            )
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/cdn/14.10.1/data/fr_FR/item.json"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(ITEM_JSON, "application/json"))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/cdn/14.10.1/data/fr_FR/champion.json"))
            .respond_with(
                ResponseTemplate::new(200).set_body_raw(CHAMPION_JSON, "application/json"),
            )
            .mount(&server)
            .await;

        let dir = tempdir().unwrap();
        let cache = DdragonCache::new(dir.path());
        // Prime the cache as if a previous run had fetched the same patch in en_US.
        prime_cache(&cache, "14.10.1");
        cache.write_locale("en_US").unwrap();

        let fetcher = DdragonFetcher::with_base(server.uri()).unwrap();
        let mut updating_called = false;
        let (data, outcome) =
            ensure_up_to_date(&cache, &fetcher, false, "fr_FR", || updating_called = true)
                .await
                .unwrap();

        assert_eq!(
            outcome,
            LoadOutcome::Updated,
            "a locale switch on the same patch must force a re-download"
        );
        assert!(updating_called, "on_updating fires before the download");
        assert_eq!(data.version, "14.10.1");
        assert_eq!(cache.cached_locale().as_deref(), Some("fr_FR"));
    }

    #[test]
    fn load_from_cache_errors_when_empty() {
        let dir = tempdir().unwrap();
        let cache = DdragonCache::new(dir.path());
        assert!(matches!(
            load_from_cache(&cache),
            Err(DdragonError::NoCache)
        ));
    }

    /// End-to-end against the live DDragon CDN. Ignored by default (needs network); run with
    /// `cargo test -- --ignored`. Validates real version discovery, fetch, parse, disk cache, a
    /// subsequent offline load, and lazy icon download for stable IDs.
    #[tokio::test]
    #[ignore = "hits the live DDragon CDN; run manually with --ignored"]
    async fn live_fetch_then_offline_load_and_icon() {
        use crate::ddragon::fetch::DdragonFetcher;
        use crate::ddragon::icons::{resolve_icon, IconKind};

        let dir = tempdir().unwrap();
        let cache = DdragonCache::new(dir.path());
        let fetcher = DdragonFetcher::new().unwrap();

        // First run: online, fresh patch -> download + cache.
        let (data, outcome) = ensure_up_to_date(&cache, &fetcher, false, "en_US", || {})
            .await
            .expect("live fetch should succeed");
        assert_eq!(outcome, LoadOutcome::Updated);
        assert!(!data.items.is_empty(), "items should resolve");
        assert!(data.champions.count() > 0, "champions should resolve");
        // Boots (1001) and Ahri (103) are stable IDs across patches.
        assert_eq!(data.items[&1001].name, "Boots");
        assert_eq!(data.champions.by_key(103).unwrap().name, "Ahri");

        // Second run: cache is current (same locale) -> served from disk, no re-download.
        let (_, outcome) = ensure_up_to_date(&cache, &fetcher, false, "en_US", || {})
            .await
            .unwrap();
        assert_eq!(outcome, LoadOutcome::UpToDate);

        // Lazy icon download, then an offline (download-disallowed) resolve hits the cache.
        let downloaded = resolve_icon(
            &cache,
            &fetcher,
            &data.version,
            IconKind::Champion,
            "Ahri.png",
            true,
        )
        .await
        .unwrap()
        .expect("icon should download");
        assert!(downloaded.is_file());
        let cached = resolve_icon(
            &cache,
            &fetcher,
            &data.version,
            IconKind::Champion,
            "Ahri.png",
            false,
        )
        .await
        .unwrap();
        assert_eq!(cached.as_deref(), Some(downloaded.as_path()));
    }
}
