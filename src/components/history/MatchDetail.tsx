import {
  ChevronLeft,
  Clock,
  ListOrdered,
  ScrollText,
  ShoppingBag,
  Swords,
  Users,
} from "lucide-react";

import { ChampionAvatar } from "@/components/icons/ChampionAvatar";
import { ItemIcon } from "@/components/icons/ItemIcon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatch } from "@/hooks/useMatch";
import { useChampionName, useItemMeta } from "@/hooks/useIcon";
import { useSettings } from "@/hooks/useSettings";
import { slotToKey } from "@/lib/abilityKeys";
import { useUiStore } from "@/store/ui";
import type {
  AbilityKeys,
  ItemEvent,
  MatchPlayer,
  MatchRecord,
  SkillEvent,
} from "@/types";

import {
  RESULT_VISUAL,
  describeEvent,
  formatDuration,
  formatGameMode,
  formatKda,
  formatRelativeDate,
} from "./matchFormat";

const DEFAULT_ABILITY_KEYS: AbilityKeys = {
  layout: "qwerty",
  custom: ["Q", "W", "E", "R"],
  movementMode: "mouse",
};

/** Section wrapper with a consistent muted uppercase heading (matches the dashboard panels). */
function Section({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: typeof Clock;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

/** One scoreboard row. Resolves the champion display name and renders the final item set. */
function PlayerScoreRow({ player }: { player: MatchPlayer }) {
  const champion = useChampionName(player.champion);
  return (
    <li
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 ${
        player.isSelf ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/30"
      }`}
    >
      <ChampionAvatar
        name={player.champion}
        label={champion}
        className="size-8 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium">
          {champion}
          {player.isSelf && (
            <span className="ml-1 text-[11px] font-semibold text-primary">
              YOU
            </span>
          )}
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatKda(player.kills, player.deaths, player.assists)} ·{" "}
          {player.creepScore} CS
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-0.5">
        {player.finalItems.map((item, i) => (
          <ItemIcon
            key={`${item.id}-${i}`}
            itemId={item.id}
            name={item.name}
            className="size-5 rounded"
          />
        ))}
      </div>
    </li>
  );
}

/** Both teams as compact scoreboards; the local player's team is shown first. */
function Scoreboard({ players }: { players: MatchPlayer[] }) {
  const selfTeam = players.find((p) => p.isSelf)?.team;
  const teams = [...new Set(players.map((p) => p.team).filter(Boolean))].sort(
    (a, b) => Number(b === selfTeam) - Number(a === selfTeam),
  );

  return (
    <Section title="Scoreboard" Icon={Users}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {teams.map((team) => (
          <ul key={team} className="flex flex-col gap-1">
            <span className="px-1 text-[11px] font-semibold text-muted-foreground">
              {team === selfTeam ? "Your team" : "Enemy team"}
            </span>
            {players
              .filter((p) => p.team === team)
              .map((p) => (
                <PlayerScoreRow key={p.key} player={p} />
              ))}
          </ul>
        ))}
      </div>
    </Section>
  );
}

/** One build-timeline tile: item icon + resolved name + acquisition time. */
function BuildItem({ event }: { event: ItemEvent }) {
  const { data: meta } = useItemMeta(event.itemId);
  const name = event.name || meta?.name || String(event.itemId);
  return (
    <li className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5">
      <ItemIcon itemId={event.itemId} name={name} className="size-7 rounded" />
      <span className="min-w-0 flex-1 truncate text-xs">{name}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {formatDuration(event.gameTime)}
      </span>
    </li>
  );
}

/** The local player's purchases over time (acquisitions only; removals are noise here). */
function BuildTimeline({
  itemTimeline,
  selfKey,
}: {
  itemTimeline: ItemEvent[];
  selfKey: string | undefined;
}) {
  const acquisitions = itemTimeline.filter(
    (e) => e.playerKey === selfKey && e.kind === "acquired",
  );
  if (acquisitions.length === 0) return null;
  return (
    <Section title="Your build" Icon={ShoppingBag}>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {acquisitions.map((e, i) => (
          <BuildItem key={`${e.itemId}-${i}`} event={e} />
        ))}
      </ul>
    </Section>
  );
}

/** The local player's skill-point spends as an ordered row of key badges (rank + time). */
function SkillOrder({ skillTimeline }: { skillTimeline: SkillEvent[] }) {
  const { data: settings } = useSettings();
  const abilityKeys = settings?.abilityKeys ?? DEFAULT_ABILITY_KEYS;
  if (skillTimeline.length === 0) return null;
  return (
    <Section title="Your skill order" Icon={ListOrdered}>
      <ol className="flex flex-wrap gap-1.5">
        {skillTimeline.map((s, i) => {
          const key = slotToKey(s.slot, abilityKeys);
          return (
            <li
              key={i}
              className="flex flex-col items-center gap-0.5"
              title={`${s.abilityName || s.slot} → rank ${s.abilityRank} at ${formatDuration(s.gameTime)}`}
            >
              <span className="flex h-7 min-w-7 items-center justify-center rounded-md bg-muted px-1.5 text-xs font-bold tabular-nums">
                {key}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {s.abilityRank}
              </span>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

/** Chronological kill/objective/game log (events with nothing to show are dropped). */
function EventLog({ events }: { events: MatchRecord["events"] }) {
  const lines = events
    .map((e) => ({ time: e.gameTime, text: describeEvent(e) }))
    .filter((l): l is { time: number; text: string } => l.text !== null);
  if (lines.length === 0) return null;
  return (
    <Section title="Event log" Icon={ScrollText}>
      <ul className="flex flex-col divide-y divide-border/60 rounded-md border bg-card">
        {lines.map((l, i) => (
          <li
            key={i}
            className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]"
          >
            <span className="w-10 shrink-0 text-muted-foreground tabular-nums">
              {formatDuration(l.time)}
            </span>
            <span className="min-w-0 flex-1">{l.text}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-3" aria-hidden="true">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/** Header strip: portrait, champion, result, and game meta (duration / mode / patch / date). */
function DetailHeader({ match }: { match: MatchRecord }) {
  const champion = useChampionName(match.selfChampion);
  const v = RESULT_VISUAL[match.result];
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <ChampionAvatar
        name={match.selfChampion}
        label={champion}
        className="size-12"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{champion}</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold ${v.className}`}
          >
            <v.Icon className="size-3" aria-hidden="true" />
            {v.label}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Clock className="size-3" aria-hidden="true" />
            {formatDuration(match.durationSeconds)}
          </span>
          <span>{formatGameMode(match.gameMode)}</span>
          <span>Patch {match.patch}</span>
          <span>{formatRelativeDate(match.recordedAt)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The Match Detail view (Part A): full scoreboard, the local player's build + skill timelines, and a
 * chronological event log for one recorded game. Back returns to the history list.
 */
export function MatchDetail() {
  const selectedMatchId = useUiStore((s) => s.selectedMatchId);
  const closeMatch = useUiStore((s) => s.closeMatch);
  const { data: match, isLoading } = useMatch(selectedMatchId);

  const selfKey = match?.players.find((p) => p.isSelf)?.key;

  return (
    <div className="flex min-h-full w-full flex-col gap-3 p-3">
      <Button
        variant="ghost"
        size="sm"
        className="w-fit gap-1 px-2 text-muted-foreground"
        onClick={closeMatch}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Back to history
      </Button>

      {isLoading ? (
        <DetailSkeleton />
      ) : !match ? (
        <div
          role="status"
          className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-6 py-10 text-center"
        >
          <Swords className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">Match not found</p>
          <p className="text-[11px] text-muted-foreground">
            It may have been deleted.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <DetailHeader match={match} />
          <Scoreboard players={match.players} />
          <BuildTimeline itemTimeline={match.itemTimeline} selfKey={selfKey} />
          <SkillOrder skillTimeline={match.skillTimeline} />
          <EventLog events={match.events} />
        </div>
      )}
    </div>
  );
}
