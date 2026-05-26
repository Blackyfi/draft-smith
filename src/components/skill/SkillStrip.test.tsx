import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SkillStrip } from "@/components/skill/SkillStrip";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Recommendation, Settings } from "@/types";

// ---------- Tauri mock (same pattern as loop.test.tsx / SettingsDialog.test.tsx) ----------
const tauri = vi.hoisted(() => {
  const listeners = new Map<string, Set<(e: { payload: unknown }) => void>>();
  const invokeHandlers: Record<string, (args: unknown) => unknown> = {};
  return {
    listeners,
    invokeHandlers,
    emit(event: string, payload: unknown) {
      listeners.get(event)?.forEach((cb) => cb({ payload }));
    },
    reset() {
      listeners.clear();
      for (const k of Object.keys(invokeHandlers)) delete invokeHandlers[k];
    },
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (event: string, cb: (e: { payload: unknown }) => void) => {
    const set = tauri.listeners.get(event) ?? new Set();
    set.add(cb);
    tauri.listeners.set(event, set);
    return () => set.delete(cb);
  },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (name: string, args: unknown) =>
    tauri.invokeHandlers[name]?.(args) ?? null,
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));

// ---------- Fixtures ----------
const QWERTY_SETTINGS: Settings = {
  pollIntervalSecs: 3,
  theme: "dark",
  alwaysOnTop: false,
  locale: "en_US",
  aggressiveness: "rules-only",
  abilityKeys: {
    layout: "qwerty",
    custom: ["Q", "W", "E", "R"],
    movementMode: "mouse",
  },
  metaRank: "diamond_plus",
  showMetaPanel: true,
};

const AZERTY_SETTINGS: Settings = {
  ...QWERTY_SETTINGS,
  abilityKeys: {
    layout: "azerty",
    custom: ["Q", "W", "E", "R"],
    movementMode: "mouse",
  },
};

const CUSTOM_SETTINGS: Settings = {
  ...QWERTY_SETTINGS,
  abilityKeys: {
    layout: "custom",
    custom: ["1", "2", "3", "4"],
    movementMode: "mouse",
  },
};

const WASD_SETTINGS: Settings = {
  ...QWERTY_SETTINGS,
  abilityKeys: {
    layout: "qwerty",
    custom: ["Q", "W", "E", "R"],
    movementMode: "keyboard",
  },
};

const REC_WITH_SKILL_NOW: Recommendation = {
  selfChampion: "Ahri",
  buildPath: [],
  swaps: [],
  threats: [],
  focus: [],
  skill: {
    slot: "Q",
    abilityName: "Orb of Deception",
    pointAvailable: true,
    atLevel: 3,
    reason: "Max Q first for poke damage",
  },
  abilityRanks: { q: 0, w: 0, e: 0, r: 0 },
};

const REC_WITH_SKILL_LOOKAHEAD: Recommendation = {
  selfChampion: "Ahri",
  buildPath: [],
  swaps: [],
  threats: [],
  focus: [],
  skill: {
    slot: "W",
    abilityName: "Fox-Fire",
    pointAvailable: false,
    atLevel: 8,
    reason: "Level W second after Q max",
  },
  abilityRanks: { q: 0, w: 0, e: 0, r: 0 },
};

const REC_NO_SKILL: Recommendation = {
  selfChampion: "Ahri",
  buildPath: [],
  swaps: [],
  threats: [],
  focus: [],
  skill: null,
  abilityRanks: { q: 0, w: 0, e: 0, r: 0 },
};

// ---------- Helpers ----------
function renderStrip(settings: Settings = QWERTY_SETTINGS) {
  tauri.invokeHandlers["get_settings"] = () => settings;

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SkillStrip />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

// ---------- Tests ----------
describe("SkillStrip", () => {
  beforeEach(() => {
    tauri.reset();
  });

  describe("skill == null", () => {
    it("renders the calm empty hint", async () => {
      tauri.invokeHandlers["get_current_recommendation"] = () => REC_NO_SKILL;
      renderStrip();

      expect(
        await screen.findByText("No skill guidance for this champion yet."),
      ).toBeInTheDocument();
    });
  });

  describe("pointAvailable = true", () => {
    it("shows the mapped key letter (QWERTY: Q) for the Q slot", async () => {
      tauri.invokeHandlers["get_current_recommendation"] = () =>
        REC_WITH_SKILL_NOW;
      renderStrip(QWERTY_SETTINGS);

      // Key badge shows the letter
      expect(await screen.findByLabelText("Ability key Q")).toBeInTheDocument();
      // Ability name
      expect(screen.getByText("Orb of Deception")).toBeInTheDocument();
      // "Level up now" affordance (text signal)
      expect(screen.getByText("Level up now")).toBeInTheDocument();
      // Reason
      expect(
        screen.getByText("Max Q first for poke damage"),
      ).toBeInTheDocument();
    });

    it("shows the mapped key letter A for Q slot in AZERTY layout", async () => {
      tauri.invokeHandlers["get_current_recommendation"] = () =>
        REC_WITH_SKILL_NOW;
      renderStrip(AZERTY_SETTINGS);

      expect(await screen.findByLabelText("Ability key A")).toBeInTheDocument();
      expect(screen.getByText("Level up now")).toBeInTheDocument();
    });

    it("shows the custom key for Q slot when layout is custom", async () => {
      tauri.invokeHandlers["get_current_recommendation"] = () =>
        REC_WITH_SKILL_NOW;
      renderStrip(CUSTOM_SETTINGS);

      // custom[0] = "1" for Q slot
      expect(await screen.findByLabelText("Ability key 1")).toBeInTheDocument();
      expect(screen.getByText("Level up now")).toBeInTheDocument();
    });
  });

  describe("keyboard (WASD) movement mode", () => {
    it("shows the Q ability on the right mouse button (RMB)", async () => {
      tauri.invokeHandlers["get_current_recommendation"] = () =>
        REC_WITH_SKILL_NOW;
      renderStrip(WASD_SETTINGS);

      // Badge label is "RMB", accessible name spells out "Right mouse button".
      expect(
        await screen.findByLabelText("Ability key Right mouse button"),
      ).toBeInTheDocument();
      expect(screen.getByText("RMB")).toBeInTheDocument();
    });

    it("shows the W ability on Shift", async () => {
      tauri.invokeHandlers["get_current_recommendation"] = () =>
        REC_WITH_SKILL_LOOKAHEAD;
      renderStrip(WASD_SETTINGS);

      expect(
        await screen.findByLabelText("Ability key Left Shift"),
      ).toBeInTheDocument();
      expect(screen.getByText("Shift")).toBeInTheDocument();
    });
  });

  describe("pointAvailable = false", () => {
    it("shows look-ahead text with the target level", async () => {
      tauri.invokeHandlers["get_current_recommendation"] = () =>
        REC_WITH_SKILL_LOOKAHEAD;
      renderStrip(QWERTY_SETTINGS);

      // Key badge shows W (QWERTY slot W)
      expect(await screen.findByLabelText("Ability key W")).toBeInTheDocument();
      // Ability name
      expect(screen.getByText("Fox-Fire")).toBeInTheDocument();
      // Look-ahead label instead of "Level up now"
      expect(screen.getByText("Next at level 8")).toBeInTheDocument();
      // No "Level up now" shown
      expect(screen.queryByText("Level up now")).not.toBeInTheDocument();
    });
  });
});
