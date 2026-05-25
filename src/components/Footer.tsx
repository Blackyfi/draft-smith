import { CloudOff } from "lucide-react";

import { useDdragonStatus } from "@/hooks/useDdragonStatus";

/**
 * Footer (PROJECT_SPEC §6.3): the data provenance line, plus an unobtrusive "offline, using cached
 * patch" note when DDragon couldn't be reached and the app is running from cache (§6.4).
 */
export function Footer() {
  const { data: ddragon } = useDdragonStatus();
  const offline = ddragon === "offline";

  return (
    <footer className="flex items-center justify-between gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
      <span>data: Live Client + Data Dragon</span>
      {offline && (
        <span className="flex items-center gap-1 text-amber-400">
          <CloudOff className="size-3" aria-hidden="true" />
          offline — cached patch
        </span>
      )}
    </footer>
  );
}
