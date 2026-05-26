use thiserror::Error;

/// Errors from the meta-build layer (u.gg fetch, disk cache, JSON decode).
///
/// Like the DDragon layer, every fallible path returns this rather than panicking. The u.gg data
/// source is the known fragility point (its internal data-format versions bump and 403/404 when
/// stale); [`MetaError::Network`] captures those so the command can degrade gracefully.
#[derive(Debug, Error)]
pub enum MetaError {
    /// A request to u.gg failed (offline, DNS, non-2xx such as a 403/404 from a stale data version).
    #[error("u.gg request failed: {0}")]
    Network(#[from] reqwest::Error),

    /// The overview JSON could not be parsed / had an unexpected shape.
    #[error("failed to parse u.gg overview JSON: {0}")]
    Parse(String),

    /// A filesystem operation on the disk cache failed.
    #[error("meta cache I/O failed: {0}")]
    Io(#[from] std::io::Error),

    /// No DDragon patch is loaded yet, so the u.gg patch segment can't be derived.
    #[error("no patch version available to derive the u.gg URL")]
    MissingVersion,
}

/// Convenience alias for results in the meta layer.
pub type Result<T> = std::result::Result<T, MetaError>;
