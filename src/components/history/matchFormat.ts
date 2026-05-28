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
 * Resolves a raw event actor string (a Riot ID, summoner name, or join key) to the champion display
 * name to show after their name, e.g. `"Foe#EUW"` → `"Zed"`. Returns `undefined`/empty for
 * non-player actors (turrets, minions) so they render with no parenthetical.
 */
export type ChampionResolver = (name: string) => string | undefined;

/**
 * A short, human-readable line for one game event (kill / objective / game end). The killer/victim
 * fields are Riot IDs ("Name#TAG") or summoner names — we strip the tag for display. When
 * `championOf` is supplied, each player name is annotated with their champion in parentheses
 * (e.g. "Me (Ahri) killed Foe (Zed)"); without it, names render bare (the original behavior).
 * Returns `null` for events with nothing worth showing in the log (e.g. MinionsSpawning).
 */
export function describeEvent(
  ev: MatchEvent,
  championOf?: ChampionResolver,
): string | null {
  // Strip the "#TAG", then append " (Champion)" when a resolver maps this actor to a champion.
  const label = (s?: string) => {
    if (!s) return "";
    const display = s.split("#")[0];
    const champ = championOf?.(s);
    return champ ? `${display} (${champ})` : display;
  };
  switch (ev.kind) {
    case "GameStart":
      return "Game start";
    case "GameEnd":
      return "Game end";
    case "FirstBlood":
      return ev.recipient
        ? `First blood — ${label(ev.recipient)}`
        : "First blood";
    case "ChampionKill":
      return `${label(ev.killer)} killed ${label(ev.victim)}`;
    case "Multikill":
      return ev.killer ? `${label(ev.killer)} multikill` : "Multikill";
    case "Ace":
      return ev.recipient ? `Ace — ${label(ev.recipient)}` : "Ace";
    case "DragonKill": {
      const which = ev.dragonType ? `${ev.dragonType} Dragon` : "Dragon";
      const stolen = ev.stolen ? " (stolen)" : "";
      return `${label(ev.killer)} took ${which}${stolen}`;
    }
    case "HeraldKill":
      return `${label(ev.killer)} took Rift Herald`;
    case "BaronKill": {
      const stolen = ev.stolen ? " (stolen)" : "";
      return `${label(ev.killer)} took Baron${stolen}`;
    }
    case "TurretKilled":
      return `${label(ev.killer)} destroyed a turret`;
    case "InhibKilled":
      return `${label(ev.killer)} destroyed an inhibitor`;
    case "FirstBrick":
      return "First turret destroyed";
    default:
      return null;
  }
}
