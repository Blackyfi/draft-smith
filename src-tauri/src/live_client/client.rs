//! The Live Client Data API HTTP client (PROJECT_SPEC §3.1).
//!
//! ## TLS scoping (non-negotiable invariant)
//! The Live Client serves Riot's local **self-signed** certificate. We accept it via
//! `danger_accept_invalid_certs(true)` — but **only on a client that talks exclusively to
//! `https://127.0.0.1:2999`**. The production constructor [`LiveClient::new`] hard-codes that
//! origin and never lets a caller change it, so the cert exception is unreachable for any other
//! host (CLAUDE.md constraint #2, `.claude/rust.md`).
//!
//! The DDragon CDN uses an entirely separate, ordinary client ([`crate::ddragon::fetch`]); the two
//! never share configuration.
//!
//! Tests point at a captured-JSON mock over plain HTTP via [`LiveClient::with_base`], which builds
//! a **standard** client with *no* cert exception — so the danger flag exists solely on the
//! local-endpoint client.

use crate::live_client::error::{LiveClientError, Result};
use crate::live_client::model::AllGameData;
use reqwest::Client;
use std::time::Duration;

/// The one and only origin the self-signed-cert exception is allowed to reach.
pub const LIVE_CLIENT_BASE: &str = "https://127.0.0.1:2999";

/// `/allgamedata` path on the Live Client API.
const ALL_GAME_DATA_PATH: &str = "/liveclientdata/allgamedata";

/// Keep requests snappy: the poller fires every few seconds, so a slow/hung endpoint should fail
/// fast rather than stack up. A refused/timed-out request is treated as "no game" (see below).
const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(4);

/// HTTP client for the local Live Client Data API. Cheap to clone (the inner client is an `Arc`).
#[derive(Debug, Clone)]
pub struct LiveClient {
    client: Client,
    base: String,
}

impl LiveClient {
    /// Builds the production client: scoped self-signed-cert acceptance, bound to
    /// `https://127.0.0.1:2999`.
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .danger_accept_invalid_certs(true) // scoped: this client only ever hits LIVE_CLIENT_BASE
            // Belt-and-braces for the TLS scope (constraint #2): refuse to follow redirects. The
            // Live Client API never legitimately redirects, and without this a 3xx could carry the
            // cert-accepting client off to another host, where the exception must NOT apply.
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(LiveClientError::Init)?;
        Ok(Self {
            client,
            base: LIVE_CLIENT_BASE.to_string(),
        })
    }

    /// Builds a client against an arbitrary base origin **without** the cert exception, for tests
    /// against a local mock server. Deliberately not used in production: the danger flag must stay
    /// confined to [`LiveClient::new`].
    #[cfg(test)]
    pub fn with_base(base: impl Into<String>) -> Result<Self> {
        let client = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(LiveClientError::Init)?;
        Ok(Self {
            client,
            base: base.into(),
        })
    }

    /// Fetches and parses `/allgamedata`.
    ///
    /// A refused connection or timeout — the ordinary state outside a game — maps to
    /// [`LiveClientError::NotInGame`], not a hard error (PROJECT_SPEC §3.1).
    pub async fn all_game_data(&self) -> Result<AllGameData> {
        let url = format!("{}{}", self.base, ALL_GAME_DATA_PATH);
        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(classify_send_error)?
            .error_for_status()
            .map_err(LiveClientError::Request)?;
        response.json::<AllGameData>().await.map_err(|err| {
            // A failed body decode after a 2xx is a malformed payload, not a missing game.
            if err.is_decode() {
                LiveClientError::Parse(err)
            } else {
                classify_send_error(err)
            }
        })
    }
}

/// Maps a transport-layer reqwest error to our domain error: a refused connection or a timeout
/// means no game is running; anything else is a real request failure.
fn classify_send_error(err: reqwest::Error) -> LiveClientError {
    if err.is_connect() || err.is_timeout() {
        LiveClientError::NotInGame
    } else {
        LiveClientError::Request(err)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const SAMPLE: &str = include_str!("fixtures/allgamedata.json");

    #[tokio::test]
    async fn fetches_and_parses_from_mock_server() {
        // Verify bar for M2: works against a local server serving captured JSON, no League needed.
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path(ALL_GAME_DATA_PATH))
            .respond_with(ResponseTemplate::new(200).set_body_raw(SAMPLE, "application/json"))
            .mount(&server)
            .await;

        let client = LiveClient::with_base(server.uri()).unwrap();
        let data = client
            .all_game_data()
            .await
            .expect("mock fetch should succeed");

        assert_eq!(data.all_players.len(), 10);
        assert_eq!(data.self_champion(), Some("Ahri"));
        assert_eq!(data.enemies().len(), 5);
    }

    #[tokio::test]
    async fn connection_refused_is_no_game_not_an_error() {
        // Nothing is listening on this port → connection refused → the benign "no game" state.
        let client = LiveClient::with_base("http://127.0.0.1:1").unwrap();
        let err = client.all_game_data().await.unwrap_err();
        assert!(err.is_no_game(), "expected NotInGame, got {err:?}");
    }

    #[tokio::test]
    async fn malformed_body_is_a_parse_error_not_no_game() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path(ALL_GAME_DATA_PATH))
            .respond_with(ResponseTemplate::new(200).set_body_raw("not json", "application/json"))
            .mount(&server)
            .await;

        let client = LiveClient::with_base(server.uri()).unwrap();
        let err = client.all_game_data().await.unwrap_err();
        assert!(matches!(err, LiveClientError::Parse(_)));
        assert!(!err.is_no_game());
    }

    #[tokio::test]
    async fn server_error_is_a_request_error_not_no_game() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path(ALL_GAME_DATA_PATH))
            .respond_with(ResponseTemplate::new(500))
            .mount(&server)
            .await;

        let client = LiveClient::with_base(server.uri()).unwrap();
        let err = client.all_game_data().await.unwrap_err();
        assert!(matches!(err, LiveClientError::Request(_)));
    }
}
