import { SIGNAL_PHRASE } from "@/lib/labels";
import type { LiveSignal, Recommendation } from "@/types";

/**
 * A single "the build changed" notice, ready to render as a toast (PROJECT_SPEC §6.4: animate the
 * path change + a subtle toast). `id` dedupes identical notices within one recompute.
 */
export interface BuildShift {
  id: string;
  title: string;
  description?: string;
}

/** The next item to buy = the first step not already owned. `undefined` once the build is complete. */
function nextStep(rec: Recommendation) {
  return rec.buildPath.find((step) => !step.owned);
}

/** Signals present on `champion` in `rec`, as a Set for cheap diffing. */
function signalsFor(rec: Recommendation, champion: string): Set<LiveSignal> {
  const threat = rec.threats.find((t) => t.champion === champion);
  return new Set(threat?.signals ?? []);
}

/**
 * Diffs two consecutive recommendations into user-facing shift notices. Pure and deterministic so
 * it can be unit-tested without React or Tauri — the hook just feeds it consecutive payloads.
 *
 * It surfaces two kinds of change, the ones a player cares about mid-game:
 *  - an **enemy gained a live signal** (e.g. started building lethality), and
 *  - the **next recommended item changed** as a result.
 * When both happen together we fold them into one sentence ("Enemy Zed is building lethality —
 * now building Zhonya's Hourglass"); the standalone cases cover when only one moved.
 */
export function diffRecommendation(
  prev: Recommendation,
  next: Recommendation,
): BuildShift[] {
  if (prev.selfChampion !== next.selfChampion) return []; // new game — not a "shift".

  const prevNext = nextStep(prev);
  const nextNext = nextStep(next);
  const itemChanged = prevNext?.itemId !== nextNext?.itemId;

  // New signals per enemy, in the threat board's order for deterministic output.
  const newSignals: { champion: string; signal: LiveSignal }[] = [];
  for (const threat of next.threats) {
    const before = signalsFor(prev, threat.champion);
    for (const signal of threat.signals) {
      if (!before.has(signal))
        newSignals.push({ champion: threat.champion, signal });
    }
  }

  const shifts: BuildShift[] = [];

  if (newSignals.length > 0) {
    // Lead with the most build-relevant new signal; attach the item change to it if there is one.
    const lead = newSignals[0];
    shifts.push({
      id: `signal-${lead.champion}-${lead.signal}`,
      title: `Enemy ${lead.champion} is ${SIGNAL_PHRASE[lead.signal]}`,
      description:
        itemChanged && nextNext ? `Now building ${nextNext.name}` : undefined,
    });
    // Any further new signals get a terse line each (cap kept small by the caller).
    for (const extra of newSignals.slice(1)) {
      shifts.push({
        id: `signal-${extra.champion}-${extra.signal}`,
        title: `Enemy ${extra.champion} is ${SIGNAL_PHRASE[extra.signal]}`,
      });
    }
  } else if (itemChanged && nextNext) {
    // Build moved without a new enemy signal (e.g. you completed an item, revealing the next).
    shifts.push({
      id: `next-${nextNext.itemId}`,
      title: "Build updated",
      description: `Now building ${nextNext.name}`,
    });
  }

  return shifts;
}
