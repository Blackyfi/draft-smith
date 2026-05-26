import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X, Zap } from "lucide-react";

import { ChampionAvatar } from "@/components/icons/ChampionAvatar";
import { useChampionName } from "@/hooks/useIcon";
import type { GankAlert, GankAlertKind } from "@/types";

// ── helpers ───────────────────────────────────────────────────────────────────

function headline(kind: GankAlertKind): string {
  switch (kind) {
    case "first-gank":
      return "GANK WINDOW";
    case "ultimate":
      return "LEVEL 6 — ULT UP";
  }
}

// ── sub-components ────────────────────────────────────────────────────────────

interface AlertContentProps {
  alert: GankAlert;
  onDismiss: () => void;
}

/**
 * Inner content — split from the outer wrapper so Framer Motion can animate
 * the wrapper independently without re-mounting the content on each alert
 * replacement.
 */
function AlertContent({ alert, onDismiss }: AlertContentProps) {
  const displayName = useChampionName(alert.jungler);

  return (
    <>
      {/* Accessible description for screen readers */}
      <span className="sr-only">
        Jungle gank window: {displayName}. {headline(alert.kind)}. {alert.message}
      </span>

      {/* Dismiss button — top-right corner */}
      <button
        onClick={onDismiss}
        aria-label="Dismiss gank alert"
        className="absolute top-2 right-2 rounded-md p-1 text-amber-100/70 transition-colors hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
      >
        <X className="size-4" aria-hidden="true" />
      </button>

      {/* Main row: avatar + text */}
      <div className="flex items-center gap-3">
        <ChampionAvatar
          name={alert.jungler}
          label={displayName}
          className="size-12 shrink-0 ring-2 ring-amber-300/60"
        />

        <div className="min-w-0 flex-1">
          {/* Headline with flanking lightning icons */}
          <p
            className="flex items-center gap-1.5 text-base font-black tracking-widest text-amber-100 uppercase"
            aria-hidden="true"
          >
            <Zap className="size-4 shrink-0 fill-amber-300 text-amber-300" aria-hidden="true" />
            {headline(alert.kind)}
            <Zap className="size-4 shrink-0 fill-amber-300 text-amber-300" aria-hidden="true" />
          </p>

          {/* Sub-line: display name + Rust message */}
          <p className="mt-0.5 truncate text-sm font-medium text-amber-200/90" aria-hidden="true">
            {displayName} — {alert.message}
          </p>
        </div>
      </div>
    </>
  );
}

// ── overlay ───────────────────────────────────────────────────────────────────

interface GankAlertOverlayProps {
  alert: GankAlert | null;
  onDismiss: () => void;
}

/**
 * Fixed, high-z overlay displayed near the top-center of the window whenever a
 * `gank-alert` event is active. Auto-dismisses via the `useGankAlert` hook;
 * also dismissable on click anywhere on the banner or the X button.
 *
 * A11y: `role="alert"` + `aria-live="assertive"` ensures screen readers
 * announce the alert immediately.
 *
 * Motion: scale+fade in (≤200ms), fade out. One gentle opacity pulse while
 * visible (attention cue). All motion gated on `useReducedMotion()` — when
 * reduced, only an instant fade is used, no pulsing.
 */
export function GankAlertOverlay({ alert, onDismiss }: GankAlertOverlayProps) {
  const reduceMotion = useReducedMotion();

  return (
    /*
     * `aria-live="assertive"` + `role="alert"` on the container means the
     * region is always in the DOM and screen readers watch it; content changes
     * are announced immediately.
     */
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
    >
      <AnimatePresence>
        {alert && (
          <motion.div
            key={`${alert.jungler}-${alert.kind}`}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.92, y: -8 }
            }
            animate={
              reduceMotion
                ? // Reduced motion: plain fade in, no pulsing.
                  { opacity: 1 }
                : // Full motion: enter then pulse gently (opacity only, ≪1 Hz — no strobing).
                  {
                    opacity: [0, 1, 1, 0.88, 1],
                    scale: [0.92, 1, 1, 1.01, 1],
                    y: [-8, 0, 0, 0, 0],
                  }
            }
            transition={
              reduceMotion
                ? { duration: 0.18, ease: "easeOut" }
                : {
                    // First two keyframes are the entry (≤200ms); last three are
                    // the slow pulse (total ~2 s) — well under 1 Hz.
                    duration: 2,
                    times: [0, 0.09, 0.5, 0.75, 1],
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatType: "loop" as const,
                  }
            }
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            /* pointer-events-auto so clicks on the banner work while the
               outer wrapper stays pointer-events-none (doesn't block the app). */
            className="pointer-events-auto relative w-full max-w-sm cursor-pointer overflow-hidden rounded-xl bg-gradient-to-r from-amber-500 to-red-600 px-4 py-3 shadow-2xl ring-2 ring-amber-300/60"
            onClick={onDismiss}
          >
            <AlertContent alert={alert} onDismiss={onDismiss} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
