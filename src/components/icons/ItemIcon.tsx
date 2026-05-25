import { useState } from "react";
import { Package } from "lucide-react";

import { useItemIcon } from "@/hooks/useIcon";
import { cn } from "@/lib/utils";

interface ItemIconProps {
  itemId: number;
  /** Item name, used as the accessible label / title. */
  name: string;
  className?: string;
}

/**
 * An item icon resolved by id (lazily downloaded by the Rust side on a cache miss). Falls back to a
 * generic package glyph on a missing cache or load error, so the build path renders cleanly even
 * before icons arrive or while DDragon is offline (PROJECT_SPEC §6.4).
 */
export function ItemIcon({ itemId, name, className }: ItemIconProps) {
  const { data: url } = useItemIcon(itemId);
  const [errored, setErrored] = useState(false);

  const showImage = url != null && !errored;
  return (
    <span
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground",
        className,
      )}
      title={name}
      aria-label={name}
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          className="size-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        <Package className="size-1/2" aria-hidden="true" />
      )}
    </span>
  );
}
