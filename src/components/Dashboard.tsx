import { Eye } from "lucide-react";

import { BuildNext } from "@/components/build/BuildNext";
import { MetaPanel } from "@/components/build/MetaPanel";
import { SkillStrip } from "@/components/skill/SkillStrip";
import { Connecting } from "@/components/states/Connecting";
import { SwapStrip } from "@/components/swaps/SwapStrip";
import { EnemyThreatBoard } from "@/components/threat/EnemyThreatBoard";
import { FocusCallout } from "@/components/threat/FocusCallout";
import { useSettings } from "@/hooks/useSettings";
import type { Rank, Recommendation } from "@/types";

/**
 * The in-game dashboard (PROJECT_SPEC §6.3): build path, enemy threat board, situational swaps.
 *
 * When we're in a game but the engine hasn't produced a recommendation yet (the local player isn't
 * identifiable for a beat), we show the connecting skeleton rather than an empty frame. Once a
 * recommendation exists but no enemy has revealed an item-derived signal, we surface the early
 * "watching enemy buys" hint (PROJECT_SPEC §6.4, in-game-early).
 *
 * The Meta panel sits beside the Adapt ("Build next") panel when `settings.showMetaPanel` is true.
 * On narrow widths the two panels stack vertically; on wider widths they sit side by side.
 */
export function Dashboard({
  recommendation,
}: {
  recommendation: Recommendation | null | undefined;
}) {
  const { data: settings } = useSettings();

  if (!recommendation) return <Connecting />;

  const noSignalsYet = recommendation.threats.every(
    (t) => t.signals.length === 0,
  );

  const showMeta = settings?.showMetaPanel ?? true;
  const metaRank: Rank = settings?.metaRank ?? "diamond_plus";

  return (
    <div className="flex flex-col gap-5 p-3">
      <SkillStrip />

      {/* Adapt + Meta panels side by side (stack on narrow). */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-4">
        {/* Adapt panel — existing build-next, takes available space. */}
        <div className="flex-1 min-w-0">
          <BuildNext buildPath={recommendation.buildPath} />
        </div>

        {/* Meta panel — only when enabled in settings and we have a champion. */}
        {showMeta && (
          <div className="flex-1 min-w-0">
            <MetaPanel champion={recommendation.selfChampion} rank={metaRank} />
          </div>
        )}
      </div>

      {noSignalsYet && (
        <p className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
          <Eye className="size-3.5 shrink-0" aria-hidden="true" />
          Core build — watching enemy buys to adapt.
        </p>
      )}

      <FocusCallout />
      <EnemyThreatBoard threats={recommendation.threats} />
      <SwapStrip swaps={recommendation.swaps} />
    </div>
  );
}
