import { describe, expect, it } from "vitest";

import type { MatchEvent } from "@/types";

import {
  RESULT_VISUAL,
  describeEvent,
  formatDuration,
  formatGameMode,
  formatKda,
  formatRelativeDate,
} from "./matchFormat";

describe("formatDuration", () => {
  it("formats seconds as m:ss with zero-padding", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(1694)).toBe("28:14");
  });

  it("clamps negatives and rounds", () => {
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(59.6)).toBe("1:00");
  });
});

describe("formatRelativeDate", () => {
  const now = Date.UTC(2026, 4, 28, 12, 0, 0);

  it("uses relative phrasing within a week", () => {
    expect(formatRelativeDate(now - 10_000, now)).toBe("just now");
    expect(formatRelativeDate(now - 5 * 60_000, now)).toBe("5m ago");
    expect(formatRelativeDate(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(formatRelativeDate(now - 2 * 86_400_000, now)).toBe("2d ago");
  });

  it("falls back to an absolute date past a week", () => {
    const result = formatRelativeDate(now - 30 * 86_400_000, now);
    expect(result).not.toMatch(/ago|just now/);
  });
});

describe("formatGameMode", () => {
  it("maps known modes and passes through unknown ones", () => {
    expect(formatGameMode("CLASSIC")).toBe("Summoner's Rift");
    expect(formatGameMode("ARAM")).toBe("ARAM");
    expect(formatGameMode("CHERRY")).toBe("Arena");
    expect(formatGameMode("WEIRDMODE")).toBe("WEIRDMODE");
  });
});

describe("formatKda", () => {
  it("joins with slashes", () => {
    expect(formatKda(7, 2, 9)).toBe("7 / 2 / 9");
  });
});

describe("RESULT_VISUAL", () => {
  it("pairs every result with a non-empty text label (color is never the only signal)", () => {
    expect(RESULT_VISUAL.win.label).toBe("Win");
    expect(RESULT_VISUAL.loss.label).toBe("Loss");
    expect(RESULT_VISUAL.unknown.label).toBe("Unknown");
    for (const v of Object.values(RESULT_VISUAL)) {
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.Icon).toBeTruthy();
    }
  });
});

describe("describeEvent", () => {
  const ev = (e: Partial<MatchEvent>): MatchEvent => ({
    gameTime: 100,
    kind: "ChampionKill",
    ...e,
  });

  it("describes a champion kill, stripping Riot tags", () => {
    expect(
      describeEvent(
        ev({ kind: "ChampionKill", killer: "Zed#EUW", victim: "Ahri#EUW" }),
      ),
    ).toBe("Zed killed Ahri");
  });

  it("describes a dragon, noting type and steal", () => {
    expect(
      describeEvent(
        ev({
          kind: "DragonKill",
          killer: "LeeSin#EUW",
          dragonType: "Fire",
          stolen: false,
        }),
      ),
    ).toBe("LeeSin took Fire Dragon");
    expect(
      describeEvent(
        ev({
          kind: "DragonKill",
          killer: "LeeSin#EUW",
          dragonType: "Elder",
          stolen: true,
        }),
      ),
    ).toBe("LeeSin took Elder Dragon (stolen)");
  });

  it("describes game start/end", () => {
    expect(describeEvent(ev({ kind: "GameEnd" }))).toBe("Game end");
    expect(describeEvent(ev({ kind: "GameStart" }))).toBe("Game start");
  });

  it("returns null for events with nothing to show", () => {
    expect(describeEvent(ev({ kind: "MinionsSpawning" }))).toBeNull();
  });
});
