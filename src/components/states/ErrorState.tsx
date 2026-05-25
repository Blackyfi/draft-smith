import { AlertTriangle } from "lucide-react";

/**
 * Unexpected-error state (PROJECT_SPEC §6.4): non-alarming inline message. The poller keeps
 * retrying on its own cadence and will flip back to `in-game`/`no-game` when the Live Client
 * recovers, so this needs no manual retry button — it clears itself.
 */
export function ErrorState() {
  return (
    <div
      role="alert"
      className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
    >
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <AlertTriangle className="size-8 text-amber-400" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">
          Can&apos;t reach the live game
        </h2>
        <p className="max-w-xs text-sm text-muted-foreground">
          Something interrupted the connection to the Live Client. Retrying
          automatically — this will clear on its own once the game responds.
        </p>
      </div>
    </div>
  );
}
