//! Live Client Data API layer (PROJECT_SPEC §3.1, M2): a scoped self-signed-cert HTTP client over
//! `https://127.0.0.1:2999`, the typed `/allgamedata` view, and the domain errors that let the
//! poller distinguish "no game" from a real fault.
//!
//! The TLS exception is confined to [`client`] (see its module docs). Nothing here parses into the
//! recommendation engine's domain types — M3 owns that mapping — so the data-driven invariant is
//! untouched.

pub mod client;
pub mod error;
pub mod model;

pub use client::LiveClient;
pub use model::AllGameData;
