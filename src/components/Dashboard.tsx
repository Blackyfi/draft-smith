import { Eye } from "lucide-react";

import { BuildNext } from "@/components/build/BuildNext";
import { SkillStrip } from "@/components/skill/SkillStrip";
import { Connecting } from "@/components/states/Connecting";
import { SwapStrip } from "@/components/swaps/SwapStrip";
import { EnemyThreatBoard } from "@/components/threat/EnemyThreatBoard";
import type { Recommendation } from "@/types";

/**
 * The in-game dashboard (PROJECT_SPEC §6.3): build path, enemy threat board, situational swaps.
 *
 * When we're in a game but the engine hasn't produced a recommendation yet (the local player isn't
 * identifiable for a beat), we show the connecting skeleton rather than an empty frame. Once a
 * recommendation exists but no enemy has revealed an item-derived signal, we surface the early
 * "watching enemy buys" hint (PROJECT_SPEC §6.4, in-game-early).
 */
export function Dashboard({
  recommendation,
}: {
  recommendation: Recommendation | null | undefined;
}) {
  if (!recommendation) return <Connecting />;

  const noSignalsYet = recommendation.threats.every(
    (t) => t.signals.length === 0,
  );

  return (
    <div className="flex flex-col gap-5 p-3">
      <SkillStrip />
      <BuildNext buildPath={recommendation.buildPath} />

      {noSignalsYet && (
        <p className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
          <Eye className="size-3.5 shrink-0" aria-hidden="true" />
          Core build — watching enemy buys to adapt.
        </p>
      )}

      <EnemyThreatBoard threats={recommendation.threats} />
      <SwapStrip swaps={recommendation.swaps} />
    </div>
  );
}
