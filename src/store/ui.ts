import { create } from "zustand";

import type { Theme } from "@/types";

interface UiState {
  /** Active color theme (dark-first per PROJECT_SPEC §6.1). */
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Whether the settings dialog is visible. */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

/**
 * Minimal global UI state. Intentionally small — server/game state belongs in TanStack Query,
 * not here (PROJECT_SPEC §2 / `.claude/frontend.md`).
 */
export const useUiStore = create<UiState>((set) => ({
  theme: "dark",
  setTheme: (theme) => set({ theme }),
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),
}));
