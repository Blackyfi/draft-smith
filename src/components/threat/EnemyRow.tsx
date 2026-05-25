import { ChampionAvatar } from "@/components/icons/ChampionAvatar";
import { SIGNAL_VISUALS } from "@/components/threat/signal-visuals";
import { Badge } from "@/components/ui/badge";
import { ARCHETYPE_LABEL } from "@/lib/labels";
import type { EnemyThreatView } from "@/types";

/**
 * One enemy on the threat board (PROJECT_SPEC §6.3): portrait, detected archetype, and live signal
 * badges — the *why* behind the build, made visible. Each signal badge pairs color + icon + text.
 */
export function EnemyRow({ threat }: { threat: EnemyThreatView }) {
  return (
    <li className="flex items-center gap-2.5 rounded-md px-1 py-1.5">
      <ChampionAvatar name={threat.champion} className="size-8" />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">
            {threat.champion}
          </span>
          <Badge variant="secondary">{ARCHETYPE_LABEL[threat.archetype]}</Badge>
        </div>
        {threat.signals.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {threat.signals.map((signal) => {
              const { label, Icon, className } = SIGNAL_VISUALS[signal];
              return (
                <Badge key={signal} className={className}>
                  <Icon aria-hidden="true" />
                  {label}
                </Badge>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}
