import { CloudOff } from "lucide-react";

import { useDdragonStatus } from "@/hooks/useDdragonStatus";
import { useDdragonVersion } from "@/hooks/useDdragonVersion";
import { useLastUpdated } from "@/hooks/useLastUpdated";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";

/** Formats a Date into a relative "Ns ago" / "Nm ago" string. */
function relativeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  return `${diffMin}m ago`;
}

/**
 * Footer (PROJECT_SPEC §6.3): data provenance, patch version, and last-updated time in-game.
 * Shows the "offline, using cached patch" note when DDragon is unreachable (§6.4).
 */
export function Footer() {
  const { data: ddragon } = useDdragonStatus();
  const { data: status } = useConnectionStatus();
  const offline = ddragon === "offline";
  const inGame = status === "in-game";
  const lastUpdated = useLastUpdated();
  const { data: version } = useDdragonVersion();

  return (
    <footer className="border-t text-[11px] text-muted-foreground">
      <div className="mx-auto flex w-full max-w-app items-center justify-between gap-2 px-3 py-2">
        <span className="flex items-center gap-2">
          <span>data: Live Client + Data Dragon</span>
          {version && (
            <span aria-label={`Patch version ${version}`}>patch {version}</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {inGame && lastUpdated && (
            <span aria-label={`Last updated ${relativeAgo(lastUpdated)}`}>
              updated {relativeAgo(lastUpdated)}
            </span>
          )}
          {offline && (
            <span className="flex items-center gap-1 text-amber-400">
              <CloudOff className="size-3" aria-hidden="true" />
              offline — cached patch
            </span>
          )}
        </span>
      </div>
    </footer>
  );
}
