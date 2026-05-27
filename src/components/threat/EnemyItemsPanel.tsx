import { AlertTriangle, Eye, ShoppingBag } from "lucide-react";

import { ItemIcon } from "@/components/icons/ItemIcon";
import {
  abbreviateStatLabel,
  buildEnemyItemList,
} from "@/components/threat/enemyItemsHelpers";
import { intentVisual } from "@/components/threat/intent-visuals";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChampionName, useItemMeta } from "@/hooks/useIcon";
import type { EnemyThreatView, IntentTag, ItemIntel } from "@/types";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Single owner name resolved to a friendly display name. */
function OwnerName({ name }: { name: string }) {
  const display = useChampionName(name);
  return <>{display}</>;
}

/** Comma-joined list of friendly champion display names for an item's owners. */
function OwnerNames({ owners }: { owners: string[] }) {
  if (owners.length === 0) return null;
  return (
    <span className="text-[11px] leading-tight text-muted-foreground">
      {owners.map((o, i) => (
        <span key={o}>
          {i > 0 && ", "}
          <OwnerName name={o} />
        </span>
      ))}
    </span>
  );
}

/** Intent tag pills row — skips unknown/unmapped tags. */
function IntentPills({ intents }: { intents: IntentTag[] }) {
  const mapped = intents.flatMap((tag) => {
    const v = intentVisual(tag);
    return v ? [{ tag, v }] : [];
  });
  if (mapped.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {mapped.map(({ tag, v }) => (
        <Tooltip key={tag}>
          <TooltipTrigger asChild>
            <Badge className={`${v.className} cursor-default`}>
              <v.Icon aria-hidden="true" />
              {v.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-60">
            <p className="font-medium">{v.label}</p>
            <p className="mt-0.5 text-muted-foreground">{v.description}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/**
 * The stripped DDragon item description, rendered inside the icon's hover tooltip — fetches from the
 * hook, shows a skeleton while loading, omits gracefully when empty or unavailable. Kept out of the
 * tile body so tiles stay compact and many fit on screen without scrolling; the full text is one
 * hover away.
 */
function ItemDescription({ itemId }: { itemId: number }) {
  const { data: meta, isLoading } = useItemMeta(itemId);
  const text = meta?.description || meta?.plaintext || null;

  if (isLoading) {
    return <Skeleton className="mt-1 h-3 w-40" />;
  }
  if (!text) return null;
  return (
    <p className="mt-1 whitespace-pre-line text-[11px] leading-relaxed text-muted-foreground">
      {text}
    </p>
  );
}

/**
 * One medium tile in the Enemy Items grid: icon + name + owners + intent pills, plus the inline
 * "Built against you" warning when the item counters the player. The long DDragon description lives
 * in the icon's hover tooltip rather than inline, keeping the tile short so the adaptive grid can
 * pack two-plus items per row.
 */
function ItemCard({ id, intel }: { id: number; intel: ItemIntel | undefined }) {
  const { data: meta } = useItemMeta(id);
  const name = intel?.name ?? meta?.name ?? String(id);

  return (
    <div className="flex h-full flex-col gap-1.5 rounded-lg border bg-muted/30 p-2">
      {/* Top row: icon (hover → full description) + name + owners */}
      <div className="flex items-start gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="shrink-0">
              <ItemIcon itemId={id} name={name} className="size-10" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-72">
            <p className="font-medium">{name}</p>
            <ItemDescription itemId={id} />
          </TooltipContent>
        </Tooltip>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium leading-tight">{name}</span>
          {intel && <OwnerNames owners={intel.owners} />}
        </div>
      </div>

      {/* Stat line — the actual values from the game data, e.g. "18 Lethality · 200 HP · 15 Haste".
          A flex-wrap row so each stat (value + compact label) stays intact but the set reflows onto
          multiple rows on narrow tiles instead of overflowing the box. `min-w-0` lets the row shrink
          within the flex card. */}
      {meta?.stats && meta.stats.length > 0 && (
        <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[11px] leading-snug text-muted-foreground">
          {meta.stats.map((s, i) => (
            <span key={`${s.label}-${i}`} className="whitespace-nowrap">
              <span className="font-semibold tabular-nums text-foreground/80">
                {s.value}
              </span>{" "}
              <span>{abbreviateStatLabel(s.label)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Intent pills */}
      {intel && <IntentPills intents={intel.intents} />}

      {/* Counter warning chip */}
      {intel?.countersYou && (
        <div className="mt-auto flex flex-col gap-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
          <div className="flex items-center gap-1">
            <AlertTriangle
              className="size-3 shrink-0 text-amber-400"
              aria-hidden="true"
            />
            <span className="text-[11px] font-semibold text-amber-300">
              Built against you
            </span>
          </div>
          {intel.countersYouReason && (
            <p className="text-[11px] text-muted-foreground">
              {intel.countersYouReason}
            </p>
          )}
          {intel.counterHint && (
            <p className="text-[11px] text-amber-300/80">{intel.counterHint}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-6 text-center"
    >
      <Eye className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-[11px] text-muted-foreground">
        Watching enemy purchases — items appear here as they buy.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface EnemyItemsPanelProps {
  threats: EnemyThreatView[];
  enemyItems: ItemIntel[];
}

/**
 * Third dashboard column: lists every item the enemies own, enriched with strategic intent pills,
 * counter warnings, and the stripped DDragon description. Items that counter the player float to
 * the top.
 *
 * `buildEnemyItemList` (pure helper) handles the union/dedup/sort logic and is unit-tested
 * separately. This component is presentational only. Color always paired with text + icon.
 */
export function EnemyItemsPanel({ threats, enemyItems }: EnemyItemsPanelProps) {
  const items = buildEnemyItemList(threats, enemyItems);

  return (
    <section
      aria-labelledby="enemy-items-heading"
      className="flex flex-col gap-1"
    >
      <h2
        id="enemy-items-heading"
        className="flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        <ShoppingBag className="size-3.5" aria-hidden="true" />
        Enemy items
      </h2>

      {items.length === 0 ? (
        <EmptyState />
      ) : (
        // Adaptive grid: auto-fill tracks of ~12.5rem so the panel shows as many items per row as
        // its current width allows — two-plus columns in the wide (2fr) dashboard track, collapsing
        // to one in the compact overlay — without the player scrolling mid-game.
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-2">
          {items.map(({ id, intel }) => (
            <li key={id} className="min-w-0">
              <ItemCard id={id} intel={intel} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
