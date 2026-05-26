import { ChampionAvatar } from "@/components/icons/ChampionAvatar";
import { SIGNAL_VISUALS } from "@/components/threat/signal-visuals";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChampionName } from "@/hooks/useIcon";
import {
  ARCHETYPE_DESCRIPTION,
  ARCHETYPE_LABEL,
  SIGNAL_DESCRIPTION,
} from "@/lib/labels";
import type { EnemyThreatView } from "@/types";

/**
 * One enemy on the threat board (PROJECT_SPEC §6.3): portrait, detected archetype, and live signal
 * badges — the *why* behind the build, made visible. Each signal badge pairs color + icon + text,
 * and every pill (archetype + signals) explains itself on hover/focus via a tooltip.
 */
export function EnemyRow({ threat }: { threat: EnemyThreatView }) {
  // `threat.champion` is the Live Client id ("Kaisa"); the icon resolves by id, the text shows the
  // friendly name ("Kai'Sa").
  const champion = useChampionName(threat.champion);
  return (
    <li className="flex items-center gap-2.5 rounded-md px-1 py-1.5">
      <ChampionAvatar
        name={threat.champion}
        label={champion}
        className="size-8"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{champion}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="cursor-default">
                {ARCHETYPE_LABEL[threat.archetype]}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-60">
              <p className="font-medium">{ARCHETYPE_LABEL[threat.archetype]}</p>
              <p className="mt-0.5 text-muted-foreground">
                {ARCHETYPE_DESCRIPTION[threat.archetype]}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        {threat.signals.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {threat.signals.map((signal) => {
              const { label, Icon, className } = SIGNAL_VISUALS[signal];
              return (
                <Tooltip key={signal}>
                  <TooltipTrigger asChild>
                    <Badge className={`${className} cursor-default`}>
                      <Icon aria-hidden="true" />
                      {label}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-60">
                    <p className="font-medium">{label}</p>
                    <p className="mt-0.5 text-muted-foreground">
                      {SIGNAL_DESCRIPTION[signal]}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}
      </div>
    </li>
  );
}
