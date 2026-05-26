import type { Archetype, LiveSignal } from "@/types";

/**
 * Human-readable text for the engine's abstract enums. Kept here (not in components) so the
 * threat board, toasts, and any future surface render identical wording, and so the pure toast
 * diff can build sentences without importing component code.
 *
 * Per `.claude/frontend.md`, color is never the only signal: components pair these labels with a
 * color *and* an icon. This module owns the words; the components own the color + icon.
 */

/** Short chip label for an enemy's static role. */
export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  assassin: "Assassin",
  marksman: "Marksman",
  "burst-mage": "Burst mage",
  battlemage: "Battlemage",
  artillery: "Artillery",
  bruiser: "Bruiser",
  juggernaut: "Juggernaut",
  tank: "Tank",
  enchanter: "Enchanter",
  catcher: "Catcher",
};

/**
 * One-sentence explanation of an archetype's playstyle and how to deal with it. Surfaced as the
 * hover tooltip on each enemy's archetype pill.
 */
export const ARCHETYPE_DESCRIPTION: Record<Archetype, string> = {
  assassin:
    "Bursts squishy carries with high single-target damage, then escapes. Fragile when caught — watch flanks and ward.",
  marksman:
    "Sustained ranged auto-attack DPS; very fragile. Punish with dive or CC, and peel for your own carries.",
  "burst-mage":
    "Detonates a combo for heavy magic burst. Magic resist and dodging the key skillshot blunt them.",
  battlemage:
    "Sustained AoE magic damage at mid-range; wants to stay in the fight. Poke them down or burst them first.",
  artillery:
    "Long-range poke that whittles you down before fights start. Close the gap or use terrain to break line of sight.",
  bruiser:
    "Durable fighter with sustained damage; thrives in extended brawls. Percent-HP damage and kiting help.",
  juggernaut:
    "Extremely tanky and high-damage but slow and immobile. Kite, peel, and never sit in prolonged melee.",
  tank: "Soaks damage and starts fights with CC. Don't focus them — hit the carries behind them.",
  enchanter:
    "Buffs, heals, and shields allies. Anti-heal and bursting them removes their team's safety net.",
  catcher:
    "Lands picks with hooks/CC to open fights. Respect the skillshots and ward likely flank routes.",
};

/** Compact badge label for a live signal (what the enemy is *doing now*). */
export const SIGNAL_LABEL: Record<LiveSignal, string> = {
  "health-stacking": "Stacking HP",
  "armor-stacking": "Stacking armor",
  "mr-stacking": "Stacking MR",
  lethality: "Lethality",
  "has-sustain": "Healing",
  "hard-cc": "Hard CC",
  mobility: "Mobility",
  fed: "Fed",
};

/**
 * One-sentence explanation of what a live signal means and how to play around it. Surfaced as the
 * hover tooltip on each threat-board signal pill so the *why* behind the build is self-explaining.
 */
export const SIGNAL_DESCRIPTION: Record<LiveSignal, string> = {
  "health-stacking":
    "Building raw health to survive burst. Percent-max-HP damage (on-hit, %HP items) hurts them far more than flat damage.",
  "armor-stacking":
    "Stacking armor to blunt physical (AD) damage. Counter with armor penetration / %armor pen, or pivot to magic damage.",
  "mr-stacking":
    "Stacking magic resist against magic (AP) damage. Counter with magic penetration, or lean on your physical threats.",
  lethality:
    "Building lethality / flat armor pen — they delete low-armor targets. Squishies should add armor or play at range.",
  "has-sustain":
    "Heavy healing or lifesteal keeps them topped up. Grievous Wounds (anti-heal) roughly halves it — buy it early.",
  "hard-cc":
    "They bring reliable hard crowd control (stuns, roots, knock-ups). Tenacity, QSS/Mercurial, or spacing reduce it.",
  mobility:
    "High mobility (dashes/blinks) makes them hard to pin. Point-and-click CC and zoning beat skillshots here.",
  fed: "Snowballing ahead in gold and kills — their damage is outsized. Group up, deny picks, and itemize defensively against them.",
};

/** Verb phrase for a signal, used in toast sentences ("Enemy Zed is building lethality"). */
export const SIGNAL_PHRASE: Record<LiveSignal, string> = {
  "health-stacking": "stacking health",
  "armor-stacking": "stacking armor",
  "mr-stacking": "stacking magic resist",
  lethality: "building lethality",
  "has-sustain": "gaining sustain",
  "hard-cc": "bringing hard CC",
  mobility: "gaining mobility",
  fed: "snowballing",
};
