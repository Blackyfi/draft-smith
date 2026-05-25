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
