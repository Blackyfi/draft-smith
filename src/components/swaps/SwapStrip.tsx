import { ArrowLeftRight } from "lucide-react";

import { ItemIcon } from "@/components/icons/ItemIcon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SwapSuggestion } from "@/types";

/**
 * The engine's `reason` reads "Counters X and Y (…) — <punchline>." The clause after the em-dash is
 * the concise "why" we surface inline next to the item; if there's no dash we fall back to the whole
 * reason. The full sentence is still in the tooltip.
 */
function conciseReason(reason: string): string {
  const dash = reason.indexOf("—");
  const tail = dash === -1 ? reason : reason.slice(dash + 1);
  return tail.trim().replace(/\.$/, "");
}

/**
 * The situational swaps strip (PROJECT_SPEC §6.3): 2–4 "if X then buy Y" alternatives. The trigger
 * condition is the headline; the concise reason sits greyed next to the item name, and the full
 * reason is in a tooltip. Renders nothing when the engine offered no swaps.
 */
export function SwapStrip({ swaps }: { swaps: SwapSuggestion[] }) {
  if (swaps.length === 0) return null;

  return (
    <section aria-labelledby="swaps-heading" className="flex flex-col gap-1.5">
      <h2
        id="swaps-heading"
        className="flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        <ArrowLeftRight className="size-3.5" aria-hidden="true" />
        Situational swaps
      </h2>
      <ul className="flex flex-col gap-1.5">
        {swaps.map((swap) => (
          <li key={`${swap.trigger}-${swap.itemId}`}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex w-full cursor-default items-center gap-2.5 rounded-md border bg-card p-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <ItemIcon
                    itemId={swap.itemId}
                    name={swap.name}
                    className="size-8 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {swap.trigger}
                    </p>
                    <div className="flex min-w-0 items-baseline gap-1.5">
                      <p className="shrink-0 text-[11px] text-muted-foreground">
                        → {swap.name}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground/60">
                        {conciseReason(swap.reason)}
                      </p>
                    </div>
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="font-medium">{swap.name}</p>
                <p className="mt-0.5 text-muted-foreground">{swap.reason}</p>
              </TooltipContent>
            </Tooltip>
          </li>
        ))}
      </ul>
    </section>
  );
}
