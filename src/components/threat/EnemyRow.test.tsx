import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EnemyRow } from "@/components/threat/EnemyRow";
import { EnemyThreatBoard } from "@/components/threat/EnemyThreatBoard";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Durability, EnemyThreatView } from "@/types";

// ---------- Tauri mock ----------
const tauri = vi.hoisted(() => {
  const invokeHandlers: Record<string, (args: unknown) => unknown> = {};
  return {
    invokeHandlers,
    reset() {
      for (const k of Object.keys(invokeHandlers)) delete invokeHandlers[k];
    },
  };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: async () => () => {},
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (name: string, args: unknown) =>
    tauri.invokeHandlers[name]?.(args) ?? null,
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));

// ---------- Fixtures ----------

const DURABILITY_WITH_CASTS: Durability = {
  effectiveHp: 3200,
  rawHp: 2000,
  resist: 80,
  resistAfterPen: 50,
  resistKind: "magic",
  castsToKill: 3,
  abilitySlot: "Q",
  abilityName: "Orb of Deception",
  perCastDamage: 750,
};

const DURABILITY_NO_CASTS: Durability = {
  effectiveHp: 4800,
  rawHp: 3000,
  resist: 120,
  resistAfterPen: 100,
  resistKind: "armor",
  castsToKill: null,
  abilitySlot: null,
  abilityName: null,
  perCastDamage: null,
};

const DURABILITY_TRUE_DMG: Durability = {
  effectiveHp: 1000,
  rawHp: 1000,
  resist: 0,
  resistAfterPen: 0,
  resistKind: "none",
  castsToKill: 8,
  abilitySlot: "Q",
  abilityName: "Orb of Deception",
  perCastDamage: 130,
};

function makeThreat(
  champion: string,
  durability: Durability | null,
): EnemyThreatView {
  return {
    champion,
    archetype: "assassin",
    signals: [],
    items: [],
    durability,
  };
}

// ---------- Render helpers ----------

function renderRow(threat: EnemyThreatView, maxEffectiveHp = 5000) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  tauri.invokeHandlers["get_champion_display_name"] = (args) =>
    (args as { name: string }).name;
  tauri.invokeHandlers["get_champion_icon_by_name"] = () => null;
  tauri.invokeHandlers["get_ddragon_version"] = () => "16.10.1";
  tauri.invokeHandlers["get_settings"] = () => ({
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
    gankAlertsEnabled: true,
    gankAlertSound: true,
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ul>
          <EnemyRow threat={threat} maxEffectiveHp={maxEffectiveHp} />
        </ul>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

function renderBoard(threats: EnemyThreatView[]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  tauri.invokeHandlers["get_champion_display_name"] = (args) =>
    (args as { name: string }).name;
  tauri.invokeHandlers["get_champion_icon_by_name"] = () => null;
  tauri.invokeHandlers["get_ddragon_version"] = () => "16.10.1";
  tauri.invokeHandlers["get_settings"] = () => ({
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
    gankAlertsEnabled: true,
    gankAlertSound: true,
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <EnemyThreatBoard threats={threats} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

// ---------- Tests ----------

describe("EnemyRow durability", () => {
  beforeEach(() => {
    tauri.reset();
  });

  describe("no durability (null)", () => {
    it("renders without the gauge or chip when durability is null", () => {
      renderRow(makeThreat("Zed", null));
      // Gauge has an aria role of meter — should be absent
      expect(screen.queryByRole("meter")).not.toBeInTheDocument();
      // No casts chip
      expect(screen.queryByText(/≈\d+×/)).not.toBeInTheDocument();
    });
  });

  describe("gauge only (castsToKill null)", () => {
    it("renders the EHP gauge meter", () => {
      renderRow(makeThreat("Darius", DURABILITY_NO_CASTS));
      expect(screen.getByRole("meter")).toBeInTheDocument();
    });

    it("displays the EHP label with compact formatting", () => {
      renderRow(makeThreat("Darius", DURABILITY_NO_CASTS));
      // 4800 EHP → "4.8k EHP"
      expect(screen.getByText("4.8k EHP")).toBeInTheDocument();
    });

    it("does not render a casts chip when castsToKill is null", () => {
      renderRow(makeThreat("Darius", DURABILITY_NO_CASTS));
      expect(screen.queryByText(/≈\d+×/)).not.toBeInTheDocument();
    });
  });

  describe("gauge + casts chip (castsToKill present)", () => {
    it("renders the casts chip with the correct count and key", () => {
      renderRow(makeThreat("Ahri", DURABILITY_WITH_CASTS));
      // "≈3× Q" for QWERTY + Q slot
      expect(screen.getByText("≈3× Q")).toBeInTheDocument();
    });

    it("renders the EHP gauge alongside the chip", () => {
      renderRow(makeThreat("Ahri", DURABILITY_WITH_CASTS));
      expect(screen.getByRole("meter")).toBeInTheDocument();
      expect(screen.getByText("3.2k EHP")).toBeInTheDocument();
    });

    it("chip has an accessible aria-label", () => {
      renderRow(makeThreat("Ahri", DURABILITY_WITH_CASTS));
      expect(
        screen.getByLabelText(
          "Approximately 3 casts of Orb of Deception to kill",
        ),
      ).toBeInTheDocument();
    });
  });

  describe("inline damage math", () => {
    it("shows the raw → net formula reconstructed from the post-mitigation per-cast damage", () => {
      // perCastDamage 750 (net) with 50 MR after pen → raw = 750 * 150/100 = 1125.
      renderRow(makeThreat("Ahri", DURABILITY_WITH_CASTS));
      expect(screen.getByText("1125")).toBeInTheDocument();
      expect(screen.getByText("750")).toBeInTheDocument();
      expect(screen.getByText(/· 50 MR/)).toBeInTheDocument();
    });

    it("shows the % blocked severity badge with an accessible label", () => {
      // 50 MR after pen → blocked = 50/150 = 33%.
      renderRow(makeThreat("Ahri", DURABILITY_WITH_CASTS));
      expect(
        screen.getByLabelText(
          "33% of your Orb of Deception damage blocked by their MR",
        ),
      ).toBeInTheDocument();
    });

    it("omits the % blocked badge and resist for true damage", () => {
      renderRow(makeThreat("Ahri", DURABILITY_TRUE_DMG));
      // Net damage still shown, labelled as true; no resist arrow math, no blocked badge.
      expect(
        screen.getByLabelText("130 true damage per cast"),
      ).toBeInTheDocument();
      expect(screen.getByText("true")).toBeInTheDocument();
      expect(
        screen.queryByLabelText(/damage blocked by their/),
      ).not.toBeInTheDocument();
    });

    it("renders no damage math when there is no per-cast estimate", () => {
      renderRow(makeThreat("Darius", DURABILITY_NO_CASTS));
      expect(screen.queryByText(/blocked/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/damage blocked/)).not.toBeInTheDocument();
    });
  });
});

describe("EnemyThreatBoard maxEffectiveHp normalization", () => {
  beforeEach(() => {
    tauri.reset();
  });

  it("passes maxEffectiveHp derived from the team's highest effective HP", () => {
    // Squishiest at 1500 EHP, tankiest at 5000 — board must render both without crashing.
    const threats: EnemyThreatView[] = [
      makeThreat("Zed", {
        ...DURABILITY_WITH_CASTS,
        effectiveHp: 1500,
      }),
      makeThreat("Malphite", {
        ...DURABILITY_NO_CASTS,
        effectiveHp: 5000,
      }),
    ];
    renderBoard(threats);
    // Both gauges must be present
    expect(screen.getAllByRole("meter")).toHaveLength(2);
    // Labels reflect the two distinct values
    expect(screen.getByText("1.5k EHP")).toBeInTheDocument();
    expect(screen.getByText("5.0k EHP")).toBeInTheDocument();
  });

  it("renders without crash when all threats have no durability", () => {
    const threats: EnemyThreatView[] = [
      makeThreat("Zed", null),
      makeThreat("Darius", null),
    ];
    renderBoard(threats);
    // No meters, no chips
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.queryByText(/≈\d+×/)).not.toBeInTheDocument();
  });
});
