import { Crosshair } from "lucide-react";

import { ChampionAvatar } from "@/components/icons/ChampionAvatar";
import { Badge } from "@/components/ui/badge";
import { useChampionName } from "@/hooks/useIcon";
import { useRecommendation } from "@/hooks/useRecommendation";
import type { FocusTarget } from "@/types";

/** One focus target row — portrait, priority chip (color + icon + text), and reason. */
function FocusRow({
  target,
  emphasized,
}: {
  target: FocusTarget;
  emphasized: boolean;
}) {
  const champion = useChampionName(target.champion);

  return (
    <div
      className={
        emphasized
          ? "flex items-start gap-2.5"
          : "flex items-start gap-2.5 opacity-70"
      }
      aria-label={
        emphasized
          ? `Primary focus: ${champion}`
          : `Secondary focus: ${champion}`
      }
    >
      <ChampionAvatar
        name={target.champion}
        label={champion}
        className={emphasized ? "size-8 shrink-0" : "size-6 shrink-0"}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={
              emphasized
                ? "text-sm font-semibold"
                : "text-xs font-medium text-muted-foreground"
            }
          >
            {champion}
          </span>
          <Badge
            className={
              emphasized
                ? "gap-1 bg-rose-500/20 text-rose-300 border-rose-500/40"
                : "gap-1 bg-muted/60 text-muted-foreground border-border"
            }
          >
            <Crosshair className="size-3" aria-hidden="true" />
            {target.priority === "primary" ? "Focus" : "Secondary"}
          </Badge>
        </div>
        <p
          className={
            emphasized
              ? "mt-0.5 text-xs text-muted-foreground"
              : "mt-0.5 text-[11px] text-muted-foreground/70"
          }
        >
          {target.reason}
        </p>
      </div>
    </div>
  );
}

/**
 * Compact callout showing who to prioritize in fights (PROJECT_SPEC §6.3).
 *
 * Placed above the enemy threat board so the player always sees "who to focus" at a glance.
 * Renders nothing when the engine has produced no focus targets yet (early game, no signals).
 * Priority is conveyed by prominence (size + opacity) AND text + icon — not color alone.
 */
export function FocusCallout() {
  const { data: recommendation } = useRecommendation();
  const focus = recommendation?.focus;

  if (!focus || focus.length === 0) return null;

  const primary = focus.find((f) => f.priority === "primary");
  const secondary = focus.find((f) => f.priority === "secondary");

  return (
    <section
      aria-labelledby="focus-heading"
      className="flex flex-col gap-2 rounded-md border border-rose-500/25 bg-rose-500/5 px-2.5 py-2"
    >
      <h2
        id="focus-heading"
        className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-rose-400 uppercase"
      >
        <Crosshair className="size-3.5" aria-hidden="true" />
        Who to focus
      </h2>
      <div className="flex flex-col gap-2">
        {primary && <FocusRow target={primary} emphasized={true} />}
        {secondary && <FocusRow target={secondary} emphasized={false} />}
      </div>
    </section>
  );
}
