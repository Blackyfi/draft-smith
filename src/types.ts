/**
 * Frontend mirror of the Rust Tauri command/event contract (PROJECT_SPEC §4.2).
 *
 * This file is the single source of FE truth for the contract. Whenever a Rust payload type
 * in `src-tauri/src/model/` changes, update the matching type here in the same change so the
 * two sides cannot silently drift.
 */

/**
 * Mirrors `ConnectionStatus` in `src-tauri/src/model/status.rs` (serde `kebab-case`).
 * Generic by design — carries no champion/item knowledge.
 */
export type ConnectionStatus = "no-game" | "connecting" | "in-game" | "error";
