import {
  Flame,
  Heart,
  HeartPulse,
  Shield,
  Sparkles,
  Swords,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { SIGNAL_LABEL } from "@/lib/labels";
import type { LiveSignal } from "@/types";

/**
 * Per-signal visual treatment for the threat board. Each badge pairs a **color**, an **icon**, and
 * the text label from `SIGNAL_LABEL` — color is never the only signal (`.claude/frontend.md`,
 * PROJECT_SPEC §6.5). Colors are tinted bg + readable foreground, grouped by what the signal means
 * (defensive stacking = sky, offensive burst = rose, sustain = emerald, CC = amber, …).
 */
export interface SignalVisual {
  label: string;
  Icon: LucideIcon;
  /** Tailwind classes for the badge: tinted background, border, and readable text. */
  className: string;
}

const DEFENSE = "bg-sky-500/15 text-sky-300 border-sky-500/30";

export const SIGNAL_VISUALS: Record<LiveSignal, SignalVisual> = {
  "health-stacking": {
    label: SIGNAL_LABEL["health-stacking"],
    Icon: Heart,
    className: DEFENSE,
  },
  "armor-stacking": {
    label: SIGNAL_LABEL["armor-stacking"],
    Icon: Shield,
    className: DEFENSE,
  },
  "mr-stacking": {
    label: SIGNAL_LABEL["mr-stacking"],
    Icon: Sparkles,
    className: DEFENSE,
  },
  lethality: {
    label: SIGNAL_LABEL.lethality,
    Icon: Swords,
    className: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
  "has-sustain": {
    label: SIGNAL_LABEL["has-sustain"],
    Icon: HeartPulse,
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  "hard-cc": {
    label: SIGNAL_LABEL["hard-cc"],
    Icon: Zap,
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  mobility: {
    label: SIGNAL_LABEL.mobility,
    Icon: Wind,
    className: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  },
  fed: {
    label: SIGNAL_LABEL.fed,
    Icon: Flame,
    className: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  },
};
