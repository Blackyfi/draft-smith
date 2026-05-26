import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EnemyItemsPanel } from "@/components/threat/EnemyItemsPanel";
import { buildEnemyItemList } from "@/components/threat/enemyItemsHelpers";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { EnemyThreatView, ItemIntel } from "@/types";

// ---------- Tauri mock (same pattern as MetaPanel.test.tsx) ----------
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

function makeThreat(champion: string, items: number[]): EnemyThreatView {
  return { champion, archetype: "assassin", signals: [], items, durability: null };
}

const INTEL_ZHONYA: ItemIntel = {
  id: 3157,
  name: "Zhonya's Hourglass",
  intents: ["stasis_survival", "ability_haste"],
  owners: ["Zed"],
  countersYou: false,
  countersYouReason: null,
  counterHint: null,
};

const INTEL_ANTIHEAL: ItemIntel = {
  id: 3165,
  name: "Morellonomicon",
  intents: ["antiheal"],
  owners: ["Darius"],
  countersYou: true,
  countersYouReason: "Reduces your healing by 40%.",
  counterHint: "Buy anti-anti-heal via Immortal Shieldbow sustain windows.",
};

const INTEL_BOOTS: ItemIntel = {
  id: 3020,
  name: "Sorcerer's Shoes",
  intents: ["magic_pen_flat", "move_speed"],
  owners: ["Zed", "Vi"],
  countersYou: false,
  countersYouReason: null,
  counterHint: null,
};

// ---------- Helper tests (pure function — no React needed) ----------

describe("buildEnemyItemList", () => {
  it("returns an empty array when no threats have items", () => {
    const threats = [makeThreat("Zed", []), makeThreat("Darius", [])];
    expect(buildEnemyItemList(threats, [])).toEqual([]);
  });

  it("deduplicates ids across enemies, preserving first-seen order", () => {
    const threats = [
      makeThreat("Zed", [3157, 3020]),
      makeThreat("Darius", [3020, 3165]), // 3020 already seen
    ];
    const result = buildEnemyItemList(threats, []);
    expect(result.map((r) => r.id)).toEqual([3157, 3020, 3165]);
  });

  it("sorts countersYou items first, preserving relative order within each group", () => {
    const threats = [makeThreat("Zed", [3157, 3165, 3020])];
    const result = buildEnemyItemList(threats, [
      INTEL_ZHONYA,
      INTEL_ANTIHEAL,
      INTEL_BOOTS,
    ]);
    // countersYou: Morellonomicon (3165) → first; then 3157, 3020
    expect(result[0].id).toBe(3165);
    expect(result[1].id).toBe(3157);
    expect(result[2].id).toBe(3020);
  });

  it("attaches the correct intel object for each id", () => {
    const threats = [makeThreat("Zed", [3157])];
    const result = buildEnemyItemList(threats, [INTEL_ZHONYA]);
    expect(result[0].intel).toBe(INTEL_ZHONYA);
  });

  it("leaves intel undefined for items not in enemyItems", () => {
    const threats = [makeThreat("Zed", [9999])];
    const result = buildEnemyItemList(threats, []);
    expect(result[0].id).toBe(9999);
    expect(result[0].intel).toBeUndefined();
  });

  it("handles multiple threats with overlapping items correctly", () => {
    const threats = [
      makeThreat("A", [1, 2]),
      makeThreat("B", [2, 3]),
      makeThreat("C", [1, 3, 4]),
    ];
    const result = buildEnemyItemList(threats, []);
    expect(result.map((r) => r.id)).toEqual([1, 2, 3, 4]);
  });
});

// ---------- Component render tests ----------

function renderPanel(
  threats: EnemyThreatView[] = [],
  enemyItems: ItemIntel[] = [],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Seed DDragon ready so item-meta queries are enabled.
  queryClient.setQueryData(["ddragon-version"], "15.9.1");

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <EnemyItemsPanel threats={threats} enemyItems={enemyItems} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("EnemyItemsPanel", () => {
  beforeEach(() => {
    tauri.reset();
    tauri.invokeHandlers["get_item_icon"] = () => null;
    tauri.invokeHandlers["get_item_meta"] = () => null;
    tauri.invokeHandlers["get_champion_display_name"] = (args) =>
      (args as { name: string }).name;
    tauri.invokeHandlers["get_ddragon_version"] = () => "15.9.1";
  });

  describe("empty state", () => {
    it("shows the empty-state hint when no enemies have items", () => {
      renderPanel([makeThreat("Zed", [])], []);
      expect(screen.getByText(/watching enemy purchases/i)).toBeInTheDocument();
    });

    it("shows the empty-state hint when threats array is empty", () => {
      renderPanel([], []);
      expect(screen.getByText(/watching enemy purchases/i)).toBeInTheDocument();
    });

    it("renders the section heading regardless", () => {
      renderPanel();
      expect(screen.getByText(/enemy items/i)).toBeInTheDocument();
    });
  });

  describe("loaded state", () => {
    it("renders item names from intel when intel is available", async () => {
      const threats = [makeThreat("Zed", [3157])];
      renderPanel(threats, [INTEL_ZHONYA]);
      expect(await screen.findByText("Zhonya's Hourglass")).toBeInTheDocument();
    });

    it("renders the counter warning when countersYou is true", async () => {
      const threats = [makeThreat("Darius", [3165])];
      renderPanel(threats, [INTEL_ANTIHEAL]);
      expect(await screen.findByText("Built against you")).toBeInTheDocument();
      expect(
        screen.getByText("Reduces your healing by 40%."),
      ).toBeInTheDocument();
    });

    it("does not render counter warning when countersYou is false", async () => {
      const threats = [makeThreat("Zed", [3157])];
      renderPanel(threats, [INTEL_ZHONYA]);
      await screen.findByText("Zhonya's Hourglass");
      expect(screen.queryByText("Built against you")).not.toBeInTheDocument();
    });

    it("sorts countersYou items first in the rendered list", async () => {
      const threats = [makeThreat("Zed", [3157, 3165])];
      renderPanel(threats, [INTEL_ZHONYA, INTEL_ANTIHEAL]);
      const items = await screen.findAllByText(/zhonya|morellonomicon/i);
      // Morellonomicon (countersYou) should appear before Zhonya's.
      expect(items[0].textContent).toMatch(/morellonomicon/i);
    });

    it("renders an item even when there is no matching intel", async () => {
      tauri.invokeHandlers["get_item_meta"] = (args) => {
        const { id } = args as { id: number };
        if (id === 3157) {
          return {
            id: 3157,
            name: "Zhonya's Hourglass",
            totalCost: 3250,
            tags: [],
            image: "3157.png",
            plaintext: "Short plain text.",
            description: "Full stripped description.",
            flatHp: 0,
            flatArmor: 45,
            flatMr: 0,
          };
        }
        return null;
      };

      const threats = [makeThreat("Zed", [3157])];
      renderPanel(threats, []); // no intel provided
      expect(await screen.findByText("Zhonya's Hourglass")).toBeInTheDocument();
    });
  });
});
