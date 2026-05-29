//! Data-driven rule set (PROJECT_SPEC §5.3 Tier A; `.claude/rust.md`).
//!
//! All champion/item/patch knowledge the engine reasons over lives in `data/*.json` and is parsed
//! here, once, into typed lookups keyed by abstract attributes. The engine never sees the raw JSON
//! or branches on a champion name / item id — it asks this module "what archetype is this champion?",
//! "what intents does this item carry?", "what counters this condition?" and reasons over the
//! answers. Adding a champion/item/patch is an edit to the JSON, never a code change.
//!
//! The default rule set is embedded at compile time (`include_str!`) so the engine stays I/O-free
//! and snapshot tests run offline. A bad edit fails the build / a single test, not the running app.

use crate::model::engine::{AbilitySlot, Archetype, DamageType, IntentTag, LiveSignal};
use crate::model::gank::GankStyle;
use serde::Deserialize;
use std::collections::HashMap;

const CHAMPION_PROFILES_JSON: &str = include_str!("data/champion_profiles.json");
const ITEM_INTENTS_JSON: &str = include_str!("data/item_intents.json");
const COUNTERS_JSON: &str = include_str!("data/counters.json");
const SKILL_ORDERS_JSON: &str = include_str!("data/skill_orders.json");
const ABILITY_DAMAGE_JSON: &str = include_str!("data/ability_damage.json");
const JUNGLE_TIMINGS_JSON: &str = include_str!("data/jungle_timings.json");

/// A condition the enemy team can exhibit that pulls the build toward certain intent-tags. The
/// engine derives the *active* set from a [`crate::model::TeamThreat`]; this enum is the join key
/// between that derivation and `counters.json`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CounterCondition {
    PhysicalHeavy,
    MagicHeavy,
    HealthStacking,
    ArmorStacking,
    MrStacking,
    Lethality,
    HasSustain,
    HardCc,
    Mobility,
    FedAssassin,
}

/// Per-champion knowledge: static archetype/damage plus facts (CC, mobility) not readable from
/// items, and — for champions we author as the player — a build graph.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChampionProfile {
    pub archetype: Archetype,
    pub damage_type: DamageType,
    #[serde(default)]
    pub cc: bool,
    #[serde(default)]
    pub mobility: bool,
    #[serde(default)]
    pub build_graph: Option<BuildGraph>,
}

/// A champion's viable items (PROJECT_SPEC §1.3 "per-champion build graph"). `anchors` are always
/// taken in order; `boots` and `candidates` are chosen situationally by the ranker.
#[derive(Debug, Clone, Deserialize)]
pub struct BuildGraph {
    pub anchors: Vec<u32>,
    pub boots: Vec<u32>,
    pub candidates: Vec<u32>,
}

/// Per-item knowledge. `intent_tags` say what the item is *for*; `grants_signals` say what owning
/// it reveals about an *enemy* (e.g. Sunfire ⇒ `health-stacking`); `is_boots` guards the boots
/// slot against a mis-listed id.
///
/// (`damageType` keys in the JSON are documentation for now — the engine scores purely on
/// `intent_tags` and derives enemy damage type from the champion profile, not the item — so the
/// field is intentionally not deserialized here; serde ignores the extra key.)
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemIntent {
    pub name: String,
    #[serde(default)]
    pub total_cost: u32,
    #[serde(default)]
    pub is_boots: bool,
    #[serde(default)]
    pub intent_tags: Vec<IntentTag>,
    #[serde(default)]
    pub grants_signals: Vec<LiveSignal>,
}

/// One counter rule: when `condition` is active, items with `prefer` tags score higher and `reason`
/// explains why. `weight` is the condition's base pull.
#[derive(Debug, Clone, Deserialize)]
pub struct CounterRule {
    #[serde(rename = "when")]
    pub condition: CounterCondition,
    pub weight: f32,
    pub prefer: Vec<IntentTag>,
    pub reason: String,
}

/// A champion's skill-order plan: the priority for *maxing* the basic abilities (PROJECT_SPEC
/// §1.3). Universal rules (unlock each ability early, ultimate at 6/11/16) live in the engine, not
/// here — only the per-champion maxing priority is data.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPlan {
    /// Basic abilities in maxing priority, highest first (e.g. `[Q, W, E]`).
    pub max_order: Vec<AbilitySlot>,
}

/// Which live offensive stat a spell's ratio scales off (the durability estimator's ratio source).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RatioStat {
    Ap,
    Ad,
}

/// One damage component of an ability: its base-by-rank table, the live stat its `ratio` scales
/// off, and the resist it's mitigated by (`damage_type`). The estimator mitigates each component by
/// its own resist, so a hybrid spell's true-damage portion is never wrongly reduced by MR/armor.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DamageComponent {
    pub damage_type: DamageType,
    pub ratio_stat: RatioStat,
    pub ratio: f32,
    pub base_by_rank: Vec<f32>,
}

/// Approximate primary-nuke damage for the casts-to-kill ESTIMATE (advisory; see the JSON
/// `_comment`). `base_by_rank` is the spell's approximate total base damage at ranks 1–5; `ratio`
/// scales off `ratio_stat`. Deliberately approximate; adding a champion is an edit to the JSON.
///
/// `secondary` is an optional second damage component for genuinely **hybrid** abilities (e.g. a
/// spell that deals magic on the way out and true on the return). It is `None` for the vast
/// majority of single-type abilities, so existing entries need no change. When present, the
/// estimator adds its post-mitigation damage to the primary's — each mitigated by its own resist.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AbilityDamage {
    pub slot: AbilitySlot,
    pub damage_type: DamageType,
    pub ratio_stat: RatioStat,
    pub ratio: f32,
    pub base_by_rank: Vec<f32>,
    #[serde(default)]
    pub secondary: Option<DamageComponent>,
}

#[derive(Debug, Deserialize)]
struct ChampionFile {
    champions: HashMap<String, ChampionProfile>,
}

#[derive(Debug, Deserialize)]
struct AbilityDamageFile {
    champions: HashMap<String, AbilityDamage>,
}

#[derive(Debug, Deserialize)]
struct SkillFile {
    champions: HashMap<String, SkillPlan>,
}

#[derive(Debug, Deserialize)]
struct ItemFile {
    items: HashMap<u32, ItemIntent>,
}

#[derive(Debug, Deserialize)]
struct CounterFile {
    counters: Vec<CounterRule>,
}

#[derive(Debug, Deserialize)]
struct JungleTimingsFile {
    junglers: HashMap<String, GankStyle>,
}

/// The parsed, in-memory rule set the engine queries. Built once via [`RuleSet::load`].
#[derive(Debug, Clone)]
pub struct RuleSet {
    champions: HashMap<String, ChampionProfile>,
    items: HashMap<u32, ItemIntent>,
    counters: Vec<CounterRule>,
    skill_orders: HashMap<String, SkillPlan>,
    ability_damage: HashMap<String, AbilityDamage>,
    /// Enemy-jungler gank-style by Live Client `championName`, for the gank-window alert.
    jungle_timings: HashMap<String, GankStyle>,
}

impl RuleSet {
    /// Parses the embedded default rule set. Errors (with a `serde_json` message) only on malformed
    /// data — i.e. a bad edit to the bundled JSON, caught by tests, never at runtime on good data.
    pub fn load() -> Result<Self, serde_json::Error> {
        let champions: ChampionFile = serde_json::from_str(CHAMPION_PROFILES_JSON)?;
        let items: ItemFile = serde_json::from_str(ITEM_INTENTS_JSON)?;
        let counters: CounterFile = serde_json::from_str(COUNTERS_JSON)?;
        let skills: SkillFile = serde_json::from_str(SKILL_ORDERS_JSON)?;
        let ability_damage: AbilityDamageFile = serde_json::from_str(ABILITY_DAMAGE_JSON)?;
        let jungle_timings: JungleTimingsFile = serde_json::from_str(JUNGLE_TIMINGS_JSON)?;
        Ok(Self {
            champions: champions.champions,
            items: items.items,
            counters: counters.counters,
            skill_orders: skills.champions,
            ability_damage: ability_damage.champions,
            jungle_timings: jungle_timings.junglers,
        })
    }

    /// The profile for a champion by Live Client `championName`, if authored.
    pub fn champion(&self, name: &str) -> Option<&ChampionProfile> {
        self.champions.get(name)
    }

    /// The intent record for an item id, if authored.
    pub fn item(&self, id: u32) -> Option<&ItemIntent> {
        self.items.get(&id)
    }

    /// The counter rule for a condition, if one is authored.
    pub fn counter(&self, condition: CounterCondition) -> Option<&CounterRule> {
        self.counters.iter().find(|c| c.condition == condition)
    }

    /// The skill-order plan for a champion by Live Client `championName`, if authored.
    pub fn skill_plan(&self, name: &str) -> Option<&SkillPlan> {
        self.skill_orders.get(name)
    }

    /// The approximate primary-nuke ability-damage record for a champion, if authored. Drives the
    /// casts-to-kill estimate; `None` falls back to a raw-HP gauge with no cast count.
    pub fn ability_damage(&self, name: &str) -> Option<&AbilityDamage> {
        self.ability_damage.get(name)
    }

    /// The gank-style for an enemy jungler by Live Client `championName`, defaulting to
    /// [`GankStyle::Standard`] for any champion not listed in `jungle_timings.json` — so the alert
    /// stays purely data-driven and a new jungler is just a data edit.
    pub fn gank_style(&self, champion: &str) -> GankStyle {
        self.jungle_timings
            .get(champion)
            .copied()
            .unwrap_or(GankStyle::Standard)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::gank::GankStyle;

    #[test]
    fn embedded_ruleset_parses() {
        // The bundled JSON must always load — this is the guard against a malformed data edit.
        let rules = RuleSet::load().expect("embedded rule set should parse");

        // A player champion carries a build graph; an enemy-only champion need not.
        let ahri = rules.champion("Ahri").expect("Ahri authored");
        assert_eq!(ahri.archetype, Archetype::BurstMage);
        assert!(ahri.build_graph.is_some());
        assert!(rules.champion("Zed").unwrap().build_graph.is_none());

        // Ability-damage data loads for the casts-to-kill estimate.
        let ahri_dmg = rules.ability_damage("Ahri").expect("Ahri ability damage");
        assert_eq!(ahri_dmg.slot, AbilitySlot::Q);
        assert_eq!(ahri_dmg.damage_type, DamageType::Magic);
        assert_eq!(ahri_dmg.ratio_stat, RatioStat::Ap);
        assert_eq!(ahri_dmg.base_by_rank.len(), 5);

        // Jungle gank-style is data-driven: a listed champion maps, an unlisted one defaults.
        assert_eq!(rules.gank_style("LeeSin"), GankStyle::Early);
        assert_eq!(rules.gank_style("Karthus"), GankStyle::Farming);
        assert_eq!(
            rules.gank_style("Ahri"),
            GankStyle::Standard,
            "unlisted champion defaults to standard"
        );

        // Items map intents and enemy signals.
        assert!(rules
            .item(3157)
            .unwrap()
            .intent_tags
            .contains(&IntentTag::StasisSurvival));
        assert!(rules
            .item(6692)
            .unwrap()
            .grants_signals
            .contains(&LiveSignal::Lethality));

        // Every counter condition the engine can derive has a rule.
        for cond in [
            CounterCondition::FedAssassin,
            CounterCondition::HasSustain,
            CounterCondition::HealthStacking,
            CounterCondition::ArmorStacking,
            CounterCondition::MrStacking,
            CounterCondition::PhysicalHeavy,
            CounterCondition::MagicHeavy,
            CounterCondition::HardCc,
            CounterCondition::Lethality,
            CounterCondition::Mobility,
        ] {
            assert!(
                rules.counter(cond).is_some(),
                "missing counter for {cond:?}"
            );
        }
    }

    #[test]
    fn unknown_intent_tag_does_not_fail_load() {
        // Forward-compat: a tag the engine doesn't know deserializes to `Unknown` (via serde
        // `other`) rather than failing the whole parse.
        #[derive(Deserialize)]
        struct Probe {
            tags: Vec<IntentTag>,
        }
        let probe: Probe = serde_json::from_str(r#"{ "tags": ["antiheal", "brand_new_tag"] }"#)
            .expect("unknown tag tolerated");
        assert_eq!(probe.tags, vec![IntentTag::Antiheal, IntentTag::Unknown]);
    }
}
