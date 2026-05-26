import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Swords } from "lucide-react";

import { ItemCard } from "@/components/build/ItemCard";
import type { BuildStep } from "@/types";

/**
 * The "Build Next" panel (PROJECT_SPEC §6.3): the ordered I1→I6 path as a horizontal row of item
 * cards, the next purchase emphasized. Path changes animate (items slide/reorder, new ones fade
 * in) so a live re-rank reads as motion, not a flash — gated on `prefers-reduced-motion`
 * (PROJECT_SPEC §6.5), where it collapses to an instant swap.
 */
export function BuildNext({ buildPath }: { buildPath: BuildStep[] }) {
  const reduceMotion = useReducedMotion();
  // The first not-owned step is the next purchase; everything else is context.
  const nextId = buildPath.find((step) => !step.owned)?.itemId;

  return (
    <section aria-labelledby="build-heading" className="flex flex-col gap-2">
      <h2
        id="build-heading"
        className="flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        <Swords className="size-3.5" aria-hidden="true" />
        Build next
      </h2>
      <div className="px-1 pt-2 pb-1">
        <ul className="flex flex-wrap gap-1.5 gap-y-3">
          <AnimatePresence initial={false} mode="popLayout">
            {buildPath.map((step) => (
              <motion.li
                key={step.itemId}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={
                  reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }
                }
                transition={{ duration: 0.18, ease: "easeOut" }}
              >
                <ItemCard step={step} isNext={step.itemId === nextId} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </section>
  );
}
