//! The u.gg `stats2` HTTP client and URL derivation.
//!
//! This is a **plain** HTTPS client, entirely separate from the M2 Live Client client (whose
//! self-signed-cert exception scoped to `127.0.0.1:2999` must never be reachable here) and from the
//! DDragon fetcher. The one thing it needs that DDragon doesn't: u.gg returns **HTTP 403** to a
//! default/bot User-Agent, so we send a browser UA.
//!
//! ### The fragility point
//! The URL embeds two u.gg *internal data-format versions* (`OVERVIEW_API_VERSION` and
//! `OVERVIEW_DATA_VERSION`). These bump occasionally and, when stale, make u.gg respond 403/404.
//! They are pinned as named constants here so a future bump is a one-line edit; on fetch failure the
//! orchestration layer degrades gracefully (returns `None` / a domain error) and never panics.

use crate::meta::error::{MetaError, Result};
use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use reqwest::Client;

/// Default u.gg stats origin.
pub const UGG_BASE: &str = "https://stats2.u.gg";

/// u.gg's internal **API** version segment in the overview path (`/lol/{API}/overview/...`).
/// Bumps occasionally; a stale value 403/404s. Verified working: `1.5`.
pub const OVERVIEW_API_VERSION: &str = "1.5";

/// u.gg's internal **data** version segment, the JSON filename (`.../{championId}/{DATA}.json`).
/// Bumps occasionally; a stale value 403/404s. Verified working: `1.5.0`.
pub const OVERVIEW_DATA_VERSION: &str = "1.5.0";

/// u.gg only serves Summoner's Rift ranked-solo data under this queue segment.
const QUEUE: &str = "ranked_solo_5x5";

/// A current desktop browser UA. u.gg returns 403 to the default reqwest/bot UA, so a real-looking
/// UA is required (verified empirically).
const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/// Derives u.gg's patch segment from a DDragon version string.
///
/// DDragon ships a three-part patch ("15.9.1"); u.gg wants the major.minor with an underscore
/// ("15_9"). Returns `None` if the version doesn't have at least two dotted components.
pub fn ugg_patch(ddragon_version: &str) -> Option<String> {
    let mut parts = ddragon_version.split('.');
    let major = parts.next()?.trim();
    let minor = parts.next()?.trim();
    if major.is_empty() || minor.is_empty() {
        return None;
    }
    Some(format!("{major}_{minor}"))
}

/// Thin wrapper over a `reqwest::Client` configured for u.gg (browser UA).
///
/// Cheap to clone (the underlying client is an `Arc`).
#[derive(Debug, Clone)]
pub struct MetaFetcher {
    client: Client,
    base: String,
}

impl MetaFetcher {
    /// Builds a fetcher against the public u.gg stats origin.
    pub fn new() -> Result<Self> {
        Self::with_base(UGG_BASE)
    }

    /// Builds a fetcher against an arbitrary base origin (used by tests against a local server).
    pub fn with_base(base: impl Into<String>) -> Result<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static(BROWSER_UA));
        let client = Client::builder().default_headers(headers).build()?;
        Ok(Self {
            client,
            base: base.into(),
        })
    }

    /// The overview path for a champion on a u.gg patch segment, e.g.
    /// `/lol/1.5/overview/15_9/ranked_solo_5x5/103/1.5.0.json`.
    ///
    /// One fetched JSON holds **every** region/rank/role for the champion, so the caller fetches +
    /// caches once per champion+patch and then indexes in memory.
    pub fn overview_path(ugg_patch: &str, champion_key: u32) -> String {
        format!(
            "/lol/{OVERVIEW_API_VERSION}/overview/{ugg_patch}/{QUEUE}/{champion_key}/{OVERVIEW_DATA_VERSION}.json"
        )
    }

    /// GETs the overview JSON for a champion and returns the raw bytes. A non-2xx (e.g. a 403 from a
    /// stale data version) surfaces as [`MetaError::Network`] so the caller can degrade gracefully.
    pub async fn fetch_overview(&self, ugg_patch: &str, champion_key: u32) -> Result<Vec<u8>> {
        let url = format!(
            "{}{}",
            self.base,
            Self::overview_path(ugg_patch, champion_key)
        );
        let bytes = self
            .client
            .get(url)
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await
            .map_err(MetaError::Network)?;
        Ok(bytes.to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn derives_ugg_patch_from_ddragon_version() {
        assert_eq!(ugg_patch("15.9.1").as_deref(), Some("15_9"));
        assert_eq!(ugg_patch("14.10.1").as_deref(), Some("14_10"));
        assert_eq!(ugg_patch("15.9").as_deref(), Some("15_9"));
        assert_eq!(ugg_patch("15"), None);
        assert_eq!(ugg_patch(""), None);
    }

    #[test]
    fn builds_the_verified_overview_path() {
        // The exact path that was verified to return clean build data for Ahri (103) on 15.9.
        assert_eq!(
            MetaFetcher::overview_path("15_9", 103),
            "/lol/1.5/overview/15_9/ranked_solo_5x5/103/1.5.0.json"
        );
    }
}
