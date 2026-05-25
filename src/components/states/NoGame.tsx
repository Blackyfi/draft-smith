import { Gamepad2 } from "lucide-react";

/**
 * Idle empty state, shown when no live game is detected (PROJECT_SPEC §6.4).
 * The Live Client refusing a connection outside a game maps here — it is not an error.
 */
export function NoGame() {
  return (
    <div
      role="status"
      className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center"
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <Gamepad2 className="size-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">
          No game running
        </h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          Launch a game and I&apos;ll start coaching — live item recommendations
          for your champion, adapting to the enemy team.
        </p>
      </div>
    </div>
  );
}
