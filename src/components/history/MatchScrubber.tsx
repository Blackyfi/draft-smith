import { History, SkipForward } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { EventMarker } from "./matchTimeline";
import { formatDuration } from "./matchFormat";

/** Track-dot treatment per marker kind — color is paired with a textual `title` (never color alone). */
const MARKER_STYLE: Record<
  EventMarker["kind"],
  { className: string; label: string }
> = {
  kill: { className: "bg-rose-400", label: "Kill" },
  objective: { className: "bg-violet-400", label: "Objective" },
  structure: { className: "bg-amber-400", label: "Structure" },
};

/**
 * The match replay scrubber: a draggable timeline over the whole game. Dragging emits the chosen
 * game time (seconds) via `onChange`, which the detail page uses to rewind every panel to that
 * moment. Kill / objective / structure markers sit on the track so notable moments are visible and
 * easy to scrub to. Built on a native range input for free keyboard + a11y support.
 */
export function MatchScrubber({
  duration,
  value,
  onChange,
  markers,
}: {
  duration: number;
  value: number;
  onChange: (t: number) => void;
  markers: EventMarker[];
}) {
  if (duration <= 0) return null;
  const pct = Math.min(100, Math.max(0, (value / duration) * 100));
  const atEnd = value >= duration;

  return (
    <div className="flex items-center gap-3">
      <span
        className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground"
        aria-hidden="true"
      >
        <span className="text-foreground">{formatDuration(value)}</span> /{" "}
        {formatDuration(duration)}
      </span>

      <div className="relative flex-1">
        {/* Background track + filled progress. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Event markers (decorative; the event log is the textual source of truth). */}
        {markers.map((m, i) => (
          <span
            key={i}
            title={`${MARKER_STYLE[m.kind].label} at ${formatDuration(m.time)}`}
            className={`pointer-events-none absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-background ${MARKER_STYLE[m.kind].className}`}
            style={{
              left: `${Math.min(100, Math.max(0, (m.time / duration) * 100))}%`,
            }}
          />
        ))}

        <input
          type="range"
          min={0}
          max={Math.round(duration)}
          step={1}
          value={Math.round(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Match timeline"
          aria-valuetext={`${formatDuration(value)} of ${formatDuration(duration)}`}
          className="relative h-4 w-full cursor-pointer appearance-none bg-transparent focus:outline-none [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-primary [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow focus-visible:[&::-webkit-slider-thumb]:ring-2 focus-visible:[&::-webkit-slider-thumb]:ring-ring"
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 gap-1 px-2 text-[11px] text-muted-foreground"
        onClick={() => onChange(duration)}
        disabled={atEnd}
        title="Jump to end of game"
      >
        {atEnd ? (
          <History className="size-3.5" aria-hidden="true" />
        ) : (
          <SkipForward className="size-3.5" aria-hidden="true" />
        )}
        {atEnd ? "Final" : "End"}
      </Button>
    </div>
  );
}
