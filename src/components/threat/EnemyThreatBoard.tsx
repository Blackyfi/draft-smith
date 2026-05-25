import { Users } from "lucide-react";

import { EnemyRow } from "@/components/threat/EnemyRow";
import type { EnemyThreatView } from "@/types";

/**
 * The enemy threat board (PROJECT_SPEC §6.3): the five enemies as compact rows, the visible
 * rationale for the recommended build. Renders nothing when the engine hasn't classified anyone
 * yet (the parent shows the early state instead).
 */
export function EnemyThreatBoard({ threats }: { threats: EnemyThreatView[] }) {
  if (threats.length === 0) return null;

  return (
    <section aria-labelledby="threats-heading" className="flex flex-col gap-1">
      <h2
        id="threats-heading"
        className="flex items-center gap-1.5 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
      >
        <Users className="size-3.5" aria-hidden="true" />
        Enemy threats
      </h2>
      <ul className="flex flex-col divide-y divide-border/60">
        {threats.map((threat) => (
          <EnemyRow key={threat.champion} threat={threat} />
        ))}
      </ul>
    </section>
  );
}
