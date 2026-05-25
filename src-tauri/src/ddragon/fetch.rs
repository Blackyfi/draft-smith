//! The Data Dragon HTTP client.
//!
//! This is a **plain** HTTPS client for the static CDN. It is deliberately distinct from the M2
//! Live Client client: the self-signed-cert exception scoped to `127.0.0.1:2999` must never be
//! reachable from here (`.claude/rust.md`, PROJECT_SPEC §3.1).

use crate::ddragon::error::Result;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT_CHARSET};
use reqwest::Client;
use serde::de::DeserializeOwned;

/// Default DDragon CDN origin.
pub const DDRAGON_BASE: &str = "https://ddragon.leagueoflegends.com";

/// Thin wrapper over a `reqwest::Client` configured for the DDragon CDN.
///
/// Cheap to clone (the underlying client is an `Arc`).
#[derive(Debug, Clone)]
pub struct DdragonFetcher {
    client: Client,
    base: String,
}

impl DdragonFetcher {
    /// Builds a fetcher against the public DDragon CDN.
    pub fn new() -> Result<Self> {
        Self::with_base(DDRAGON_BASE)
    }

    /// Builds a fetcher against an arbitrary base origin (used by tests against a local server).
    pub fn with_base(base: impl Into<String>) -> Result<Self> {
        // Riot's guidance: request UTF-8 explicitly (PROJECT_SPEC §3.2).
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT_CHARSET, HeaderValue::from_static("UTF-8"));
        let client = Client::builder()
            .user_agent(concat!("DraftSmith/", env!("CARGO_PKG_VERSION")))
            .default_headers(headers)
            .build()?;
        Ok(Self {
            client,
            base: base.into(),
        })
    }

    /// GETs `path` (joined onto the base origin) and deserializes the JSON body.
    pub async fn get_json<T: DeserializeOwned>(&self, path: &str) -> Result<T> {
        let url = format!("{}{}", self.base, path);
        let body = self
            .client
            .get(url)
            .send()
            .await?
            .error_for_status()?
            .json::<T>()
            .await?;
        Ok(body)
    }

    /// GETs `path` and returns the raw response bytes (used for icon downloads).
    pub async fn get_bytes(&self, path: &str) -> Result<Vec<u8>> {
        let url = format!("{}{}", self.base, path);
        let bytes = self
            .client
            .get(url)
            .send()
            .await?
            .error_for_status()?
            .bytes()
            .await?;
        Ok(bytes.to_vec())
    }
}
