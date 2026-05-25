import { describe, expect, it } from "vitest";

import { diffRecommendation } from "@/lib/buildShift";
import type { BuildStep, EnemyThreatView, Recommendation } from "@/types";

function step(itemId: number, name: string, owned = false): BuildStep {
  return { itemId, name, cost: 3000, owned, reason: `${name} reason` };
}

function rec(
  buildPath: BuildStep[],
  threats: EnemyThreatView[],
): Recommendation {
  return { selfChampion: "Ahri", buildPath, swaps: [], threats };
}

const ZED_LETHAL: EnemyThreatView = {
  champion: "Zed",
  archetype: "assassin",
  signals: ["lethality"],
};

describe("diffRecommendation", () => {
  it("returns nothing when nothing changed", () => {
    const a = rec([step(3157, "Zhonya's Hourglass")], [ZED_LETHAL]);
    expect(diffRecommendation(a, structuredClone(a))).toEqual([]);
  });

  it("reports a new enemy signal and folds in the resulting next-item change", () => {
    const prev = rec(
      [step(3135, "Void Staff")],
      [{ ...ZED_LETHAL, signals: [] }],
    );
    const next = rec([step(3157, "Zhonya's Hourglass")], [ZED_LETHAL]);

    const shifts = diffRecommendation(prev, next);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].title).toBe("Enemy Zed is building lethality");
    expect(shifts[0].description).toBe("Now building Zhonya's Hourglass");
  });

  it("reports a standalone next-item change when no new signal appeared", () => {
    // Same threats; the previously-next item is now owned, revealing a new next purchase.
    const prev = rec(
      [step(3157, "Zhonya's Hourglass"), step(3135, "Void Staff")],
      [ZED_LETHAL],
    );
    const next = rec(
      [step(3157, "Zhonya's Hourglass", true), step(3135, "Void Staff")],
      [ZED_LETHAL],
    );

    const shifts = diffRecommendation(prev, next);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].title).toBe("Build updated");
    expect(shifts[0].description).toBe("Now building Void Staff");
  });

  it("emits one notice per newly-revealed signal, leading with the build change", () => {
    const prev = rec(
      [step(3157, "Zhonya's Hourglass")],
      [
        { ...ZED_LETHAL, signals: [] },
        { champion: "Vi", archetype: "bruiser", signals: [] },
      ],
    );
    const next = rec(
      [step(3135, "Void Staff")],
      [
        ZED_LETHAL,
        { champion: "Vi", archetype: "bruiser", signals: ["mr-stacking"] },
      ],
    );

    const shifts = diffRecommendation(prev, next);
    expect(shifts.map((s) => s.title)).toEqual([
      "Enemy Zed is building lethality",
      "Enemy Vi is stacking magic resist",
    ]);
    // Only the lead notice carries the build-change description.
    expect(shifts[0].description).toBe("Now building Void Staff");
    expect(shifts[1].description).toBeUndefined();
  });

  it("treats a champion change as a new game, not a shift", () => {
    const prev = rec([step(3157, "Zhonya's Hourglass")], [ZED_LETHAL]);
    const next: Recommendation = {
      ...rec([step(6655, "Luden's Companion")], []),
      selfChampion: "Lux",
    };
    expect(diffRecommendation(prev, next)).toEqual([]);
  });
});
