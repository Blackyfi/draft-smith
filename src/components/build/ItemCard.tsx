import { Check } from "lucide-react";

import { ItemIcon } from "@/components/icons/ItemIcon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { BuildStep } from "@/types";

interface ItemCardProps {
  step: BuildStep;
  /** The first not-owned step — the next purchase, emphasized (PROJECT_SPEC §6.3). */
  isNext: boolean;
}

/**
 * One item in the build path. Owned items are checked + dimmed; the next purchase is emphasized
 * with a ring + glow. The card is a button so hover *and* keyboard focus reveal the full rationale
 * in a tooltip (the card itself shows a clamped one-liner). Color is never the only signal: "owned"
 * carries a check icon, "next" carries a visible "Next" label.
 */
export function ItemCard({ step, isNext }: ItemCardProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-next={isNext || undefined}
          data-owned={step.owned || undefined}
          className={cn(
            "group relative flex w-16 shrink-0 cursor-default flex-col items-center gap-0.5 rounded-lg border bg-card p-1 text-center transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            isNext &&
              "border-primary/60 ring-2 ring-primary/40 shadow-lg shadow-primary/20",
            step.owned && "opacity-60",
          )}
        >
          {isNext && (
            <span className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
              Next
            </span>
          )}
          <div className="relative">
            <ItemIcon
              itemId={step.itemId}
              name={step.name}
              className="size-9"
            />
            {step.owned && (
              <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-card">
                <Check className="size-2.5" aria-hidden="true" />
                <span className="sr-only">Owned</span>
              </span>
            )}
          </div>
          <span className="line-clamp-1 w-full text-[11px] leading-tight font-medium">
            {step.name}
          </span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {step.cost.toLocaleString()}g
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="font-medium">
          {step.name}
          {step.owned && " (owned)"}
        </p>
        <p className="mt-0.5 text-muted-foreground">{step.reason}</p>
      </TooltipContent>
    </Tooltip>
  );
}
