//! Typed view of the Live Client `/allgamedata` payload (PROJECT_SPEC §3.1).
//!
//! These are *raw API descriptors*, deserialized **defensively**: every field carries
//! `#[serde(default)]` so a partial or malformed `/allgamedata` (a field Riot renamed, a player
//! mid-spawn with no scores yet) deserializes to sane zero-values instead of panicking
//! (CLAUDE.md "tolerate malformed/missing API fields"; `.claude/rust.md`). The recommendation
//! engine never sees these directly — M3 maps them onto abstract domain types — so nothing here
//! touches the data-driven invariant.

use serde::Deserialize;

/// The whole `/allgamedata` response: active player, the full roster, and game-level stats.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AllGameData {
    /// The local player. Absent on some partial payloads, so optional.
    pub active_player: Option<ActivePlayer>,
    /// Every player in the game (both teams), in the API's order.
    pub all_players: Vec<Player>,
    /// Map / mode / clock.
    pub game_data: GameData,
}

/// The local ("active") player. Carries the gold and identity used to find "us" in `all_players`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ActivePlayer {
    /// Legacy identity field; empty on accounts that only expose a Riot ID.
    pub summoner_name: String,
    /// Newer Riot ID game-name (the part before the `#tag`); preferred when present.
    pub riot_id_game_name: String,
    pub level: u32,
    /// Current gold. Note: only the active player exposes gold, and it is partly inferred
    /// downstream (PROJECT_SPEC §6.4). Deliberately excluded from the poll diff signature since
    /// it ticks up passively every second (see `poll`).
    pub current_gold: f64,
    /// Current ability ranks + names, used by the skill-order coach. Absent on some partial
    /// payloads (defaults to all-zero ranks), so never assume it's populated.
    pub abilities: Abilities,
    /// The active player's live offensive stats, used by the durability / casts-to-kill estimator.
    /// Absent on partial payloads (defaults to all-zero), so never assume it's populated.
    pub champion_stats: ChampionStats,
}

/// The active player's live offensive stats from `/activeplayer` (`championStats`), the inputs to
/// the durability / casts-to-kill estimate. Defensively defaulted to zero throughout.
///
/// The Live Client reports the two `*_percent` pen values as fractions in `0.0..=1.0`, and the flat
/// pen already folds in lethality-derived armor pen, so these map straight onto the estimator's
/// inputs with no conversion.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChampionStats {
    pub ability_power: f32,
    pub attack_damage: f32,
    pub magic_penetration_flat: f32,
    pub magic_penetration_percent: f32,
    pub armor_penetration_flat: f32,
    pub armor_penetration_percent: f32,
}

/// The active player's four abilities, keyed by their fixed **slots** (`Q`/`W`/`E`/`R` = 1st/2nd/
/// 3rd/ultimate). These are slot identifiers, not the player's keybinds — the displayed key is a
/// frontend setting (PROJECT_SPEC: advisory; the Live Client never exposes custom binds).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(default)]
pub struct Abilities {
    #[serde(rename = "Q")]
    pub q: Ability,
    #[serde(rename = "W")]
    pub w: Ability,
    #[serde(rename = "E")]
    pub e: Ability,
    #[serde(rename = "R")]
    pub r: Ability,
}

/// One ability slot: its current rank (0–5; ultimate 0–3) and human display name.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Ability {
    /// Current rank (points invested). 0 = not yet leveled.
    pub ability_level: u32,
    /// Display name (e.g. "Orb of Deception"); locale-dependent, straight from the Live Client.
    pub display_name: String,
}

/// One player row from `allPlayers`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Player {
    /// Display champion name (e.g. `"Ahri"`, `"Wukong"`).
    pub champion_name: String,
    /// Internal champion name (e.g. `"MonkeyKing"`); occasionally the only one populated.
    pub raw_champion_name: String,
    /// Legacy summoner name; may be empty in favor of `riot_id`.
    pub summoner_name: String,
    /// Full Riot ID (`GameName#TAG`) when exposed.
    pub riot_id: String,
    /// `"ORDER"` (blue) or `"CHAOS"` (red).
    pub team: String,
    /// Assigned position (`"TOP"`, `"JUNGLE"`, …); often empty in non-classic modes.
    pub position: String,
    pub level: u32,
    pub is_bot: bool,
    pub is_dead: bool,
    /// Owned items (the live build, the heart of the recommendation input).
    pub items: Vec<Item>,
    pub scores: Scores,
    /// The player's two summoner spells. Used to identify the enemy jungler (the one with Smite)
    /// for the gank-window alert. Defensively defaulted, so a partial payload never panics.
    pub summoner_spells: SummonerSpells,
}

/// A player's two summoner spells, as reported by the Live Client (`summonerSpells`).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SummonerSpells {
    pub summoner_spell_one: SummonerSpell,
    pub summoner_spell_two: SummonerSpell,
}

/// One summoner spell slot; only its display name is needed (e.g. `"Smite"`, `"Flash"`).
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SummonerSpell {
    /// Display name (locale-dependent), straight from the Live Client.
    pub display_name: String,
}

/// One owned item slot.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Item {
    /// Numeric DDragon item ID — resolve to metadata via the DDragon layer.
    ///
    /// The Live Client sends this as `itemID` (capital `ID`), which is *not* what `camelCase`
    /// derives (`itemId`), so it needs an explicit rename — otherwise every id silently parses to
    /// `0`. (Surfaced by the M3 engine fixtures.)
    #[serde(rename = "itemID")]
    pub item_id: u32,
    /// Stack count (e.g. multiple control wards / pots in one slot).
    pub count: u32,
    /// Inventory slot index (0–6).
    pub slot: u32,
    pub display_name: String,
}

/// A player's scoreline.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Scores {
    pub kills: u32,
    pub deaths: u32,
    pub assists: u32,
    pub creep_score: u32,
    pub ward_score: f64,
}

/// Game-level stats from `gameData`.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GameData {
    pub game_mode: String,
    /// Seconds since game start.
    pub game_time: f64,
    pub map_name: String,
    pub map_number: u32,
}

impl AllGameData {
    /// Finds the local player's row in `all_players`, matching on the active player's identity.
    ///
    /// Matches the Riot ID first (the modern, stable identifier), then falls back to the legacy
    /// summoner name. Returns `None` if there is no active player or no row matches (e.g. a
    /// spectated game).
    pub fn self_player(&self) -> Option<&Player> {
        let active = self.active_player.as_ref()?;
        self.all_players.iter().find(|p| {
            (!active.riot_id_game_name.is_empty()
                && p.riot_id_game_name() == active.riot_id_game_name)
                || (!active.summoner_name.is_empty() && p.summoner_name == active.summoner_name)
        })
    }

    /// The players on the enemy team relative to the local player. Empty if "us" can't be found.
    ///
    /// Part of the M2 "identify the player's champion and all enemies" surface; the M3 engine is
    /// its first non-test consumer.
    #[allow(dead_code)]
    pub fn enemies(&self) -> Vec<&Player> {
        match self.self_player() {
            Some(me) if !me.team.is_empty() => self
                .all_players
                .iter()
                .filter(|p| !p.team.is_empty() && p.team != me.team)
                .collect(),
            _ => Vec::new(),
        }
    }

    /// The local player's champion display name, if identifiable.
    pub fn self_champion(&self) -> Option<&str> {
        self.self_player().map(|p| p.champion_name.as_str())
    }
}

impl Player {
    /// The game-name portion of this player's Riot ID (text before `#`), for matching against
    /// the active player's `riot_id_game_name`.
    fn riot_id_game_name(&self) -> &str {
        self.riot_id
            .split_once('#')
            .map(|(name, _)| name)
            .unwrap_or(&self.riot_id)
    }

    /// Whether this row refers to the same player as `other`, matched by Riot ID (preferred) then
    /// legacy summoner name — the same identity logic [`AllGameData::self_player`] uses. Lets
    /// consumers exclude "us" from a roster by identity rather than by fragile pointer equality.
    pub fn is_same_player(&self, other: &Player) -> bool {
        (!other.riot_id_game_name().is_empty()
            && self.riot_id_game_name() == other.riot_id_game_name())
            || (!other.summoner_name.is_empty() && self.summoner_name == other.summoner_name)
    }

    /// Whether this player has Smite on either summoner-spell slot (case-insensitive). The signal
    /// the gank-window alert uses to identify the enemy jungler, since the Live Client never
    /// exposes the map or a "role" beyond the (often empty) `position` field.
    pub fn has_smite(&self) -> bool {
        let has = |s: &SummonerSpell| s.display_name.to_lowercase().contains("smite");
        has(&self.summoner_spells.summoner_spell_one)
            || has(&self.summoner_spells.summoner_spell_two)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = include_str!("fixtures/allgamedata.json");

    #[test]
    fn parses_captured_allgamedata() {
        let data: AllGameData = serde_json::from_str(SAMPLE).expect("fixture should parse");
        assert_eq!(data.all_players.len(), 10);
        assert_eq!(data.game_data.game_mode, "CLASSIC");
        let active = data.active_player.as_ref().unwrap();
        assert_eq!(active.riot_id_game_name, "Faker");
    }

    #[test]
    fn identifies_self_and_enemies() {
        let data: AllGameData = serde_json::from_str(SAMPLE).unwrap();
        let me = data.self_player().expect("active player is in the roster");
        assert_eq!(me.champion_name, "Ahri");
        assert_eq!(data.self_champion(), Some("Ahri"));

        let enemies = data.enemies();
        assert_eq!(enemies.len(), 5);
        // Everyone classified as an enemy is on the opposite team.
        assert!(enemies.iter().all(|e| e.team != me.team));
    }

    #[test]
    fn self_match_falls_back_to_summoner_name() {
        // Older accounts expose only the legacy summonerName (no Riot ID). The active player must
        // still be findable via that fallback branch.
        let json = r#"{
            "activePlayer": { "summonerName": "LegacyName", "riotIdGameName": "" },
            "allPlayers": [
                { "championName": "Ahri", "summonerName": "LegacyName", "riotId": "", "team": "ORDER" },
                { "championName": "Zed", "summonerName": "Other", "riotId": "", "team": "CHAOS" }
            ]
        }"#;
        let data: AllGameData = serde_json::from_str(json).unwrap();
        assert_eq!(data.self_champion(), Some("Ahri"));
        assert_eq!(data.enemies().len(), 1);
    }

    #[test]
    fn tolerates_a_partial_payload() {
        // A nearly-empty object (e.g. a payload Riot trimmed) must not panic — every field
        // falls back to its default.
        let data: AllGameData = serde_json::from_str("{}").unwrap();
        assert!(data.active_player.is_none());
        assert!(data.all_players.is_empty());
        assert_eq!(data.game_data.game_time, 0.0);
        assert!(data.self_player().is_none());
        assert!(data.enemies().is_empty());
    }

    #[test]
    fn detects_smite_jungler() {
        // A player carrying Smite (in either slot, any casing) is detected as the jungler.
        let json = r#"{ "allPlayers": [
            { "championName": "LeeSin", "summonerSpells": {
                "summonerSpellOne": { "displayName": "Flash" },
                "summonerSpellTwo": { "displayName": "Smite" } } },
            { "championName": "Ahri", "summonerSpells": {
                "summonerSpellOne": { "displayName": "Flash" },
                "summonerSpellTwo": { "displayName": "Ignite" } } }
        ] }"#;
        let data: AllGameData = serde_json::from_str(json).unwrap();
        assert!(data.all_players[0].has_smite(), "Lee Sin has Smite");
        assert!(!data.all_players[1].has_smite(), "Ahri has no Smite");
        // A player with no summoner-spell data must not panic or false-positive.
        let bare: AllGameData =
            serde_json::from_str(r#"{ "allPlayers": [ { "championName": "Teemo" } ] }"#).unwrap();
        assert!(!bare.all_players[0].has_smite());
    }

    #[test]
    fn tolerates_missing_player_fields() {
        // A player row with only a champion name — no scores, items, team — still parses.
        let json = r#"{ "allPlayers": [ { "championName": "Teemo" } ] }"#;
        let data: AllGameData = serde_json::from_str(json).unwrap();
        let p = &data.all_players[0];
        assert_eq!(p.champion_name, "Teemo");
        assert_eq!(p.scores.kills, 0);
        assert!(p.items.is_empty());
    }
}
