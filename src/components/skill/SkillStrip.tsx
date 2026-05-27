import { motion, useReducedMotion } from "framer-motion";
import { Zap } from "lucide-react";

import { slotToKey, slotToKeyAria } from "@/lib/abilityKeys";
import { useRecommendation } from "@/hooks/useRecommendation";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

/**
 * Compact skill-order coach strip (PROJECT_SPEC §6.3).
 *
 * Shows the next ability to level, mapped to the player's keybind layout from settings.
 * When `skill == null` (no authored plan for this champion): a calm muted hint.
 * When `pointAvailable`: emphasized with a pulse animation (gated on prefers-reduced-motion).
 * When `!pointAvailable`: quieter look-ahead showing the target level.
 *
 * Color is never the only signal — the key letter badge, ability name, and reason are always text
 * (PROJECT_SPEC §6.5 / frontend.md). Min 11px. Dark-first via existing Tailwind tokens.
 */
export function SkillStrip() {
  const { data: rec } = useRecommendation();
  const { data: settings } = useSettings();

  const skill = rec?.skill ?? null;
  const abilityKeys = settings?.abilityKeys ?? {
    layout: "qwerty" as const,
    custom: ["Q", "W", "E", "R"] as [string, string, string, string],
    movementMode: "mouse" as const,
  };

  const reduceMotion = useReducedMotion();

  // Q/W become "RMB"/"Shift" in WASD mode — let the badge grow past a square for multi-char labels.
  const keyLabel = skill ? slotToKey(skill.slot, abilityKeys) : "";
  const multiChar = keyLabel.length > 1;

  return (
    <section aria-labelledby="skill-heading" className="flex flex-col gap-1.5">
      <h2
        id="skill-heading"
        className="flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        <Zap className="size-3.5" aria-hidden="true" />
        Skill order
      </h2>

      {skill === null ? (
        <p
          aria-live="polite"
          className="px-1 text-[11px] text-muted-foreground"
        >
          No skill guidance for this champion yet.
        </p>
      ) : (
        <div
          aria-live="polite"
          className={cn(
            "flex items-start gap-2.5 rounded-lg border bg-card p-2.5",
            skill.pointAvailable && "border-primary/50",
          )}
        >
          {/* Key badge — square for single letters; grows to a pill for "RMB"/"Shift" (WASD mode). */}
          <motion.span
            aria-label={`Ability key ${slotToKeyAria(skill.slot, abilityKeys)}`}
            animate={
              skill.pointAvailable && !reduceMotion
                ? {
                    boxShadow: [
                      "0 0 0px rgba(var(--primary),0)",
                      "0 0 8px rgba(var(--primary),0.6)",
                      "0 0 0px rgba(var(--primary),0)",
                    ],
                  }
                : {}
            }
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            className={cn(
              "flex h-8 shrink-0 items-center justify-center rounded-md font-bold tabular-nums",
              multiChar ? "min-w-8 px-2 text-xs" : "w-8 text-sm",
              skill.pointAvailable
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {keyLabel}
          </motion.span>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {skill.abilityName && (
                <span className="truncate text-xs font-semibold">
                  {skill.abilityName}
                </span>
              )}
              {skill.pointAvailable ? (
                <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                  Level up now
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  Next at level {skill.atLevel}
                </span>
              )}
            </div>
            {skill.reason && (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {skill.reason}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
