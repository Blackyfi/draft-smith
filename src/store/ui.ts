import { create } from "zustand";

import type { Theme } from "@/types";

/**
 * Which view the idle (no-game) screen shows: the launcher "home" with option cards, the Match
 * History list, or the Stats & KPIs placeholder. Only relevant when no game is running — an
 * in-game state always shows the live Dashboard regardless of this.
 */
export type IdleView = "home" | "history" | "stats";

interface UiState {
  /** Active color theme (dark-first per PROJECT_SPEC §6.1). */
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Whether the settings dialog is visible. */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  /** The active idle-screen view (card launcher → history / stats). */
  idleView: IdleView;
  /** Currently opened match in the detail view, or `null` for the history list. */
  selectedMatchId: string | null;
  /** Navigate the idle screen; opening "home"/"stats" clears any selected match. */
  setIdleView: (view: IdleView) => void;
  /** Open a match's detail (implicitly switches to the history section). */
  openMatch: (id: string) => void;
  /** Return from a match's detail back to the history list. */
  closeMatch: () => void;
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
  idleView: "home",
  selectedMatchId: null,
  setIdleView: (idleView) => set({ idleView, selectedMatchId: null }),
  openMatch: (id) => set({ idleView: "history", selectedMatchId: id }),
  closeMatch: () => set({ selectedMatchId: null }),
}));
