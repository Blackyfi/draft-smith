//! Patch-version discovery (PROJECT_SPEC §3.2): the first element of `versions.json` is the
//! latest patch.

use crate::ddragon::error::{DdragonError, Result};
use crate::ddragon::fetch::DdragonFetcher;

/// CDN path for the version manifest.
pub const VERSIONS_PATH: &str = "/api/versions.json";

/// Fetches the latest patch version (the first element of `versions.json`).
pub async fn fetch_latest_version(fetcher: &DdragonFetcher) -> Result<String> {
    let versions: Vec<String> = fetcher.get_json(VERSIONS_PATH).await?;
    versions
        .into_iter()
        .next()
        .filter(|v| !v.trim().is_empty())
        .ok_or(DdragonError::MissingVersion)
}

/// True when the cache must be refreshed: there is no cached version, or it differs from `latest`.
pub fn needs_refresh(latest: &str, cached: Option<&str>) -> bool {
    cached != Some(latest)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refresh_decision() {
        assert!(needs_refresh("14.10.1", None));
        assert!(needs_refresh("14.10.1", Some("14.9.1")));
        assert!(!needs_refresh("14.10.1", Some("14.10.1")));
    }
}
