//! Match recording & history (Part A).
//!
//! Captures objective Live-Client facts from each game into a persisted [`MatchRecord`] the user can
//! browse afterward, and the foundation for the later KPI/analysis phase. Three pieces:
//! - [`model`] — the serialized schema (mirrored in `src/types.ts`).
//! - [`recorder`] — the pure, clockless cross-poll accumulator ([`MatchRecorder`]).
//! - [`store`] — on-disk persistence ([`MatchStore`]) under `app_data_dir/matches`.
//!
//! The recorder is *not* the engine (it does no recommendation logic and branches on no
//! champion/item identity), so the data-driven invariant is untouched.

pub mod model;
pub mod recorder;
pub mod store;

pub use recorder::MatchRecorder;
pub use store::MatchStore;
