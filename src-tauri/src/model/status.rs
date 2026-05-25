use serde::{Deserialize, Serialize};

/// High-level connection / coaching status surfaced to the frontend.
///
/// Mirrors `ConnectionStatus` in `src/types.ts` — keep both sides in sync (PROJECT_SPEC §4.2).
/// Intentionally generic: it carries no champion/item knowledge, so it has no bearing on the
/// data-driven engine invariant.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConnectionStatus {
    /// No live game detected. The Live Client API refuses connections outside a game;
    /// that is this state, not an error (PROJECT_SPEC §3.1).
    NoGame,
    /// Attempting to reach the Live Client API.
    Connecting,
    /// A live game is in progress.
    InGame,
    /// An unexpected error occurred.
    Error,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_to_kebab_case() {
        // The kebab-case wire format is the FE↔Rust contract; src/types.ts depends on it.
        assert_eq!(
            serde_json::to_string(&ConnectionStatus::NoGame).unwrap(),
            "\"no-game\""
        );
        assert_eq!(
            serde_json::to_string(&ConnectionStatus::InGame).unwrap(),
            "\"in-game\""
        );
        assert_eq!(
            serde_json::to_string(&ConnectionStatus::Connecting).unwrap(),
            "\"connecting\""
        );
    }
}
