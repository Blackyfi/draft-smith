use thiserror::Error;

/// Errors from the Data Dragon layer (version discovery, fetch, cache, parsing).
///
/// External data (network, disk, JSON) is fallible by nature: every fallible path returns this
/// rather than panicking, per `.claude/rust.md` ("never `unwrap()` on external data").
#[derive(Debug, Error)]
pub enum DdragonError {
    /// A network request to the DDragon CDN failed (offline, DNS, non-2xx, body read).
    #[error("DDragon request failed: {0}")]
    Network(#[from] reqwest::Error),

    /// A cached or downloaded JSON payload could not be parsed.
    #[error("failed to parse DDragon JSON: {0}")]
    Parse(#[from] serde_json::Error),

    /// A filesystem operation on the disk cache failed.
    #[error("DDragon cache I/O failed: {0}")]
    Io(#[from] std::io::Error),

    /// `versions.json` was empty / had no usable first element.
    #[error("DDragon returned no versions")]
    MissingVersion,

    /// Required data is not present in the cache and the CDN is unreachable.
    #[error("no cached DDragon data available")]
    NoCache,
}

/// Convenience alias for results in the DDragon layer.
pub type Result<T> = std::result::Result<T, DdragonError>;
