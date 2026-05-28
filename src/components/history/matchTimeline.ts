//! Pure, deterministic helpers that reconstruct a recorded match's state at an arbitrary point in
//! time `t` (seconds of game time) for the Match Detail replay scrubber. No React, no I/O — same
//! inputs always yield the same output, so each is unit-testable in isolation.
//!
//! These reconstruct *display* state from the facts already in a `MatchRecord`; they are presentation
//! logic, not the recommendation engine, and touch neither it nor its data-driven invariant.

import type {
  DiagnosticSnapshot,
  ItemEvent,
  LevelEvent,
  MatchEvent,
  MatchPlayer,
} from "@/types";

/** One owned item at a point in time — the subset of {@link ItemEvent} the UI needs to render. */
export interface OwnedItem {
  id: number;
  name: string;
}

/** A running scoreline (kills / deaths / assists) at a point in time. */
export interface RunningScore {
  kills: number;
  deaths: number;
  assists: number;
}

/** A notable event placed on the scrubber track. */
export interface EventMarker {
  time: number;
  kind: "kill" | "objective" | "structure";
}

/**
 * Reconstructs one player's item inventory as of game time `t`: folds every {@link ItemEvent} with
 * `gameTime <= t` in order, adding ids on `acquired` and dropping them on `removed`. Dedupes by id
 * and preserves first-acquired order — mirroring the presence-based set the recorder diffs on
 * (`recorder.rs`), so an item id appears at most once.
 */
export function inventoryAt(
  itemTimeline: ItemEvent[],
  playerKey: string,
  t: number,
): OwnedItem[] {
  // Insertion-ordered map keyed by item id; re-acquiring an existing id is a no-op (set semantics).
  const owned = new Map<number, OwnedItem>();
  for (const e of itemTimeline) {
    if (e.playerKey !== playerKey || e.gameTime > t) continue;
    if (e.kind === "acquired") {
      if (!owned.has(e.itemId)) {
        owned.set(e.itemId, { id: e.itemId, name: e.name });
      }
    } else {
      owned.delete(e.itemId);
    }
  }
  return [...owned.values()];
}

/**
 * The highest champion level one player had reached by game time `t` (the latest {@link LevelEvent}
 * with `gameTime <= t`). Defaults to `1` when nothing has been observed yet.
 */
export function levelAt(
  levelTimeline: LevelEvent[],
  playerKey: string,
  t: number,
): number {
  let level = 1;
  for (const e of levelTimeline) {
    if (e.playerKey === playerKey && e.gameTime <= t && e.level > level) {
      level = e.level;
    }
  }
  return level;
}

/**
 * The most recent durability-diagnostics snapshot recorded at or before game time `t` (the engine
 * recomputes on each item/level change, so snapshots are sparse). Returns `null` when none have been
 * recorded yet by `t` — e.g. before the first recompute, or for records predating the feature.
 */
export function diagnosticAt(
  diagnostics: DiagnosticSnapshot[],
  t: number,
): DiagnosticSnapshot | null {
  let latest: DiagnosticSnapshot | null = null;
  for (const snap of diagnostics) {
    if (
      snap.gameTime <= t &&
      (latest === null || snap.gameTime >= latest.gameTime)
    ) {
      latest = snap;
    }
  }
  return latest;
}

/**
 * Indexes players by every identity string a Live Client event might carry, so an event's
 * `killer`/`victim`/`assisters` value resolves back to the right player. Registers the full `riotId`
 * ("Foe#EUW"), the `riotId` minus its `#TAG` ("Foe"), the `summonerName`, and the join `key` (see
 * `recorder.rs::player_key`). Earlier players win on collision (stable).
 */
export function buildNameIndex(
  players: MatchPlayer[],
): Map<string, MatchPlayer> {
  const index = new Map<string, MatchPlayer>();
  const add = (k: string | undefined, p: MatchPlayer) => {
    if (k && !index.has(k)) index.set(k, p);
  };
  for (const p of players) {
    add(p.riotId, p);
    add(p.riotId?.split("#")[0], p);
    add(p.summonerName, p);
    add(p.key, p);
  }
  return index;
}

/**
 * Resolves a raw Live Client event name (a Riot ID, summoner name, or join key) to its player via a
 * {@link buildNameIndex} map, trying the raw string then its `#TAG`-stripped form. Returns
 * `undefined` for non-player actors (turrets, minions, monsters).
 */
export function playerForName(
  nameIndex: Map<string, MatchPlayer>,
  name: string | undefined,
): MatchPlayer | undefined {
  if (!name) return undefined;
  return nameIndex.get(name) ?? nameIndex.get(name.split("#")[0]);
}

/**
 * Running K/D/A for every player as of game time `t`, keyed by {@link MatchPlayer.key}. Counts only
 * `ChampionKill` events (`gameTime <= t`) — killer +1 kill, victim +1 death, each assister +1
 * assist — so FirstBlood/Ace/Multikill markers don't double-count. Events whose actors don't resolve
 * to a player are skipped. Every player starts at 0/0/0.
 */
export function runningScores(
  events: MatchEvent[],
  nameIndex: Map<string, MatchPlayer>,
  players: MatchPlayer[],
  t: number,
): Map<string, RunningScore> {
  const scores = new Map<string, RunningScore>();
  for (const p of players)
    scores.set(p.key, { kills: 0, deaths: 0, assists: 0 });

  for (const e of events) {
    if (e.kind !== "ChampionKill" || e.gameTime > t) continue;
    const killer = playerForName(nameIndex, e.killer);
    if (killer) scores.get(killer.key)!.kills += 1;
    const victim = playerForName(nameIndex, e.victim);
    if (victim) scores.get(victim.key)!.deaths += 1;
    for (const a of e.assisters ?? []) {
      const assister = playerForName(nameIndex, a);
      if (assister) scores.get(assister.key)!.assists += 1;
    }
  }
  return scores;
}

/** Categorizes a raw event kind for the scrubber track, or `null` if it isn't worth a marker. */
function markerKind(kind: string): EventMarker["kind"] | null {
  switch (kind) {
    case "ChampionKill":
      return "kill";
    case "DragonKill":
    case "BaronKill":
    case "HeraldKill":
      return "objective";
    case "TurretKilled":
    case "InhibKilled":
      return "structure";
    default:
      return null;
  }
}

/**
 * Distills the event feed into positioned track markers (kills, objectives, structures) for the
 * scrubber. Events with nothing to mark (GameStart, Multikill, …) are dropped.
 */
export function eventMarkers(events: MatchEvent[]): EventMarker[] {
  const markers: EventMarker[] = [];
  for (const e of events) {
    const kind = markerKind(e.kind);
    if (kind) markers.push({ time: e.gameTime, kind });
  }
  return markers;
}
