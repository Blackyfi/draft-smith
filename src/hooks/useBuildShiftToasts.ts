import { useRef } from "react";
import { toast } from "sonner";

import { useTauriEvent } from "@/hooks/useTauriEvent";
import { diffRecommendation } from "@/lib/buildShift";
import type { Recommendation } from "@/types";

/** Never show more than this many toasts from a single recompute — avoid a stack on a big swing. */
const MAX_TOASTS = 3;

/**
 * Surfaces build shifts as toasts (PROJECT_SPEC §6.4: "Enemy Zed bought Serpent's Fang — added
 * Banshee's Veil"). Mounted once near the app root.
 *
 * Diffs each `recommendation-updated` payload against the previous one and toasts the meaningful
 * changes. The first recommendation of a game (no previous) is silent — there's nothing to compare
 * — and leaving a game resets the baseline so the next game starts clean.
 */
export function useBuildShiftToasts() {
  const previous = useRef<Recommendation | null>(null);

  useTauriEvent("recommendation-updated", (rec) => {
    const prev = previous.current;
    previous.current = rec;
    if (!prev) return; // first recommendation this game — nothing to diff against.

    for (const shift of diffRecommendation(prev, rec).slice(0, MAX_TOASTS)) {
      toast(shift.title, { id: shift.id, description: shift.description });
    }
  });

  // Reset the baseline when a game ends so the first recommendation of the next game is silent.
  useTauriEvent("connection-status", (status) => {
    if (status === "no-game" || status === "error") previous.current = null;
  });
}
