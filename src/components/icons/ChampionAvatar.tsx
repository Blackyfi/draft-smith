import { useState } from "react";

import { useChampionIcon } from "@/hooks/useIcon";
import { cn } from "@/lib/utils";

interface ChampionAvatarProps {
  /**
   * Icon-resolution key: the Live Client / DDragon champion **id** (stable ASCII, e.g. "Kaisa",
   * "MonkeyKing"). Icons must resolve by id — display names are locale-dependent and carry special
   * characters (apostrophes, spaces), which makes them a fragile lookup key.
   */
  name: string;
  /** Human label for the tooltip/aria and the fallback initial (e.g. "Kai'Sa"). Defaults to `name`. */
  label?: string;
  className?: string;
}

/**
 * A champion portrait resolved by id. Falls back to the champion's initial on a missing DDragon
 * cache, an unknown id, or an image load error — so the UI never shows a broken image (works in the
 * DDragon-offline state, PROJECT_SPEC §6.4). The label is exposed as `title`/`aria-label`; callers
 * pair it with visible text where the name matters.
 */
export function ChampionAvatar({
  name,
  label,
  className,
}: ChampionAvatarProps) {
  const { data: url } = useChampionIcon(name);
  const [errored, setErrored] = useState(false);
  const display = label ?? name;

  const showImage = url != null && !errored;
  return (
    <span
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-xs font-semibold text-muted-foreground select-none",
        className,
      )}
      title={display}
      aria-label={display}
    >
      {showImage ? (
        <img
          src={url}
          alt=""
          className="size-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        (display.at(0) ?? "?").toUpperCase()
      )}
    </span>
  );
}
