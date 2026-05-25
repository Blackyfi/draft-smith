import * as React from "react";

import { cn } from "@/lib/utils";

/** Placeholder block shown while data loads — never a blank flash (PROJECT_SPEC §6.4). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
