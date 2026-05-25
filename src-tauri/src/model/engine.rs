//! Abstract domain types the recommendation engine reasons over (PROJECT_SPEC §5; M3).
//!
//! **These are the only attributes engine control flow is allowed to branch on** — `DamageType`,
//! `Archetype`, [`IntentTag`], [`LiveSignal`] — never a champion name or item id (`.claude/rust.md`,
//! the data-driven invariant). Champion/item *knowledge* (which champion is which archetype, which
//! item carries which intent) lives entirely in `rules/data/*.json` and is mapped onto these enums
//! at load time. Adding a champion/item/patch is a data edit, never a change here or in `engine/`.
//!
//! The output types (`Recommendation` and friends) are the typed Tauri contract carried by the
//! `recommendation-updated` event; they are mirrored in `src/types.ts`.

use serde::{Deserialize, Serialize};

/// The kind of damage a champion or item deals. Drives armor- vs magic-resist counters.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DamageType {
    Physical,
    Magic,
    /// Meaningfully split AD/AP (e.g. an on-hit marksman, a hybrid bruiser).
    Mixed,
    True,
}

/// Role archetype (PROJECT_SPEC §1.3). Static per champion (from rules data), refined live by what
/// the enemy actually buys. The engine reasons over these, never over the champion's name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Archetype {
    Assassin,
    Marksman,
    BurstMage,
    Battlemage,
    Artillery,
    Bruiser,
    Juggernaut,
    Tank,
    Enchanter,
    /// Lock-down support (Leona, Thresh): brings the team's hard CC.
    Catcher,
}

/// The "intent" an item serves — the abstract reason a build would pick it. Items carry a set of
/// these in `item_intents.json`; counters map a threat to the intent-tags that answer it. This is
/// the vocabulary that keeps recommendations data-driven (PROJECT_SPEC §5.2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IntentTag {
    MagicPenFlat,
    MagicPenPercent,
    ArmorPenFlat,
    ArmorPenPercent,
    BurstAmp,
    StasisSurvival,
    Spellshield,
    Antiheal,
    PercentHpDamage,
    AbilityHaste,
    ArmorSelf,
    MrSelf,
    HealthSelf,
    MoveSpeed,
    Lifesteal,
    Omnivamp,
    Crit,
    OnHit,
    /// Offensive lethality (flat armor pen); on an enemy item it marks an assassin threat.
    Lethality,
    /// Generic healing/sustain provided to its owner.
    Sustain,
    /// Forward-compatible catch-all: an unrecognized tag in the data deserializes here instead of
    /// failing the whole rule-set load (tolerate data the engine doesn't yet understand).
    #[serde(other)]
    Unknown,
}

/// A live, item-/state-derived signal about an enemy or the enemy team (PROJECT_SPEC §5.2 step 2).
/// Distinct from `Archetype`: archetype is who they *are*, a signal is what they're *doing now*.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LiveSignal {
    HealthStacking,
    ArmorStacking,
    MrStacking,
    /// Building lethality / flat armor pen — an active burst-assassin threat.
    Lethality,
    /// Notable healing/lifesteal/omnivamp — invites antiheal.
    HasSustain,
    HardCc,
    Mobility,
    /// Snowballing on the scoreboard (high KDA, low deaths) — amplifies the threat they pose.
    Fed,
}

/// One enemy's classification: their static archetype plus the live signals read off their build
/// and scoreline. Produced by `engine::classify::classify_enemy`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreatProfile {
    pub champion: String,
    pub archetype: Archetype,
    pub damage_type: DamageType,
    /// Live signals, de-duplicated and in a stable order (for deterministic output).
    pub signals: Vec<LiveSignal>,
}

/// The aggregated threat posed by the whole enemy team (PROJECT_SPEC §5.2 step 3). Numeric shares
/// and counts that the ranker turns into active counter-conditions.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamThreat {
    /// Fraction of the enemy team's damage that is physical, in `0.0..=1.0` (Mixed counts half to
    /// each side; True is excluded from the split).
    pub physical_share: f32,
    /// Fraction that is magic, in `0.0..=1.0`.
    pub magic_share: f32,
    /// Number of enemies bringing hard CC.
    pub hard_cc_count: u32,
    /// A fed enemy assassin is snowballing (the single most build-warping signal).
    pub has_fed_assassin: bool,
    /// Count of enemies stacking health/armor (the frontline you must cut through).
    pub frontline_bulk: u32,
    /// Any enemy has meaningful healing/sustain.
    pub healing_present: bool,
}

/// One step in the recommended build path. `owned` lets the UI check/dim items already purchased.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildStep {
    pub item_id: u32,
    pub name: String,
    pub cost: u32,
    pub owned: bool,
    /// Generated, threat-specific rationale (PROJECT_SPEC §5.2 step 6).
    pub reason: String,
}

/// A situational "if the game shifts this way, buy this instead" suggestion (PROJECT_SPEC §5.2 step 5).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SwapSuggestion {
    /// What would make this swap worth it (e.g. "If their healing grows").
    pub trigger: String,
    pub item_id: u32,
    pub name: String,
    pub reason: String,
}

/// A per-enemy view for the threat board (PROJECT_SPEC §6.3): the *why* behind the build, surfaced.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnemyThreatView {
    pub champion: String,
    pub archetype: Archetype,
    pub signals: Vec<LiveSignal>,
}

/// How urgently a focus target should be prioritized in fights (PROJECT_SPEC §5.2 — advisory).
/// Derived data-drivenly from enemy archetypes + live signals; never from champion identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FocusPriority {
    /// The single highest-value kill target.
    Primary,
    /// The next target down — worth focusing if the primary is unreachable.
    Secondary,
}

/// One "who to focus in fights" suggestion: an enemy to prioritize, how urgently, and why. The
/// `champion` is a display value echoed from the live profile — not a control-flow branch.
/// Mirrors `FocusTarget` in `src/types.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusTarget {
    pub champion: String,
    pub priority: FocusPriority,
    /// Generated rationale, framed for the player's own archetype (e.g. "Delete Zed — …").
    pub reason: String,
}

/// The full recommendation payload — the `recommendation-updated` event body (PROJECT_SPEC §4.2).
/// Mirrors `Recommendation` in `src/types.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recommendation {
    pub self_champion: String,
    /// Ordered I1→I6 path; the first not-`owned` step is the next purchase.
    pub build_path: Vec<BuildStep>,
    pub swaps: Vec<SwapSuggestion>,
    pub threats: Vec<EnemyThreatView>,
    /// Who to prioritize in fights (1–2 targets), framed for the player's archetype.
    pub focus: Vec<FocusTarget>,
    /// Which ability to level next (skill-order coach), or `None` when DDragon/live data is
    /// insufficient or the champion has no authored skill plan.
    pub skill: Option<SkillAdvice>,
}

/// One of the four ability slots, in canonical Live Client order: Q/W/E = basic abilities,
/// R = ultimate. These are *slots*, not keybinds — the displayed key is a frontend setting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum AbilitySlot {
    Q,
    W,
    E,
    R,
}

/// Skill-order advice for the active player: the next ability to rank up (PROJECT_SPEC §1.3 —
/// data-driven, advisory only). Mirrors `SkillAdvice` in `src/types.ts`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillAdvice {
    /// The slot to put the next point in.
    pub slot: AbilitySlot,
    /// That ability's display name from the Live Client (e.g. "Spirit Rush"); empty if unknown.
    pub ability_name: String,
    /// True when a point is unspent *right now* (champion level > points spent) — the cue to
    /// emphasize "level up now"; false means this is the look-ahead for the next level.
    pub point_available: bool,
    /// The champion level this pick is for (current level if a point is waiting, else the next).
    pub at_level: u32,
    /// Generated rationale (e.g. "Take your ultimate", "Max Q first", "Unlock W").
    pub reason: String,
}
