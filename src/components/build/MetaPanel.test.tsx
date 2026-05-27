import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MetaPanel } from "@/components/build/MetaPanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AbilityKeys, AbilityRanks, MetaBuild } from "@/types";

// ---------- Tauri mock (same pattern as loop.test.tsx) ----------
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

const SAMPLE_BUILD: MetaBuild = {
  champion: "Ahri",
  role: "mid",
  availableRoles: ["mid", "support"],
  rank: "diamond_plus",
  patch: "15.9",
  winRate: 0.523,
  games: 48000,
  coreItems: [
    { id: 6655, name: "Luden's Companion" },
    { id: 3020, name: "Sorcerer's Shoes" },
    { id: 4645, name: "Shadowflame" },
  ],
  startingItems: [{ id: 1056, name: "Doran's Ring" }],
  options: [
    { id: 3157, name: "Zhonya's Hourglass", winRate: 0.531, games: 12000 },
    { id: 3135, name: "Void Staff", winRate: 0.518, games: 9000 },
  ],
  skillOrder: ["Q", "W", "E", "Q", "Q", "R"],
  skillMaxPriority: "QWE",
};

// ---------- Helpers ----------

function renderPanel(
  champion: string | null = "Ahri",
  rank: "diamond_plus" | "emerald_plus" = "diamond_plus",
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Seed DDragon ready so the query is enabled.
  queryClient.setQueryData(["ddragon-version"], "15.9.1");

  const result = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MetaPanel champion={champion} rank={rank} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

// ---------- Tests ----------

describe("MetaPanel", () => {
  beforeEach(() => {
    tauri.reset();
    tauri.invokeHandlers["get_item_icon"] = () => null;
  });

  describe("loading state", () => {
    it("renders a loading skeleton while the query is in-flight", () => {
      // Never resolve — query stays loading.
      tauri.invokeHandlers["get_meta_build"] = () =>
        new Promise(() => undefined);

      renderPanel();

      // The skeleton section has aria-busy.
      expect(
        screen.getByRole("region", { name: /meta build loading/i }),
      ).toBeInTheDocument();
    });
  });

  describe("unavailable state", () => {
    it("shows the calm unavailable message when invoke returns null", async () => {
      tauri.invokeHandlers["get_meta_build"] = () => null;

      renderPanel();

      expect(
        await screen.findByText(
          /meta build unavailable for this champion \/ patch/i,
        ),
      ).toBeInTheDocument();
    });

    it("shows nothing when champion is null", () => {
      tauri.invokeHandlers["get_meta_build"] = () => SAMPLE_BUILD;
      const { container } = renderPanel(null);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("loaded state", () => {
    beforeEach(() => {
      tauri.invokeHandlers["get_meta_build"] = () => SAMPLE_BUILD;
    });

    it("renders the win-rate badge with the correct percentage", async () => {
      renderPanel();
      // 0.523 → "52.3%"
      expect(await screen.findByText("52.3%")).toBeInTheDocument();
    });

    it("renders the rank badge with a pretty label", async () => {
      renderPanel();
      expect(await screen.findByText("Diamond+")).toBeInTheDocument();
    });

    it("renders the patch version", async () => {
      renderPanel();
      expect(await screen.findByText("15.9")).toBeInTheDocument();
    });

    it("renders core item names", async () => {
      renderPanel();
      expect(await screen.findByText("Luden's Companion")).toBeInTheDocument();
      expect(screen.getByText("Sorcerer's Shoes")).toBeInTheDocument();
      expect(screen.getByText("Shadowflame")).toBeInTheDocument();
    });

    it("renders starting item names", async () => {
      renderPanel();
      expect(await screen.findByText("Doran's Ring")).toBeInTheDocument();
    });

    it("renders situational options with their win rates", async () => {
      renderPanel();
      expect(await screen.findByText("Zhonya's Hourglass")).toBeInTheDocument();
      // Win rate for Zhonya's: 0.531 → "53.1%"
      expect(screen.getByText("53.1%")).toBeInTheDocument();
      expect(screen.getByText("Void Staff")).toBeInTheDocument();
    });

    it("renders the advisory framing text", async () => {
      renderPanel();
      expect(
        await screen.findByText(/what wins on average/i),
      ).toBeInTheDocument();
    });

    it("renders the skill max priority", async () => {
      renderPanel();
      expect(await screen.findByText("Max QWE")).toBeInTheDocument();
    });
  });

  describe("keybind-aware skill order", () => {
    beforeEach(() => {
      tauri.invokeHandlers["get_meta_build"] = () => SAMPLE_BUILD;
    });

    function renderWithKeys(
      abilityKeys: AbilityKeys,
      abilityRanks?: AbilityRanks,
    ) {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      queryClient.setQueryData(["ddragon-version"], "15.9.1");
      return render(
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <MetaPanel
              champion="Ahri"
              rank="diamond_plus"
              abilityKeys={abilityKeys}
              abilityRanks={abilityRanks}
            />
          </TooltipProvider>
        </QueryClientProvider>,
      );
    }

    it("remaps skill-order keys for AZERTY + keyboard movement", async () => {
      // AZERTY keeps E/R; keyboard movement moves Q→RMB and W→Shift (physical-position based).
      renderWithKeys({
        layout: "azerty",
        custom: ["Q", "W", "E", "R"],
        movementMode: "keyboard",
      });

      // skillOrder ["Q","W","E","Q","Q","R"] → RMB / Shift for the Q/W slots, E/R unchanged.
      expect((await screen.findAllByText("RMB")).length).toBeGreaterThan(0);
      expect(screen.getAllByText("Shift").length).toBeGreaterThan(0);
      // Max priority follows the same remap: Q→RMB, W→Shift, E stays E, joined with "›".
      expect(screen.getByText("Max RMB›Shift›E")).toBeInTheDocument();
    });

    it("highlights the earliest unfulfilled box as the next point to spend", async () => {
      // Q at rank 1 → the first box (Q) is taken; the next box in the plan (W) is "level up next".
      renderWithKeys(
        {
          layout: "qwerty",
          custom: ["Q", "W", "E", "R"],
          movementMode: "mouse",
        },
        { q: 1, w: 0, e: 0, r: 0 },
      );
      expect(
        await screen.findByLabelText(/level 2 — level up next/i),
      ).toBeInTheDocument();
    });
  });

  describe("role toggle", () => {
    beforeEach(() => {
      tauri.invokeHandlers["get_meta_build"] = () => SAMPLE_BUILD;
    });

    it("renders role buttons for available roles", async () => {
      renderPanel();

      // Both roles from availableRoles should appear.
      expect(
        await screen.findByRole("button", { name: "Mid" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Support" }),
      ).toBeInTheDocument();
    });

    it("marks the active role as pressed", async () => {
      renderPanel();

      const midBtn = await screen.findByRole("button", { name: "Mid" });
      expect(midBtn).toHaveAttribute("aria-pressed", "true");

      const suppBtn = screen.getByRole("button", { name: "Support" });
      expect(suppBtn).toHaveAttribute("aria-pressed", "false");
    });

    it("switches active role and triggers a refetch when a role button is clicked", async () => {
      const user = userEvent.setup();

      // Track which role was requested.
      const requests: Array<{ role: string | null }> = [];
      tauri.invokeHandlers["get_meta_build"] = (args) => {
        const a = args as {
          champion: string;
          role: string | null;
          rank: string;
        };
        requests.push({ role: a.role });
        // The backend resolves the requested role and echoes it back in `role` (None => primary,
        // "mid" here). The panel highlights the role of the build actually shown, so the mock must
        // reflect the requested role rather than a fixed one.
        return { ...SAMPLE_BUILD, role: a.role ?? "mid" };
      };

      renderPanel();

      // Wait for initial render.
      await screen.findByText("52.3%");

      // Click Support.
      const suppBtn = screen.getByRole("button", { name: "Support" });
      await user.click(suppBtn);

      // The hook should have been called with role="support".
      await waitFor(() => {
        expect(requests.some((r) => r.role === "support")).toBe(true);
      });

      // Once the support build arrives, the highlight follows the shown build's role.
      await waitFor(() => {
        expect(suppBtn).toHaveAttribute("aria-pressed", "true");
      });
    });
  });
});
