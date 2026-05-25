//! Domain types shared across the Rust core and (mirrored) the frontend contract.
//!
//! These types are generic over abstract attributes only — no champion/item names or IDs drive
//! engine behavior — upholding the data-driven engine invariant (PROJECT_SPEC §1.3,
//! `.claude/rust.md`). The DDragon metadata types here (`ItemMeta`, `ChampionMeta`) are raw CDN
//! descriptors, not engine rules.

pub mod champion;
pub mod ddragon;
pub mod engine;
pub mod game;
pub mod item;
pub mod settings;
pub mod status;

pub use champion::ChampionMeta;
pub use ddragon::DdragonStatus;
pub use engine::{
    BuildStep, EnemyThreatView, Recommendation, SwapSuggestion, TeamThreat, ThreatProfile,
};
pub use game::GameStateSummary;
pub use item::ItemMeta;
// `Aggressiveness`/`Theme` are part of the typed FE↔Rust settings contract (mirrored in
// `src/types.ts`) even though the Rust core currently only names `Settings` directly.
#[allow(unused_imports)]
pub use settings::{Aggressiveness, Settings, Theme};
pub use status::ConnectionStatus;
