import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  Clock,
  ListOrdered,
  ScrollText,
  ShieldQuestion,
  ShoppingBag,
  Swords,
  Users,
} from "lucide-react";

import { ChampionAvatar } from "@/components/icons/ChampionAvatar";
import { ItemIcon } from "@/components/icons/ItemIcon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatch } from "@/hooks/useMatch";
import {
  useChampionName,
  useChampionNames,
  useItemMeta,
} from "@/hooks/useIcon";
import { useSettings } from "@/hooks/useSettings";
import { slotToKey } from "@/lib/abilityKeys";
import { useUiStore } from "@/store/ui";
import type {
  AbilityKeys,
  DiagnosticSnapshot,
  EnemyDiagnostic,
  ItemEvent,
  LevelEvent,
  MatchPlayer,
  MatchRecord,
  SkillEvent,
} from "@/types";

import {
  RESULT_VISUAL,
  type ChampionResolver,
  describeEvent,
  formatDuration,
  formatGameMode,
  formatKda,
  formatRelativeDate,
} from "./matchFormat";
import { MatchScrubber } from "./MatchScrubber";
import {
  type RunningScore,
  buildNameIndex,
  diagnosticAt,
  eventMarkers,
  inventoryAt,
  levelAt,
  playerForName,
  runningScores,
} from "./matchTimeline";

const DEFAULT_ABILITY_KEYS: AbilityKeys = {
  layout: "qwerty",
  custom: ["Q", "W", "E", "R"],
  movementMode: "mouse",
};

const ZERO_SCORE: RunningScore = { kills: 0, deaths: 0, assists: 0 };

/** Section wrapper with a consistent muted uppercase heading (matches the dashboard panels). */
function Section({
  title,
  Icon,
  children,
  aside,
}: {
  title: string;
  Icon: typeof Clock;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <Icon className="size-3.5" aria-hidden="true" />
        {title}
        {aside}
      </h2>
      {children}
    </section>
  );
}

/**
 * One scoreboard row. At the live (end-of-game) position it shows the final items + scoreline; while
 * scrubbing it shows the inventory, running K/D/A, and champion level reconstructed at that moment.
 */
function PlayerScoreRow({
  player,
  isLive,
  itemTimeline,
  levelTimeline,
  scrubTime,
  score,
}: {
  player: MatchPlayer;
  isLive: boolean;
  itemTimeline: ItemEvent[];
  levelTimeline: LevelEvent[];
  scrubTime: number;
  score: RunningScore;
}) {
  const champion = useChampionName(player.champion);
  const items = isLive
    ? player.finalItems.map((i) => ({ id: i.id, name: i.name }))
    : inventoryAt(itemTimeline, player.key, scrubTime);
  const subtitle = isLive
    ? `${formatKda(player.kills, player.deaths, player.assists)} · ${player.creepScore} CS`
    : `${formatKda(score.kills, score.deaths, score.assists)} · Lv ${levelAt(
        levelTimeline,
        player.key,
        scrubTime,
      )}`;

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
          {subtitle}
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap justify-end gap-0.5">
        {items.map((item, i) => (
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
function Scoreboard({
  players,
  isLive,
  itemTimeline,
  levelTimeline,
  scrubTime,
  scores,
}: {
  players: MatchPlayer[];
  isLive: boolean;
  itemTimeline: ItemEvent[];
  levelTimeline: LevelEvent[];
  scrubTime: number;
  scores: Map<string, RunningScore>;
}) {
  const selfTeam = players.find((p) => p.isSelf)?.team;
  const teams = [...new Set(players.map((p) => p.team).filter(Boolean))].sort(
    (a, b) => Number(b === selfTeam) - Number(a === selfTeam),
  );

  return (
    <Section
      title="Scoreboard"
      Icon={Users}
      aside={
        !isLive && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground normal-case tabular-nums">
            @ {formatDuration(scrubTime)}
          </span>
        )
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {teams.map((team) => (
          <ul key={team} className="flex flex-col gap-1">
            <span className="px-1 text-[11px] font-semibold text-muted-foreground">
              {team === selfTeam ? "Your team" : "Enemy team"}
            </span>
            {players
              .filter((p) => p.team === team)
              .map((p) => (
                <PlayerScoreRow
                  key={p.key}
                  player={p}
                  isLive={isLive}
                  itemTimeline={itemTimeline}
                  levelTimeline={levelTimeline}
                  scrubTime={scrubTime}
                  score={scores.get(p.key) ?? ZERO_SCORE}
                />
              ))}
          </ul>
        ))}
      </div>
    </Section>
  );
}

/** One build-timeline tile: order badge + item icon + resolved name + acquisition time. */
function BuildItem({
  event,
  order,
  dim,
}: {
  event: ItemEvent;
  order: number;
  dim: boolean;
}) {
  const { data: meta } = useItemMeta(event.itemId);
  const name = event.name || meta?.name || String(event.itemId);
  return (
    <li
      className={`flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 transition-opacity ${
        dim ? "opacity-40" : ""
      }`}
    >
      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-muted px-1 text-[11px] font-semibold text-muted-foreground tabular-nums">
        #{order}
      </span>
      <ItemIcon itemId={event.itemId} name={name} className="size-7 rounded" />
      <span className="min-w-0 flex-1 truncate text-xs">{name}</span>
      <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
        {formatDuration(event.gameTime)}
      </span>
    </li>
  );
}

/**
 * The local player's purchases over time, numbered in acquisition order. Items not yet bought at the
 * current scrubber position are dimmed (removals are noise here and excluded).
 */
function BuildTimeline({
  itemTimeline,
  selfKey,
  scrubTime,
}: {
  itemTimeline: ItemEvent[];
  selfKey: string | undefined;
  scrubTime: number;
}) {
  const acquisitions = itemTimeline.filter(
    (e) => e.playerKey === selfKey && e.kind === "acquired",
  );
  if (acquisitions.length === 0) return null;
  return (
    <Section title="Your build" Icon={ShoppingBag}>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {acquisitions.map((e, i) => (
          <BuildItem
            key={`${e.itemId}-${i}`}
            event={e}
            order={i + 1}
            dim={e.gameTime > scrubTime}
          />
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

/**
 * Chronological kill/objective/game log. Each player name is annotated with their champion via
 * `championOf`; lines past the scrubber position are hidden so the log reveals as you scrub forward.
 */
function EventLog({
  events,
  championOf,
  scrubTime,
}: {
  events: MatchRecord["events"];
  championOf: ChampionResolver;
  scrubTime: number;
}) {
  const lines = events
    .filter((e) => e.gameTime <= scrubTime)
    .map((e) => ({ time: e.gameTime, text: describeEvent(e, championOf) }))
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

/**
 * One enemy's durability/MR resolution at the scrubbed moment. The headline is the resolved magic
 * resist (base + item MR); the "shown" line is the resist the in-game gauge actually displayed vs
 * the player's damage type. A mismatch (resolved MR > 0 but a magic gauge showing 0), or
 * `defensesResolved=false`, is exactly the "no MR" symptom — flagged in amber so it stands out.
 */
function EnemyDiagRow({ diag }: { diag: EnemyDiagnostic }) {
  const champion = useChampionName(diag.champion);
  const hasResist = diag.resistKind === "magic" || diag.resistKind === "armor";
  const resistWord = diag.resistKind === "magic" ? "MR" : "armor";
  // The bug signature: a real resist was resolved (resist > 0) but penetration wiped it to 0 after
  // pen — the number the damage badge shows. Or defenses never resolved at all.
  const penCollapsed =
    hasResist && (diag.resist ?? 0) > 0 && (diag.resistAfterPen ?? 0) === 0;
  const flagged = !diag.defensesResolved || penCollapsed;

  return (
    <li
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
        flagged ? "border-amber-500/40 bg-amber-500/10" : "bg-muted/30"
      }`}
    >
      <ChampionAvatar
        name={diag.champion}
        label={champion}
        className="size-7 shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">
          {champion}
          <span className="ml-1 text-[11px] font-normal text-muted-foreground tabular-nums">
            Lv {diag.level} · {diag.items.length} items
          </span>
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {diag.defensesResolved ? (
            <>
              resolved: MR {diag.mr ?? 0} · armor {diag.armor ?? 0} ·{" "}
              {diag.hp ?? 0} HP
            </>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-400">
              <AlertTriangle className="size-3" aria-hidden="true" />
              defenses unresolved — no gauge shown
            </span>
          )}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="text-[11px] text-muted-foreground">
          gauge {hasResist ? resistWord : "resist"}
        </span>
        <span
          className={`font-semibold tabular-nums ${penCollapsed ? "text-amber-400" : ""}`}
        >
          {diag.resistKind == null
            ? "—"
            : diag.resistKind === "none"
              ? "no resist"
              : `${diag.resist ?? 0} → ${diag.resistAfterPen ?? 0}`}
        </span>
        {hasResist && (
          <span className="text-[10px] text-muted-foreground">after pen</span>
        )}
      </div>
    </li>
  );
}

/**
 * Durability/MR debug panel: shows what the engine actually resolved for each enemy at the scrubbed
 * moment — resolved MR/armor/HP vs the resist the gauge displayed — so a recorded game reveals
 * whether (and where) enemy MR calculation drops. Time-aware: reflects the latest recompute ≤ the
 * scrubber position.
 */
function DurabilityDiagnostics({
  diagnostics,
  scrubTime,
}: {
  diagnostics: DiagnosticSnapshot[];
  scrubTime: number;
}) {
  const snap = useMemo(
    () => diagnosticAt(diagnostics, scrubTime),
    [diagnostics, scrubTime],
  );
  if (diagnostics.length === 0) return null;

  return (
    <Section
      title="Durability diagnostics (MR)"
      Icon={ShieldQuestion}
      aside={
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground normal-case tabular-nums">
          @ {formatDuration(scrubTime)}
        </span>
      }
    >
      {snap == null ? (
        <p className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          No recompute recorded yet at this point.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 text-[11px] text-muted-foreground">
            <span
              className={`inline-flex items-center gap-1 ${snap.ddragonReady ? "" : "text-amber-400"}`}
            >
              {!snap.ddragonReady && (
                <AlertTriangle className="size-3" aria-hidden="true" />
              )}
              DDragon {snap.ddragonReady ? "ready" : "NOT ready"}
            </span>
            <span
              className={`inline-flex items-center gap-1 ${snap.selfNuke ? "" : "text-amber-400"}`}
            >
              {!snap.selfNuke && (
                <AlertTriangle className="size-3" aria-hidden="true" />
              )}
              your nuke: {snap.selfNuke ?? "unauthored (no resist applied)"}
            </span>
            {/* Raw Live Client pen multipliers (1.0 = no penetration; lower = more). Shown so the
                engine's inversion can be sanity-checked against the enemy after-pen values below. */}
            <span className="inline-flex items-center gap-1 tabular-nums">
              pen: magic {snap.selfMagicPenPercent}× / {snap.selfMagicPenFlat}{" "}
              flat · armor {snap.selfArmorPenPercent}× / {snap.selfArmorPenFlat}{" "}
              flat
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {snap.enemies.map((d, i) => (
              <EnemyDiagRow key={`${d.champion}-${i}`} diag={d} />
            ))}
          </ul>
        </div>
      )}
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
          <span>{formatRelativeDate(match.endedAt)}</span>
        </div>
      </div>
    </div>
  );
}

/** The body of a loaded match: the replay scrubber drives every time-aware panel below it. */
function MatchBody({ match }: { match: MatchRecord }) {
  const duration = match.durationSeconds;
  const selfKey = match.players.find((p) => p.isSelf)?.key;

  // `null` = the live/final position; any number is a scrubbed-back game time. The parent keys this
  // component on the match id, so opening another record remounts it and starts fresh at the end.
  const [scrub, setScrub] = useState<number | null>(null);
  const scrubTime = scrub ?? duration;
  const isLive = scrub === null || scrub >= duration;

  const nameIndex = useMemo(
    () => buildNameIndex(match.players),
    [match.players],
  );
  const championNames = useChampionNames(match.players.map((p) => p.champion));
  const championOf = useMemo<ChampionResolver>(
    () => (name) => {
      const player = playerForName(nameIndex, name);
      if (!player) return undefined;
      return championNames.get(player.champion) ?? player.champion;
    },
    [nameIndex, championNames],
  );

  const markers = useMemo(() => eventMarkers(match.events), [match.events]);
  const scores = useMemo(
    () => runningScores(match.events, nameIndex, match.players, scrubTime),
    [match.events, nameIndex, match.players, scrubTime],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Always-visible scrubber: sticks to the top of the scroll area as the page scrolls. */}
      <div className="sticky top-0 z-20 -mx-3 border-b bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <MatchScrubber
          duration={duration}
          value={scrubTime}
          onChange={setScrub}
          markers={markers}
        />
      </div>

      <DetailHeader match={match} />
      <Scoreboard
        players={match.players}
        isLive={isLive}
        itemTimeline={match.itemTimeline}
        levelTimeline={match.levelTimeline}
        scrubTime={scrubTime}
        scores={scores}
      />
      <BuildTimeline
        itemTimeline={match.itemTimeline}
        selfKey={selfKey}
        scrubTime={scrubTime}
      />
      <SkillOrder skillTimeline={match.skillTimeline} />
      <EventLog
        events={match.events}
        championOf={championOf}
        scrubTime={scrubTime}
      />
      <DurabilityDiagnostics
        diagnostics={match.diagnostics}
        scrubTime={scrubTime}
      />
    </div>
  );
}

/**
 * The Match Detail view: a full scoreboard, the local player's build + skill timelines, and a
 * chronological event log for one recorded game, with a replay scrubber that rewinds every panel to
 * any moment of the match. Back returns to the history list.
 */
export function MatchDetail() {
  const selectedMatchId = useUiStore((s) => s.selectedMatchId);
  const closeMatch = useUiStore((s) => s.closeMatch);
  const { data: match, isLoading } = useMatch(selectedMatchId);

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
        <MatchBody key={match.id} match={match} />
      )}
    </div>
  );
}
