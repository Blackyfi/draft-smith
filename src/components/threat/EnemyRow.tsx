import { ArrowRight, Shield, Zap } from "lucide-react";

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
import type { Durability, EnemyThreatView, ResistKind } from "@/types";

/** Damage word for each resist dimension — used to label hybrid abilities ("magic + true"). */
const RESIST_WORD: Record<ResistKind, string> = {
  magic: "magic",
  armor: "physical",
  none: "true",
};

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
 * The inline damage math surfaced beside the casts chip — derived purely from the engine estimate
 * already on `Durability`, so it stays consistent with the gauge/casts tooltips.
 *
 * `perCastDamage` is the *post-mitigation* damage one cast lands; inverting the engine's own
 * `net = raw · 100/(100+after)` gives the pre-mitigation `rawCast`. `blockedPct` is the share their
 * resist (after the player's penetration) eats — `after/(100+after)`. Returns `null` when the engine
 * produced no per-cast number (slot not leveled / no authored nuke), matching the casts chip's gate.
 */
interface DamageMath {
  /** Post-mitigation damage per cast (what actually lands). */
  net: number;
  /** Reconstructed pre-mitigation damage per cast. */
  rawCast: number;
  /** Relevant resist after the player's pen (armor/MR; 0 for true damage). */
  after: number;
  /** True when the nuke is true damage — no resist applies, nothing is blocked. */
  isTrue: boolean;
  /** Share of the player's damage the resist blocks, as a 0–100 integer. */
  blockedPct: number;
}

function damageMath(d: Durability): DamageMath | null {
  if (d.perCastDamage == null) return null;
  const net = d.perCastDamage;
  const after = d.resistAfterPen;
  const isTrue = d.resistKind === "none";
  const rawCast = Math.round((net * (100 + after)) / 100);
  const blockedPct = Math.round((after / (100 + after)) * 100);
  return { net, rawCast, after, isTrue, blockedPct };
}

/**
 * Severity styling for the "% blocked" badge — the at-a-glance "effect on this enemy" signal.
 * Higher block = your damage is more resisted = more alarming color. Color is always paired with
 * the shield icon + the percentage text + a word label in the tooltip (never color alone).
 */
function mitigationStyle(pct: number): { className: string; label: string } {
  if (pct >= 50)
    return {
      className: "border-rose-500/30 bg-rose-500/15 text-rose-300",
      label: "heavily resisted",
    };
  if (pct >= 25)
    return {
      className: "border-amber-500/30 bg-amber-500/15 text-amber-300",
      label: "partly resisted",
    };
  return {
    className: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    label: "barely resisted",
  };
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

  // Inline damage math beside the casts chip (raw → net · resist + % blocked).
  const math = damageMath(durability);
  // A hybrid ability (e.g. magic out + true on return) hits two resist dimensions. A single-resist
  // "raw → net · resist" breakdown and "% blocked" chip are meaningless across both, so we suppress
  // them and instead label the combined per-cast damage with both damage words (e.g. "magic + true").
  const isHybrid = durability.secondaryResistKind != null;
  const mit = math && !isHybrid ? mitigationStyle(math.blockedPct) : null;
  const hybridLabel =
    isHybrid && durability.secondaryResistKind != null
      ? `${RESIST_WORD[durability.resistKind]} + ${RESIST_WORD[durability.secondaryResistKind]}`
      : null;

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
            ~{Math.round(durability.rawHp)} HP &middot;{" "}
            {Math.round(durability.resist)} {resistLabel} (~
            {Math.round(durability.resistAfterPen)} after your pen)
            {hybridLabel != null
              ? `, on its ${RESIST_WORD[durability.resistKind]} part`
              : ""}
          </p>
        )}
        {durability.perCastDamage != null && (
          <p className="mt-0.5 text-muted-foreground">
            ~{Math.round(durability.perCastDamage)} dmg per cast
            {hybridLabel != null ? ` (${hybridLabel})` : ""}
          </p>
        )}
        <p className="mt-1 text-[11px] text-muted-foreground/70">
          Rough estimate of one ability vs full HP — ignores your full combo,
          enemy runes, current HP, shields &amp; bonus-HP passives.
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
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {ehpLabel}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64">
          {gaugeTooltipBody}
        </TooltipContent>
      </Tooltip>

      {/* Damage line — only when the engine produced a per-cast nuke estimate. Wraps the
          casts-to-kill chip together with the inline "what your nuke does to THIS enemy" math:
          raw → net damage · their resist, and a colored "% blocked" severity badge. */}
      {math && (
        <div className="flex flex-wrap items-center gap-1">
          {/* Casts-to-kill chip */}
          {durability.castsToKill != null && keyLabel != null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  className="w-fit cursor-default bg-amber-500/15 text-amber-300 border-amber-500/30"
                  aria-label={`Approximately ${durability.castsToKill} casts of ${abilityDisplayName} to kill`}
                >
                  <Zap aria-hidden="true" />≈{durability.castsToKill}×{" "}
                  {keyLabel}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64">
                <p className="font-medium">
                  ≈{durability.castsToKill}× {abilityDisplayName} to kill
                </p>
                {resistLabel && (
                  <p className="mt-0.5 text-muted-foreground">
                    ~{Math.round(durability.rawHp)} HP &middot;{" "}
                    {Math.round(durability.resist)} {resistLabel} (~
                    {Math.round(durability.resistAfterPen)} after your pen)
                    {hybridLabel != null
                      ? `, on its ${RESIST_WORD[durability.resistKind]} part`
                      : ""}
                  </p>
                )}
                <p className="mt-0.5 text-muted-foreground">
                  ~{math.net} dmg per cast
                  {hybridLabel != null ? ` (${hybridLabel})` : ""}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  Rough estimate of one ability vs full HP — ignores your full
                  combo, enemy runes, current HP, shields &amp; bonus-HP
                  passives.
                </p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* raw → net (· resist) — the calculation, made visible */}
          <Badge
            variant="outline"
            className="cursor-default gap-0.5 tabular-nums text-muted-foreground"
            aria-label={
              hybridLabel != null
                ? `${math.net} ${hybridLabel} damage per cast`
                : math.isTrue
                  ? `${math.net} true damage per cast`
                  : `${math.rawCast} raw damage reduced to ${math.net} per cast after ${math.after} ${resistLabel}`
            }
          >
            {hybridLabel != null ? (
              <>
                <span className="font-medium text-foreground">{math.net}</span>
                <span className="ml-0.5 text-muted-foreground/70">
                  {hybridLabel}
                </span>
              </>
            ) : math.isTrue ? (
              <>
                {math.net}
                <span className="ml-0.5 text-muted-foreground/70">true</span>
              </>
            ) : (
              <>
                {math.rawCast}
                <ArrowRight
                  aria-hidden="true"
                  className="text-muted-foreground/60"
                />
                <span className="font-medium text-foreground">{math.net}</span>
                <span className="ml-0.5 text-muted-foreground/60">
                  · {math.after} {resistLabel}
                </span>
              </>
            )}
          </Badge>

          {/* % blocked severity badge — the at-a-glance "effect on this enemy" signal */}
          {!math.isTrue && mit && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  className={`cursor-default tabular-nums ${mit.className}`}
                  aria-label={`${math.blockedPct}% of your ${abilityDisplayName} damage blocked by their ${resistLabel}`}
                >
                  <Shield aria-hidden="true" />
                  {math.blockedPct}%
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-64">
                <p className="font-medium">
                  {math.blockedPct}% of your damage blocked
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {math.after} {resistLabel} (after your pen) cuts each{" "}
                  {abilityDisplayName} cast from ~{math.rawCast} to ~{math.net}.
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground/70">
                  {mit.label} — rough estimate; ignores your full combo, runes,
                  current HP, shields &amp; bonus-HP passives.
                </p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
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
