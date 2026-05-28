import { HelpCircle, Skull, Trophy, type LucideIcon } from "lucide-react";

import type { MatchEvent, MatchResult } from "@/types";

/** Formats a duration in seconds as `m:ss` (e.g. 1694 → "28:14"). */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * A compact relative date ("just now", "5m ago", "3d ago"), falling back to an absolute month/day
 * past a week. `now` is injectable for deterministic tests.
 */
export function formatRelativeDate(
  ms: number,
  now: number = Date.now(),
): string {
  const sec = Math.round((now - ms) / 1000);
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const MODE_LABELS: Record<string, string> = {
  CLASSIC: "Summoner's Rift",
  ARAM: "ARAM",
  CHERRY: "Arena",
  URF: "URF",
  NEXUSBLITZ: "Nexus Blitz",
  TUTORIAL: "Tutorial",
  PRACTICETOOL: "Practice Tool",
};

/** Human-friendly game-mode label, falling back to the raw mode string. */
export function formatGameMode(mode: string): string {
  return MODE_LABELS[mode] ?? mode;
}

/** Standard "k / d / a" scoreline. */
export function formatKda(
  kills: number,
  deaths: number,
  assists: number,
): string {
  return `${kills} / ${deaths} / ${assists}`;
}

/**
 * Display treatment for a match result — color is always paired with a text label + icon, never
 * color alone (PROJECT_SPEC §6.5 / frontend.md).
 */
export const RESULT_VISUAL: Record<
  MatchResult,
  { label: string; Icon: LucideIcon; className: string }
> = {
  win: {
    label: "Win",
    Icon: Trophy,
    className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  },
  loss: {
    label: "Loss",
    Icon: Skull,
    className: "border-rose-500/30 bg-rose-500/15 text-rose-300",
  },
  unknown: {
    label: "Unknown",
    Icon: HelpCircle,
    className: "border-border bg-muted text-muted-foreground",
  },
};

/**
 * A short, human-readable line for one game event (kill / objective / game end). The killer/victim
 * fields are Riot IDs ("Name#TAG") or summoner names — we strip the tag for display. Returns `null`
 * for events with nothing worth showing in the log (e.g. MinionsSpawning).
 */
export function describeEvent(ev: MatchEvent): string | null {
  const name = (s?: string) => (s ? s.split("#")[0] : "");
  switch (ev.kind) {
    case "GameStart":
      return "Game start";
    case "GameEnd":
      return "Game end";
    case "FirstBlood":
      return ev.recipient
        ? `First blood — ${name(ev.recipient)}`
        : "First blood";
    case "ChampionKill":
      return `${name(ev.killer)} killed ${name(ev.victim)}`;
    case "Multikill":
      return ev.killer ? `${name(ev.killer)} multikill` : "Multikill";
    case "Ace":
      return ev.recipient ? `Ace — ${name(ev.recipient)}` : "Ace";
    case "DragonKill": {
      const which = ev.dragonType ? `${ev.dragonType} Dragon` : "Dragon";
      const stolen = ev.stolen ? " (stolen)" : "";
      return `${name(ev.killer)} took ${which}${stolen}`;
    }
    case "HeraldKill":
      return `${name(ev.killer)} took Rift Herald`;
    case "BaronKill": {
      const stolen = ev.stolen ? " (stolen)" : "";
      return `${name(ev.killer)} took Baron${stolen}`;
    }
    case "TurretKilled":
      return `${name(ev.killer)} destroyed a turret`;
    case "InhibKilled":
      return `${name(ev.killer)} destroyed an inhibitor`;
    case "FirstBrick":
      return "First turret destroyed";
    default:
      return null;
  }
}
