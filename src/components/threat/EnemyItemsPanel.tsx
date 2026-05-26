import { AlertTriangle, Eye, ShoppingBag } from "lucide-react";

import { ItemIcon } from "@/components/icons/ItemIcon";
import { buildEnemyItemList } from "@/components/threat/enemyItemsHelpers";
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
    <span className="text-[10px] leading-tight text-muted-foreground">
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
 * The stripped DDragon item description — fetches from the hook, shows a skeleton while loading,
 * omits gracefully when empty or unavailable.
 */
function ItemDescription({ itemId }: { itemId: number }) {
  const { data: meta, isLoading } = useItemMeta(itemId);
  const text = meta?.description || meta?.plaintext || null;

  if (isLoading) {
    return <Skeleton className="mt-1 h-3 w-3/4" />;
  }
  if (!text) return null;
  return (
    <p className="whitespace-pre-line text-[10px] leading-relaxed text-muted-foreground">
      {text}
    </p>
  );
}

/** One item card in the Enemy Items panel. */
function ItemCard({ id, intel }: { id: number; intel: ItemIntel | undefined }) {
  const { data: meta } = useItemMeta(id);
  const name = intel?.name ?? meta?.name ?? String(id);

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-2">
      {/* Top row: icon + name + owners */}
      <div className="flex items-start gap-2">
        <ItemIcon itemId={id} name={name} className="size-10 shrink-0" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs font-medium leading-tight">{name}</span>
          {intel && <OwnerNames owners={intel.owners} />}
        </div>
      </div>

      {/* Intent pills */}
      {intel && <IntentPills intents={intel.intents} />}

      {/* Counter warning chip */}
      {intel?.countersYou && (
        <div className="flex flex-col gap-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
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
            <p className="text-[10px] text-muted-foreground">
              {intel.countersYouReason}
            </p>
          )}
          {intel.counterHint && (
            <p className="text-[10px] text-amber-300/80">{intel.counterHint}</p>
          )}
        </div>
      )}

      {/* Full stripped description */}
      <ItemDescription itemId={id} />
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
        <ul className="flex flex-col gap-2">
          {items.map(({ id, intel }) => (
            <li key={id}>
              <ItemCard id={id} intel={intel} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
