import { useState } from "react";

import { useChampionIcon } from "@/hooks/useIcon";
import { cn } from "@/lib/utils";

interface ChampionAvatarProps {
  /** Champion display name (e.g. "Ahri"). */
  name: string;
  className?: string;
}

/**
 * A champion portrait resolved by display name. Falls back to the champion's initial on a missing
 * DDragon cache, an unknown name, or an image load error — so the UI never shows a broken image
 * (works in the DDragon-offline state, PROJECT_SPEC §6.4). The name is exposed as a tooltip-less
 * `title` and `aria-label`; callers pair it with visible text where the name matters.
 */
export function ChampionAvatar({ name, className }: ChampionAvatarProps) {
  const { data: url } = useChampionIcon(name);
  const [errored, setErrored] = useState(false);

  const showImage = url != null && !errored;
  return (
    <span
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-xs font-semibold text-muted-foreground select-none",
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
        (name.at(0) ?? "?").toUpperCase()
      )}
    </span>
  );
}
