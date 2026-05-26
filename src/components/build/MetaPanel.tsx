import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  BarChart2,
  BookOpen,
  ChevronRight,
  Package,
} from "lucide-react";

import { ItemIcon } from "@/components/icons/ItemIcon";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMetaBuild } from "@/hooks/useMetaBuild";
import { cn } from "@/lib/utils";
import type { MetaBuild, MetaItem, MetaItemOption, Rank } from "@/types";

// --- Pretty labels ---

const RANK_LABEL: Record<string, string> = {
  challenger: "Challenger",
  master_plus: "Master+",
  diamond_plus: "Diamond+",
  emerald_plus: "Emerald+",
  platinum_plus: "Platinum+",
};

const ROLE_LABEL: Record<string, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
};

function prettyRole(role: string): string {
  return ROLE_LABEL[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

function prettyRank(rank: string): string {
  return RANK_LABEL[rank] ?? rank;
}

function fmtWinRate(wr: number | null): string {
  if (wr == null) return "—";
  return (wr * 100).toFixed(1) + "%";
}

// --- Sub-components ---

/** A small item icon + name chip used in the meta build lists. */
function MetaItemChip({ item }: { item: MetaItem }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex flex-col items-center gap-0.5 w-14 shrink-0">
          <ItemIcon itemId={item.id} name={item.name} className="size-9" />
          <span className="line-clamp-1 text-[10px] text-muted-foreground leading-tight text-center">
            {item.name}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="font-medium">{item.name}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Situational option row with win-rate badge. Color + icon + text; never color alone. */
function OptionRow({ option }: { option: MetaItemOption }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 cursor-default">
          <ItemIcon
            itemId={option.id}
            name={option.name}
            className="size-7 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{option.name}</p>
          </div>
          {option.winRate != null && (
            <Badge variant="outline" className="shrink-0 gap-1">
              <BarChart2 aria-hidden="true" />
              {fmtWinRate(option.winRate)}
            </Badge>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="font-medium">{option.name}</p>
        {option.winRate != null && (
          <p className="text-muted-foreground">
            {fmtWinRate(option.winRate)} win rate
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Compact skill order display: each slot as a small badge, then max-priority shorthand. */
function SkillOrderLine({
  skillOrder,
  skillMaxPriority,
}: {
  skillOrder: string[];
  skillMaxPriority: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {skillOrder.map((slot, i) => (
        <span
          key={i}
          className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground"
        >
          {slot}
        </span>
      ))}
      {skillMaxPriority && (
        <span className="ml-1 text-[10px] text-muted-foreground">
          Max {skillMaxPriority}
        </span>
      )}
    </div>
  );
}

/**
 * Role selector button group. Uses native button with aria-pressed for a11y
 * (Radix ToggleGroup not yet installed; buttons achieve the same semantics).
 */
function RoleToggle({
  roles,
  active,
  onChange,
  reduceMotion,
}: {
  roles: string[];
  active: string;
  onChange: (r: string) => void;
  reduceMotion: boolean | null;
}) {
  if (roles.length <= 1) return null;
  return (
    <div role="group" aria-label="Select role" className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <button
          key={r}
          type="button"
          aria-pressed={r === active}
          onClick={() => onChange(r)}
          className={cn(
            "rounded-md border px-2 py-0.5 text-[11px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            !reduceMotion && "transition-colors duration-150",
            r === active
              ? "border-primary/60 bg-primary/15 text-primary"
              : "border-border bg-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {prettyRole(r)}
        </button>
      ))}
    </div>
  );
}

// --- Loading skeleton ---

function MetaPanelSkeleton() {
  return (
    <section
      aria-label="Meta build loading"
      aria-busy="true"
      className="flex flex-col gap-2"
    >
      <Skeleton className="h-4 w-32" />
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="size-9 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-4 w-24" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="size-9 rounded-md" />
        ))}
      </div>
    </section>
  );
}

// --- Unavailable state ---

function MetaPanelUnavailable() {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-6 text-center"
    >
      <AlertCircle
        className="size-5 text-muted-foreground"
        aria-hidden="true"
      />
      <p className="text-[11px] text-muted-foreground">
        Meta build unavailable for this champion / patch.
      </p>
    </div>
  );
}

// --- Build content body ---

function MetaBuildContent({ build }: { build: MetaBuild }) {
  return (
    <div className="flex flex-col gap-3">
      {/* Advisory framing — never hidden so users always understand what this panel is. */}
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground px-1">
        <BookOpen className="size-3 shrink-0" aria-hidden="true" />
        What wins on average — independent of the enemy comp.
      </p>

      {/* Core build */}
      {build.coreItems.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Core build
          </span>
          <div className="flex flex-wrap gap-1.5">
            {build.coreItems.map((item) => (
              <MetaItemChip key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Starting items */}
      {build.startingItems.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Starting
          </span>
          <div className="flex flex-wrap gap-1.5">
            {build.startingItems.map((item) => (
              <MetaItemChip key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      {/* Situational options */}
      {build.options.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Situational
          </span>
          <ul className="flex flex-col gap-1">
            {build.options.map((opt) => (
              <li key={opt.id}>
                <OptionRow option={opt} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Skill order */}
      {build.skillOrder.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Skill order
          </span>
          <div className="px-1">
            <SkillOrderLine
              skillOrder={build.skillOrder}
              skillMaxPriority={build.skillMaxPriority}
            />
          </div>
        </div>
      )}

      {/* Source attribution */}
      <div className="flex items-center gap-1 px-1 text-[10px] text-muted-foreground/60">
        <ChevronRight className="size-3" aria-hidden="true" />
        Source: u.gg
      </div>
    </div>
  );
}

// --- Main MetaPanel export ---

interface MetaPanelProps {
  /** DDragon champion id (e.g. "Ahri", "Kaisa"). Null hides the panel. */
  champion: string | null;
  rank: Rank;
}

/**
 * The Meta panel (Tier B): highest win-rate build for the player's champion+role from
 * u.gg data surfaced by the Rust core. Advisory framing — "what wins on average" — not a
 * replacement for the Adapt panel (PROJECT_SPEC §3.5).
 *
 * States: loading (skeleton, not blank), unavailable (calm message + icon), full build view.
 * Role can be toggled locally; changing it re-queries useMetaBuild with the selected role.
 * Respects prefers-reduced-motion; transitions ≤150ms. Color always paired with text+icon.
 */
export function MetaPanel({ champion, rank }: MetaPanelProps) {
  // null role lets Rust resolve the most-played; override once user picks or data arrives.
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  const { data, isLoading, isError } = useMetaBuild(champion, activeRole, rank);

  if (!champion) return null;

  return (
    <section aria-labelledby="meta-heading" className="flex flex-col gap-2.5">
      {/* Header row: label + win-rate badge + rank badge + patch */}
      <div className="flex flex-wrap items-start justify-between gap-1.5">
        <h2
          id="meta-heading"
          className="flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          <Package className="size-3.5" aria-hidden="true" />
          Meta
        </h2>
        {data && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="gap-1">
              <BarChart2 aria-hidden="true" />
              {fmtWinRate(data.winRate)}
            </Badge>
            <Badge variant="secondary">{prettyRank(data.rank)}</Badge>
            <span className="text-[10px] text-muted-foreground">
              {data.patch}
            </span>
          </div>
        )}
      </div>

      {/* Role toggle. `active` tracks the role of the build actually shown (data.role), while
          activeRole drives the query — so the highlight can never point at a build that isn't
          displayed (e.g. a thin-sample role that resolved back to the previous data). */}
      {data && (
        <RoleToggle
          roles={data.availableRoles}
          active={data.role}
          onChange={setActiveRole}
          reduceMotion={reduceMotion}
        />
      )}

      {/* Body */}
      {isLoading && <MetaPanelSkeleton />}
      {!isLoading && (isError || data == null) && <MetaPanelUnavailable />}
      {data && <MetaBuildContent build={data} />}
    </section>
  );
}
