import {
  Activity,
  AlertTriangle,
  FlameKindling,
  Heart,
  HeartPulse,
  Shield,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Swords,
  Target,
  Timer,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";

import type { IntentTag } from "@/types";

/**
 * Per-intent-tag visual treatment for the Enemy Items panel. Each pill pairs a **color**, an
 * **icon**, and a text label — color is never the only signal (`.claude/frontend.md`,
 * PROJECT_SPEC §6.5). Grouped by strategic meaning (defense = blue/slate; sustain = emerald;
 * antiheal = rose; penetration = amber; offense = violet; move speed = cyan; utility = teal).
 */
export interface IntentVisual {
  label: string;
  Icon: LucideIcon;
  /** Tailwind classes: tinted background, border, readable text — dark-first tokens. */
  className: string;
  /** One-sentence description surfaced as tooltip text. */
  description: string;
}

// Color groups
const DEFENSE = "bg-sky-500/15 text-sky-300 border-sky-500/30";
const SUSTAIN = "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
const ANTIHEAL = "bg-rose-500/15 text-rose-300 border-rose-500/30";
const PEN = "bg-amber-500/15 text-amber-300 border-amber-500/30";
const OFFENSE = "bg-violet-500/15 text-violet-300 border-violet-500/30";
const SPEED = "bg-cyan-500/15 text-cyan-300 border-cyan-500/30";
const UTILITY = "bg-teal-500/15 text-teal-300 border-teal-500/30";

export const INTENT_VISUALS: Partial<Record<IntentTag, IntentVisual>> = {
  magic_pen_flat: {
    label: "Magic pen",
    Icon: Target,
    className: PEN,
    description:
      "Flat magic penetration — reduces magic resist on low-MR targets like squishies.",
  },
  magic_pen_percent: {
    label: "Magic pen",
    Icon: Target,
    className: PEN,
    description:
      "Percent magic penetration — effective against anyone stacking magic resist.",
  },
  armor_pen_flat: {
    label: "Armor pen",
    Icon: ShieldOff,
    className: PEN,
    description:
      "Flat armor penetration — removes a set amount of armor, best vs low-armor targets.",
  },
  armor_pen_percent: {
    label: "Armor pen",
    Icon: ShieldOff,
    className: PEN,
    description:
      "Percent armor penetration — shreds a portion of armor, scales best vs heavy-armor builds.",
  },
  lethality: {
    label: "Lethality",
    Icon: Swords,
    className: PEN,
    description:
      "Lethality (flat armor pen) — they delete low-armor targets. Build armor or play at range.",
  },
  percent_hp_damage: {
    label: "%HP dmg",
    Icon: Activity,
    className: PEN,
    description:
      "Percent max-HP damage — scales with your HP pool. Building raw health makes you a bigger target for this.",
  },
  burst_amp: {
    label: "AP power",
    Icon: Sparkles,
    className: OFFENSE,
    description:
      "Amplifies ability power burst — increases the damage ceiling of their combo.",
  },
  ability_haste: {
    label: "Haste",
    Icon: Timer,
    className: OFFENSE,
    description:
      "Ability haste — reduces cooldowns, letting them cast more abilities per fight.",
  },
  crit: {
    label: "Crit",
    Icon: Zap,
    className: OFFENSE,
    description:
      "Critical strike — random auto-attack multiplier; dangerous once they stack multiple crit items.",
  },
  on_hit: {
    label: "On-hit",
    Icon: FlameKindling,
    className: OFFENSE,
    description:
      "On-hit effects — each auto-attack applies bonus magic or physical damage. Health and armor both help.",
  },
  stasis_survival: {
    label: "Stasis",
    Icon: ShieldCheck,
    className: UTILITY,
    description:
      "Grants untargetable stasis (e.g. Zhonya's). They can dodge your key burst window — time damage carefully.",
  },
  spellshield: {
    label: "Spell shield",
    Icon: Shield,
    className: UTILITY,
    description:
      "Spell shield blocks one ability — wait for it to proc before using your most important skillshot.",
  },
  antiheal: {
    label: "Anti-heal",
    Icon: AlertTriangle,
    className: ANTIHEAL,
    description:
      "Grievous Wounds — reduces your healing by ~40%. Their anti-heal counters your sustain.",
  },
  armor_self: {
    label: "Armor",
    Icon: Shield,
    className: DEFENSE,
    description:
      "Building armor to resist physical (AD) damage. Counter with armor pen or magic damage.",
  },
  mr_self: {
    label: "Magic resist",
    Icon: Sparkles,
    className: DEFENSE,
    description:
      "Building magic resist against AP damage. Counter with magic penetration or physical damage.",
  },
  health_self: {
    label: "Health",
    Icon: Heart,
    className: DEFENSE,
    description:
      "Stacking raw HP. Percent-HP damage and true damage both scale into this effectively.",
  },
  lifesteal: {
    label: "Lifesteal",
    Icon: HeartPulse,
    className: SUSTAIN,
    description:
      "Lifesteal from auto-attacks — their HP refills as they fight. Anti-heal counters this.",
  },
  omnivamp: {
    label: "Omnivamp",
    Icon: HeartPulse,
    className: SUSTAIN,
    description:
      "Omnivamp heals on all damage types — ability hits included. Anti-heal is your best answer.",
  },
  sustain: {
    label: "Sustain",
    Icon: HeartPulse,
    className: SUSTAIN,
    description:
      "General sustain — healing from abilities or passives that keeps them healthy through trades.",
  },
  move_speed: {
    label: "Move speed",
    Icon: Wind,
    className: SPEED,
    description:
      "Movement speed — harder to kite or escape. Point-and-click CC and zoning help.",
  },
  // "unknown" is intentionally omitted; Rust filters it before emission but we skip it defensively.
};

/**
 * Safe lookup: returns the visual definition for a tag, or `undefined` for "unknown" / any tag
 * not yet mapped. Callers should skip rendering when `undefined`.
 */
export function intentVisual(tag: IntentTag): IntentVisual | undefined {
  if (tag === "unknown") return undefined;
  return INTENT_VISUALS[tag];
}

/**
 * Human-readable label for a tag group header, used for aria descriptions.
 * Exported for testing; components use INTENT_VISUALS directly.
 */
export const INTENT_LABEL: Partial<Record<IntentTag, string>> =
  Object.fromEntries(
    Object.entries(INTENT_VISUALS).map(([k, v]) => [k, v.label]),
  ) as Partial<Record<IntentTag, string>>;
