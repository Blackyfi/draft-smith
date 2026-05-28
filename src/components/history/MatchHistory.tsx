import { ChevronLeft, Clock, History, Swords, Trash2 } from "lucide-react";

import { ChampionAvatar } from "@/components/icons/ChampionAvatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDeleteMatch } from "@/hooks/useMatch";
import { useMatchHistory } from "@/hooks/useMatchHistory";
import { useChampionName } from "@/hooks/useIcon";
import { useUiStore } from "@/store/ui";
import type { MatchSummary } from "@/types";

import {
  RESULT_VISUAL,
  formatDuration,
  formatGameMode,
  formatKda,
  formatRelativeDate,
} from "./matchFormat";

/** A result chip pairing color + icon + text (never color alone, §6.5). */
function ResultChip({ result }: { result: MatchSummary["result"] }) {
  const v = RESULT_VISUAL[result];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${v.className}`}
    >
      <v.Icon className="size-3" aria-hidden="true" />
      {v.label}
    </span>
  );
}

/** One match row: portrait, champion, result, KDA, CS, duration, mode, relative date, delete. */
function MatchRow({ match }: { match: MatchSummary }) {
  const openMatch = useUiStore((s) => s.openMatch);
  const champion = useChampionName(match.selfChampion);
  const del = useDeleteMatch();

  return (
    <li className="group flex items-center gap-3 rounded-lg border bg-card p-2.5 transition-colors hover:border-primary/40 hover:bg-accent/30">
      <button
        type="button"
        onClick={() => openMatch(match.id)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
        aria-label={`Open ${champion} match — ${RESULT_VISUAL[match.result].label}`}
      >
        <ChampionAvatar
          name={match.selfChampion}
          label={champion}
          className="size-10"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold">{champion}</span>
            <ResultChip result={match.result} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Swords className="size-3" aria-hidden="true" />
              {formatKda(match.kills, match.deaths, match.assists)}
            </span>
            <span className="tabular-nums">{match.creepScore} CS</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="size-3" aria-hidden="true" />
              {formatDuration(match.durationSeconds)}
            </span>
            <span>{formatGameMode(match.gameMode)}</span>
            <span>{formatRelativeDate(match.recordedAt)}</span>
          </div>
        </div>
      </button>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive"
            disabled={del.isPending}
            onClick={() => del.mutate(match.id)}
            aria-label={`Delete ${champion} match`}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Delete match</TooltipContent>
      </Tooltip>
    </li>
  );
}

function HistorySkeleton() {
  return (
    <ul className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-lg border p-2.5">
          <Skeleton className="size-10 rounded-md" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 px-6 py-10 text-center"
    >
      <History className="size-6 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium">No matches recorded yet</p>
      <p className="max-w-xs text-[11px] text-muted-foreground">
        Play a game with DraftSmith open and it&apos;ll appear here
        automatically when the game ends.
      </p>
    </div>
  );
}

/**
 * The Match History list (Part A): every recorded game, newest first, with a back link to the idle
 * home. Rows open the detail view; a hover delete removes a record. Skeletons while loading, a
 * friendly empty state when there's nothing yet.
 */
export function MatchHistory() {
  const setIdleView = useUiStore((s) => s.setIdleView);
  const { data: matches, isLoading } = useMatchHistory();

  return (
    <div className="flex min-h-full w-full flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 px-2 text-muted-foreground"
          onClick={() => setIdleView("home")}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Home
        </Button>
        <h1 className="flex items-center gap-1.5 text-sm font-semibold">
          <History className="size-4" aria-hidden="true" />
          Match History
        </h1>
        {matches && matches.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {matches.length} {matches.length === 1 ? "match" : "matches"}
          </span>
        )}
      </div>

      {isLoading ? (
        <HistorySkeleton />
      ) : !matches || matches.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {matches.map((match) => (
            <MatchRow key={match.id} match={match} />
          ))}
        </ul>
      )}
    </div>
  );
}
