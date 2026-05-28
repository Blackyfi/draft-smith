import { describe, expect, it } from "vitest";

import type {
  DiagnosticSnapshot,
  ItemEvent,
  LevelEvent,
  MatchEvent,
  MatchPlayer,
} from "@/types";

import {
  buildNameIndex,
  diagnosticAt,
  eventMarkers,
  inventoryAt,
  levelAt,
  playerForName,
  runningScores,
} from "./matchTimeline";

describe("diagnosticAt", () => {
  const snap = (gameTime: number): DiagnosticSnapshot => ({
    gameTime,
    ddragonReady: true,
    selfMagicPenPercent: 0,
    selfMagicPenFlat: 0,
    selfArmorPenPercent: 0,
    selfArmorPenFlat: 0,
    enemies: [],
  });

  it("returns the latest snapshot at or before t, null before any", () => {
    const diags = [snap(60), snap(300), snap(600)];
    expect(diagnosticAt(diags, 30)).toBeNull();
    expect(diagnosticAt(diags, 60)?.gameTime).toBe(60);
    expect(diagnosticAt(diags, 450)?.gameTime).toBe(300);
    expect(diagnosticAt(diags, 9999)?.gameTime).toBe(600);
    expect(diagnosticAt([], 100)).toBeNull();
  });
});

const item = (
  playerKey: string,
  itemId: number,
  gameTime: number,
  kind: "acquired" | "removed" = "acquired",
  name = `item-${itemId}`,
): ItemEvent => ({ gameTime, playerKey, itemId, name, kind });

function player(over: Partial<MatchPlayer>): MatchPlayer {
  return {
    key: "Me",
    champion: "Ahri",
    riotId: "Me#EUW",
    summonerName: "Me",
    team: "ORDER",
    position: "MIDDLE",
    isBot: false,
    isSelf: true,
    summonerSpells: ["Flash", "Ignite"],
    finalLevel: 1,
    kills: 0,
    deaths: 0,
    assists: 0,
    creepScore: 0,
    wardScore: 0,
    finalItems: [],
    ...over,
  };
}

describe("inventoryAt", () => {
  const timeline: ItemEvent[] = [
    item("Me", 1056, 30), // Doran's Ring @30
    item("Foe", 1055, 35), // (other player — ignored)
    item("Me", 2003, 40), // Potion @40
    item("Me", 2003, 90, "removed"), // potion consumed @90
    item("Me", 6655, 600), // Luden's @600
  ];

  it("includes only items acquired at or before t, for the given player", () => {
    expect(inventoryAt(timeline, "Me", 25).map((i) => i.id)).toEqual([]);
    expect(inventoryAt(timeline, "Me", 30).map((i) => i.id)).toEqual([1056]);
    expect(inventoryAt(timeline, "Me", 40).map((i) => i.id)).toEqual([
      1056, 2003,
    ]);
  });

  it("drops items removed at or before t", () => {
    expect(inventoryAt(timeline, "Me", 89).map((i) => i.id)).toEqual([
      1056, 2003,
    ]);
    expect(inventoryAt(timeline, "Me", 90).map((i) => i.id)).toEqual([1056]);
    expect(inventoryAt(timeline, "Me", 600).map((i) => i.id)).toEqual([
      1056, 6655,
    ]);
  });

  it("isolates players by key", () => {
    expect(inventoryAt(timeline, "Foe", 600).map((i) => i.id)).toEqual([1055]);
  });

  it("dedupes a re-acquired id, preserving first-acquired order", () => {
    const t: ItemEvent[] = [
      item("Me", 3, 10),
      item("Me", 1, 20),
      item("Me", 3, 30),
    ];
    expect(inventoryAt(t, "Me", 40).map((i) => i.id)).toEqual([3, 1]);
  });
});

describe("levelAt", () => {
  const timeline: LevelEvent[] = [
    { gameTime: 10, playerKey: "Me", level: 1 },
    { gameTime: 95, playerKey: "Me", level: 3 },
    { gameTime: 300, playerKey: "Foe", level: 6 },
  ];

  it("returns the latest level reached by t, defaulting to 1", () => {
    expect(levelAt(timeline, "Me", 5)).toBe(1);
    expect(levelAt(timeline, "Me", 10)).toBe(1);
    expect(levelAt(timeline, "Me", 94)).toBe(1);
    expect(levelAt(timeline, "Me", 95)).toBe(3);
    expect(levelAt(timeline, "Me", 1000)).toBe(3);
  });

  it("isolates players and defaults unknown players to 1", () => {
    expect(levelAt(timeline, "Foe", 300)).toBe(6);
    expect(levelAt(timeline, "Ghost", 1000)).toBe(1);
  });
});

describe("buildNameIndex / playerForName", () => {
  const me = player({ key: "Me", riotId: "Me#EUW", summonerName: "MeSumm" });
  const foe = player({
    key: "Foe",
    champion: "Zed",
    riotId: "Foe#NA1",
    summonerName: "FoeSumm",
    isSelf: false,
    team: "CHAOS",
  });
  const index = buildNameIndex([me, foe]);

  it("resolves by full riot id, stripped game-name, summoner name, and key", () => {
    expect(playerForName(index, "Me#EUW")).toBe(me);
    expect(playerForName(index, "Me")).toBe(me);
    expect(playerForName(index, "MeSumm")).toBe(me);
    expect(playerForName(index, "Foe#NA1")).toBe(foe);
    expect(playerForName(index, "Foe")).toBe(foe);
  });

  it("returns undefined for non-player actors and empty input", () => {
    expect(playerForName(index, "Turret_T1_C_07_A")).toBeUndefined();
    expect(playerForName(index, undefined)).toBeUndefined();
    expect(playerForName(index, "")).toBeUndefined();
  });
});

describe("runningScores", () => {
  const me = player({ key: "Me", riotId: "Me#EUW" });
  const foe = player({ key: "Foe", riotId: "Foe#NA1", isSelf: false });
  const ally = player({ key: "Ally", riotId: "Ally#EUW", isSelf: false });
  const players = [me, foe, ally];
  const index = buildNameIndex(players);

  const events: MatchEvent[] = [
    { gameTime: 100, kind: "FirstBlood", recipient: "Me#EUW" },
    {
      gameTime: 100,
      kind: "ChampionKill",
      killer: "Me#EUW",
      victim: "Foe#NA1",
      assisters: ["Ally#EUW"],
    },
    {
      gameTime: 500,
      kind: "ChampionKill",
      killer: "Foe#NA1",
      victim: "Me#EUW",
    },
  ];

  it("accumulates K/D/A only from ChampionKill up to t", () => {
    const at90 = runningScores(events, index, players, 90);
    expect(at90.get("Me")).toEqual({ kills: 0, deaths: 0, assists: 0 });

    const at100 = runningScores(events, index, players, 100);
    expect(at100.get("Me")).toEqual({ kills: 1, deaths: 0, assists: 0 });
    expect(at100.get("Foe")).toEqual({ kills: 0, deaths: 1, assists: 0 });
    expect(at100.get("Ally")).toEqual({ kills: 0, deaths: 0, assists: 1 });

    const at500 = runningScores(events, index, players, 500);
    expect(at500.get("Me")).toEqual({ kills: 1, deaths: 1, assists: 0 });
    expect(at500.get("Foe")).toEqual({ kills: 1, deaths: 1, assists: 0 });
  });

  it("seeds every player at zero", () => {
    const empty = runningScores([], index, players, 9999);
    expect(empty.get("Ally")).toEqual({ kills: 0, deaths: 0, assists: 0 });
  });
});

describe("eventMarkers", () => {
  it("categorizes kills, objectives, and structures and drops the rest", () => {
    const events: MatchEvent[] = [
      { gameTime: 0, kind: "GameStart" },
      {
        gameTime: 100,
        kind: "ChampionKill",
        killer: "Me#EUW",
        victim: "Foe#NA1",
      },
      { gameTime: 300, kind: "DragonKill", killer: "Me#EUW" },
      { gameTime: 600, kind: "TurretKilled", killer: "Me#EUW" },
      { gameTime: 700, kind: "Multikill", killer: "Me#EUW" },
      { gameTime: 900, kind: "BaronKill", killer: "Foe#NA1" },
    ];
    expect(eventMarkers(events)).toEqual([
      { time: 100, kind: "kill" },
      { time: 300, kind: "objective" },
      { time: 600, kind: "structure" },
      { time: 900, kind: "objective" },
    ]);
  });
});
