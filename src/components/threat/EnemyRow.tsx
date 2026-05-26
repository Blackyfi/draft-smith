import { Zap } from "lucide-react";

import { ChampionAvatar } from "@/components/icons/ChampionAvatar";
import { ItemIcon } from "@/components/icons/ItemIcon";
import { SIGNAL_VISUALS } from "@/components/threat/signal-visuals";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChampionName, useItemMeta } from "@/hooks/useIcon";
import { useSettings } from "@/hooks/useSettings";
import { slotToKey } from "@/lib/abilityKeys";
import {
  ARCHETYPE_DESCRIPTION,
  ARCHETYPE_LABEL,
  SIGNAL_DESCRIPTION,
} from "@/lib/labels";
import type { Durability, EnemyThreatView } from "@/types";

/**
 * Tiny item thumbnail with a tooltip showing the item name, used in the enemy row's item strip.
 * Avoids introducing item-level logic in the row component.
 */
function EnemyItemThumb({ itemId }: { itemId: number }) {
  const { data: meta } = useItemMeta(itemId);
  const name = meta?.name ?? String(itemId);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>
          <ItemIcon itemId={itemId} name={name} className="size-5 rounded" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="font-medium">{name}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Formats a raw HP number as a compact string: "3200" → "3.2k", "800" → "800". */
function fmtEhp(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

/**
 * Durability gauge + optional casts-to-kill chip.
 *
 * The gauge is a thin progress bar normalised against the team's max effective HP, so relative
 * tankiness is visible at a glance. A numeric label ensures color is never the only signal
 * (frontend.md). When `castsToKill` is available a "≈Nx Key" chip appears with a full breakdown
 * tooltip; otherwise the gauge-only tooltip explains the estimate and its limits.
 */
function DurabilitySection({
  durability,
  maxEffectiveHp,
}: {
  durability: Durability;
  maxEffectiveHp: number;
}) {
  const { data: settings } = useSettings();
  const abilityKeys = settings?.abilityKeys ?? {
    layout: "qwerty" as const,
    custom: ["Q", "W", "E", "R"] as [string, string, string, string],
    movementMode: "mouse" as const,
  };

  const fillPct = Math.min(
    (durability.effectiveHp / maxEffectiveHp) * 100,
    100,
  );
  const ehpLabel = `${fmtEhp(durability.effectiveHp)} EHP`;

  const resistLabel =
    durability.resistKind === "magic"
      ? "MR"
      : durability.resistKind === "armor"
        ? "armor"
        : "";

  const keyLabel =
    durability.abilitySlot != null
      ? slotToKey(durability.abilitySlot, abilityKeys)
      : null;

  const abilityDisplayName = durability.abilityName ?? keyLabel ?? "";

  // Gauge with tooltip ────────────────────────────────────────────────────────
  const gaugeTooltipBody =
    durability.castsToKill == null ? (
      <>
        <p className="font-medium">Estimated effective HP vs your damage</p>
        <p className="mt-0.5 text-muted-foreground">
          Cast count needs your champion&apos;s nuke data.
        </p>
      </>
    ) : (
      <>
        <p className="font-medium">
          ≈{durability.castsToKill}× {abilityDisplayName} to kill
        </p>
        {resistLabel && (
          <p className="mt-0.5 text-muted-foreground">
            ~{Math.round(durability.rawHp)} HP &middot; {Math.round(durability.resist)}{" "}
            {resistLabel} (~{Math.round(durability.resistAfterPen)} after your pen)
          </p>
        )}
        {durability.perCastDamage != null && (
          <p className="mt-0.5 text-muted-foreground">
            ~{Math.round(durability.perCastDamage)} dmg per cast
          </p>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          Estimate — excludes enemy runes &amp; current HP.
        </p>
      </>
    );

  return (
    <div className="flex flex-col gap-1">
      {/* Gauge row: bar + numeric label */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="meter"
            aria-label={`Effective HP vs you: ${Math.round(durability.effectiveHp)}`}
            aria-valuenow={durability.effectiveHp}
            aria-valuemin={0}
            aria-valuemax={maxEffectiveHp}
            className="flex items-center gap-1.5"
          >
            <div className="h-1.5 min-w-0 flex-1 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-sky-400/70 transition-[width] duration-200"
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {ehpLabel}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64">
          {gaugeTooltipBody}
        </TooltipContent>
      </Tooltip>

      {/* Casts-to-kill chip — only when the engine produced a nuke estimate */}
      {durability.castsToKill != null && keyLabel != null && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              className="w-fit cursor-default bg-amber-500/15 text-amber-300 border-amber-500/30"
              aria-label={`Approximately ${durability.castsToKill} casts of ${abilityDisplayName} to kill`}
            >
              <Zap aria-hidden="true" />
              ≈{durability.castsToKill}× {keyLabel}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-64">
            <p className="font-medium">
              ≈{durability.castsToKill}× {abilityDisplayName} to kill
            </p>
            {resistLabel && (
              <p className="mt-0.5 text-muted-foreground">
                ~{Math.round(durability.rawHp)} HP &middot; {Math.round(durability.resist)}{" "}
                {resistLabel} (~{Math.round(durability.resistAfterPen)} after your pen)
              </p>
            )}
            {durability.perCastDamage != null && (
              <p className="mt-0.5 text-muted-foreground">
                ~{Math.round(durability.perCastDamage)} dmg per cast
              </p>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground/70">
              Estimate — excludes enemy runes &amp; current HP.
            </p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * One enemy on the threat board (PROJECT_SPEC §6.3): portrait, detected archetype, live signal
 * badges, a compact strip of owned item thumbnails, and (when available) a durability gauge with
 * an optional casts-to-kill chip — the *why* behind the build, made visible.
 * Each signal badge pairs color + icon + text, and every pill (archetype + signals) explains itself
 * on hover/focus via a tooltip.
 */
export function EnemyRow({
  threat,
  maxEffectiveHp,
}: {
  threat: EnemyThreatView;
  maxEffectiveHp: number;
}) {
  // `threat.champion` is the Live Client id ("Kaisa"); the icon resolves by id, the text shows the
  // friendly name ("Kai'Sa").
  const champion = useChampionName(threat.champion);
  return (
    <li className="flex items-start gap-2.5 rounded-md px-1 py-1.5">
      <ChampionAvatar
        name={threat.champion}
        label={champion}
        className="mt-0.5 size-8 shrink-0"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{champion}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="cursor-default">
                {ARCHETYPE_LABEL[threat.archetype]}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-60">
              <p className="font-medium">{ARCHETYPE_LABEL[threat.archetype]}</p>
              <p className="mt-0.5 text-muted-foreground">
                {ARCHETYPE_DESCRIPTION[threat.archetype]}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        {threat.signals.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {threat.signals.map((signal) => {
              const { label, Icon, className } = SIGNAL_VISUALS[signal];
              return (
                <Tooltip key={signal}>
                  <TooltipTrigger asChild>
                    <Badge className={`${className} cursor-default`}>
                      <Icon aria-hidden="true" />
                      {label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-60">
                    <p className="font-medium">{label}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {SIGNAL_DESCRIPTION[signal]}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}
        {threat.items.length > 0 && (
          <div className="flex flex-wrap gap-0.5">
            {threat.items.map((id, idx) => (
              <EnemyItemThumb key={`${id}-${idx}`} itemId={id} />
            ))}
          </div>
        )}
        {threat.durability != null && (
          <DurabilitySection
            durability={threat.durability}
            maxEffectiveHp={maxEffectiveHp}
          />
        )}
      </div>
    </li>
  );
}
