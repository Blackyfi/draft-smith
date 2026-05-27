import { Eye } from "lucide-react";

import { BuildNext } from "@/components/build/BuildNext";
import { MetaPanel } from "@/components/build/MetaPanel";
import { SkillStrip } from "@/components/skill/SkillStrip";
import { Connecting } from "@/components/states/Connecting";
import { SwapStrip } from "@/components/swaps/SwapStrip";
import { EnemyItemsPanel } from "@/components/threat/EnemyItemsPanel";
import { EnemyThreatBoard } from "@/components/threat/EnemyThreatBoard";
import { FocusCallout } from "@/components/threat/FocusCallout";
import { useSettings } from "@/hooks/useSettings";
import type { Rank, Recommendation } from "@/types";

/**
 * The in-game dashboard (PROJECT_SPEC §6.3): build path, enemy threat board, situational swaps,
 * and the enemy items reference panel.
 *
 * When we're in a game but the engine hasn't produced a recommendation yet (the local player isn't
 * identifiable for a beat), we show the connecting skeleton rather than an empty frame. Once a
 * recommendation exists but no enemy has revealed an item-derived signal, we surface the early
 * "watching enemy buys" hint (PROJECT_SPEC §6.4, in-game-early).
 *
 * Layout: three columns on xl+ windows, two columns on md, one on narrow/overlay.
 *  - Column 1 (left): build-decision content — skill order, situational swaps, Adapt build path,
 *    Meta panel. Swaps live here (under skill order) rather than with the threat board so the
 *    awareness column can grow tall with enemy threats without pushing swaps off-screen.
 *  - Column 2 (middle): situational/awareness content — focus targets, threat board.
 *  - Column 3 (right): enemy items reference panel — given a `2fr` track (twice the width of the
 *    other two) so its internal tile grid can show two-plus items per row, letting the player scan
 *    the enemy inventory at a glance without scrolling mid-game.
 * At md (2-col), the items panel spans both columns so it renders full-width below the other two
 * rather than being orphaned in a half-row. At xl+ it occupies the wide third track.
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
    <div className="grid grid-cols-1 items-start gap-5 p-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr]">
      {/* Column 1 — what to build. */}
      <div className="flex min-w-0 flex-col gap-5">
        <SkillStrip />
        <SwapStrip swaps={recommendation.swaps} />
        <BuildNext buildPath={recommendation.buildPath} />
        {showMeta && (
          <MetaPanel
            champion={recommendation.selfChampion}
            rank={metaRank}
            abilityRanks={recommendation.abilityRanks}
            abilityKeys={settings?.abilityKeys}
          />
        )}
        {noSignalsYet && (
          <p className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
            <Eye className="size-3.5 shrink-0" aria-hidden="true" />
            Core build — watching enemy buys to adapt.
          </p>
        )}
      </div>

      {/* Column 2 — who to fight. */}
      <div className="flex min-w-0 flex-col gap-5">
        <FocusCallout />
        <EnemyThreatBoard threats={recommendation.threats} />
      </div>

      {/* Column 3 — enemy items reference.
          At md (2-col) this spans both columns so it stacks cleanly below rather than being
          orphaned. At xl+ it lives in the wide (2fr) third track. */}
      <div className="flex min-w-0 flex-col gap-5 md:col-span-2 xl:col-span-1">
        <EnemyItemsPanel
          threats={recommendation.threats}
          enemyItems={recommendation.enemyItems}
        />
      </div>
    </div>
  );
}
