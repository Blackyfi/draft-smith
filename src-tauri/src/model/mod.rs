//! Domain types shared across the Rust core and (mirrored) the frontend contract.
//!
//! These types are generic over abstract attributes only — no champion/item names or IDs —
//! upholding the data-driven engine invariant (PROJECT_SPEC §1.3, `.claude/rust.md`).

pub mod status;

pub use status::ConnectionStatus;
