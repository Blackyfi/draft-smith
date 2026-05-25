//! The recommendation engine (PROJECT_SPEC §5; `.claude/rust.md`): the pure, data-driven brain.
//!
//! Pipeline: [`input::EngineInput`] → classify each enemy ([`classify`]) → aggregate the team
//! threat and derive active counter-conditions ([`aggregate`]) → score the player's build graph and
//! assemble the ordered, explained path ([`rank::recommend`]), with reasons from [`explain`].
//!
//! ## Data-driven invariant (audit me)
//! Nothing in this module branches on a champion name or item id to change behaviour. Champion and
//! item names appear only as (a) keys used to look data up in [`crate::rules`] and (b) display
//! values echoed into output. All matchup logic flows through `Archetype` / `DamageType` /
//! `IntentTag` / `LiveSignal` / `CounterCondition`. Adding a champion/item/patch is a JSON edit.
//!
//! Purity: no I/O, no `SystemTime::now()`, no RNG. Time/gold are passed in via `EngineInput`.

pub mod aggregate;
pub mod classify;
pub mod explain;
pub mod input;
pub mod rank;

#[cfg(test)]
mod corpus;

pub use input::EngineInput;
pub use rank::recommend;
