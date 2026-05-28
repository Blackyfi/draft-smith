import { BarChart3, ChevronLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useUiStore } from "@/store/ui";

/**
 * Placeholder for the future Stats & KPIs view (PROJECT_SPEC — match-analysis phase). The match
 * recorder already captures the data this will analyze; the view itself ships later.
 */
export function Stats() {
  const setIdleView = useUiStore((s) => s.setIdleView);
  return (
    <div className="flex min-h-full w-full flex-col gap-3 p-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 px-2 text-muted-foreground"
          onClick={() => setIdleView("home")}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Home
        </Button>
        <h1 className="flex items-center gap-1.5 text-sm font-semibold">
          <BarChart3 className="size-4" aria-hidden="true" />
          Stats &amp; KPIs
        </h1>
      </div>

      <div
        role="status"
        className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 px-6 py-12 text-center"
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <BarChart3
            className="size-6 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <p className="text-sm font-semibold">Coming soon</p>
        <p className="max-w-xs text-[11px] text-muted-foreground">
          Performance trends and KPIs across your recorded matches are in
          development. Every game you play now is already being saved, so
          they&apos;ll have data to work with.
        </p>
      </div>
    </div>
  );
}
