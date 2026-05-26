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
pub mod gank;
pub mod item;
pub mod meta;
pub mod settings;
pub mod status;

pub use champion::ChampionMeta;
pub use ddragon::DdragonStatus;
pub use engine::{
    AbilityRanks, BuildStep, EnemyThreatView, Recommendation, SwapSuggestion, TeamThreat,
    ThreatProfile,
};
// `FocusPriority`/`FocusTarget`/`ItemIntel` are part of the typed FE↔Rust contract (carried inside
// `Recommendation`, mirrored in `src/types.ts`); the engine references them via
// `crate::model::engine::*`, so the re-exports are contract surface, not yet named here.
#[allow(unused_imports)]
pub use engine::{FocusPriority, FocusTarget, ItemIntel};
pub use game::GameStateSummary;
pub use gank::GankAlert;
// `GankAlertKind`/`GankStyle` are part of the typed FE↔Rust `gank-alert` contract (mirrored in
// `src/types.ts`), carried inside `GankAlert`; referenced elsewhere via their `gank::` path.
#[allow(unused_imports)]
pub use gank::{GankAlertKind, GankStyle};
pub use item::ItemMeta;
pub use meta::{MetaBuild, MetaItem, MetaItemOption};
// `Aggressiveness`/`Theme` are part of the typed FE↔Rust settings contract (mirrored in
// `src/types.ts`) even though the Rust core currently only names `Settings` directly.
#[allow(unused_imports)]
pub use settings::{Aggressiveness, Settings, Theme};
pub use status::ConnectionStatus;
