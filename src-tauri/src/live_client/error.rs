//! Errors from the Live Client Data API layer.
//!
//! The Live Client endpoint only responds while a game is in progress; outside a game it refuses
//! the connection. That refusal is the **expected "no game" state**, not a fault to surface loudly
//! (PROJECT_SPEC §3.1). [`LiveClientError::is_no_game`] distinguishes that benign case from a real
//! error so the poller can map it to [`ConnectionStatus::NoGame`] rather than `Error`.
//!
//! [`ConnectionStatus::NoGame`]: crate::model::ConnectionStatus::NoGame

use thiserror::Error;

/// Errors from talking to the local Live Client Data API.
#[derive(Debug, Error)]
pub enum LiveClientError {
    /// Building the underlying HTTP client failed (e.g. TLS backend init).
    #[error("Live Client HTTP init failed: {0}")]
    Init(reqwest::Error),

    /// The endpoint refused the connection or the request timed out. Outside a live game the
    /// Live Client is simply not listening, so this is the ordinary "no game" condition.
    #[error("Live Client unreachable (no game in progress)")]
    NotInGame,

    /// A request reached the endpoint but failed for some other reason (non-2xx, body read).
    #[error("Live Client request failed: {0}")]
    Request(reqwest::Error),

    /// The response body was not the expected JSON shape.
    #[error("failed to parse Live Client JSON: {0}")]
    Parse(reqwest::Error),
}

impl LiveClientError {
    /// True when the error simply means no game is running (connection refused / timed out), as
    /// opposed to a genuine error worth surfacing.
    pub fn is_no_game(&self) -> bool {
        matches!(self, LiveClientError::NotInGame)
    }
}

/// Convenience alias for results in the Live Client layer.
pub type Result<T> = std::result::Result<T, LiveClientError>;
