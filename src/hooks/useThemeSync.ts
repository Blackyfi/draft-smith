import { useEffect } from "react";

import { useSettings } from "@/hooks/useSettings";
import { useUiStore } from "@/store/ui";

/**
 * Reads the theme from settings (Rust is the source of truth) and applies it by toggling the
 * `.dark` class on `document.documentElement`. Also syncs the Zustand `theme` so the Sonner
 * Toaster (which reads it) stays consistent. Mount once in `App.tsx`.
 */
export function useThemeSync() {
  const { data: settings } = useSettings();
  const setTheme = useUiStore((s) => s.setTheme);

  useEffect(() => {
    const theme = settings?.theme ?? "dark";
    const html = document.documentElement;
    if (theme === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
    setTheme(theme);
  }, [settings?.theme, setTheme]);
}
