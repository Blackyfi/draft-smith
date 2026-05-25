import { SettingsIcon } from "lucide-react";

import { ChampionAvatar } from "@/components/icons/ChampionAvatar";
import { Button } from "@/components/ui/button";
import { useGameState } from "@/hooks/useGameState";
import { useChampionName } from "@/hooks/useIcon";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";
import type { ConnectionStatus } from "@/types";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  "no-game": "No game",
  connecting: "Connecting…",
  "in-game": "In game",
  error: "Error",
};

/** Status dot color — always paired with the text label, so color is never the only signal. */
const STATUS_DOT: Record<ConnectionStatus, string> = {
  "no-game": "bg-muted-foreground/40",
  connecting: "bg-sky-500 animate-pulse",
  "in-game": "bg-emerald-500",
  error: "bg-destructive",
};

/** Formats seconds since game start as `m:ss`. */
function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Header strip (PROJECT_SPEC §6.3): your champion (icon + name) on the left, game clock + the
 * connection status on the right. The champion/clock come from the latest `game-state-changed`
 * summary; before a game (or before the local player is identifiable) it falls back to the product
 * name and hides the clock.
 */
export function Header({ status }: { status: ConnectionStatus }) {
  const { data: game } = useGameState();
  const champion = game?.selfChampion ?? null;
  // Live Client id ("Kaisa") → friendly display name ("Kai'Sa").
  const championName = useChampionName(champion);
  const inGame = status === "in-game";
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const { status: updateStatus } = useUpdateCheck();
  const updateAvailable = updateStatus === "available";

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-app items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {inGame && champion ? (
            <>
              <ChampionAvatar
                name={champion}
                label={championName}
                className="size-8"
              />
              <span className="truncate text-sm font-semibold tracking-tight">
                {championName}
              </span>
            </>
          ) : (
            <span className="text-sm font-semibold tracking-tight">
              DraftSmith
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          {inGame && game && (
            <span className="tabular-nums" aria-label="Game time">
              {formatClock(game.gameTime)}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <span
              className={cn("size-2 rounded-full", STATUS_DOT[status])}
              aria-hidden="true"
            />
            {STATUS_LABEL[status]}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="relative size-7"
            aria-label={
              updateAvailable
                ? "Open settings (update available)"
                : "Open settings"
            }
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon className="size-4" aria-hidden="true" />
            {updateAvailable && (
              <span
                className="absolute right-0.5 top-0.5 size-2 rounded-full bg-amber-400"
                aria-label="Update available"
                title="Update available"
              />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
