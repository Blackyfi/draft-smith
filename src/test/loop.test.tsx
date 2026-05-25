import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Recommendation } from "@/types";

// --- Tauri mock: a tiny event bus + invoke handler table the test drives. Lets us exercise the
// real bridge → hooks → components loop (commands seed, events re-rank) with no Tauri runtime. ---
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

const REC_A: Recommendation = {
  selfChampion: "Ahri",
  buildPath: [
    {
      itemId: 6655,
      name: "Luden's Companion",
      cost: 2900,
      owned: true,
      reason: "Core mage anchor",
    },
    {
      itemId: 3020,
      name: "Sorcerer's Shoes",
      cost: 1100,
      owned: true,
      reason: "Magic pen boots",
    },
    {
      itemId: 3157,
      name: "Zhonya's Hourglass",
      cost: 3250,
      owned: false,
      reason: "Zed's all-in window — stasis negates it",
    },
    {
      itemId: 3135,
      name: "Void Staff",
      cost: 2800,
      owned: false,
      reason: "Cut through magic resist",
    },
  ],
  swaps: [
    {
      trigger: "If their healing grows",
      itemId: 3165,
      name: "Morellonomicon",
      reason: "Antiheal vs Darius",
    },
  ],
  threats: [
    { champion: "Zed", archetype: "assassin", signals: ["lethality"] },
    { champion: "Darius", archetype: "juggernaut", signals: ["has-sustain"] },
    { champion: "Vi", archetype: "bruiser", signals: [] },
  ],
  skill: null,
};

// Vi reveals magic-resist stacking → Void Staff is promoted to the next purchase.
const REC_B: Recommendation = {
  ...REC_A,
  buildPath: [
    REC_A.buildPath[0],
    REC_A.buildPath[1],
    { ...REC_A.buildPath[3], owned: false }, // Void Staff now next
    { ...REC_A.buildPath[2], owned: false }, // Zhonya's after
  ],
  threats: [
    REC_A.threats[0],
    REC_A.threats[1],
    { champion: "Vi", archetype: "bruiser", signals: ["mr-stacking"] },
  ],
};

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <App />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

/** The item card (a button) whose label contains the given item name. */
function cardFor(name: string): HTMLElement {
  const el = screen.getByText(name).closest("button");
  if (!el) throw new Error(`no item card for ${name}`);
  return el;
}

describe("FE↔Rust live loop", () => {
  beforeEach(() => {
    tauri.reset();
    tauri.invokeHandlers["get_status"] = () => "in-game";
    tauri.invokeHandlers["get_current_recommendation"] = () => REC_A;
    tauri.invokeHandlers["get_champion_icon_by_name"] = () => null;
    tauri.invokeHandlers["get_item_icon"] = () => null;
    tauri.invokeHandlers["get_ddragon_version"] = () => "16.10.1";
    tauri.invokeHandlers["get_champion_display_name"] = (args) =>
      (args as { name: string }).name;
  });

  it("renders the build, threats, and swaps from the seeded recommendation", async () => {
    renderApp();

    // Build path + the next-purchase emphasis (the first not-owned step).
    expect(await screen.findByText("Zhonya's Hourglass")).toBeInTheDocument();
    expect(cardFor("Zhonya's Hourglass")).toHaveAttribute("data-next");
    expect(cardFor("Luden's Companion")).toHaveAttribute("data-owned");

    // Threat board: archetype chips + live signal badges (text, not just color).
    expect(screen.getByText("Assassin")).toBeInTheDocument();
    expect(screen.getByText("Juggernaut")).toBeInTheDocument();
    expect(screen.getByText("Lethality")).toBeInTheDocument();
    expect(screen.getByText("Healing")).toBeInTheDocument();

    // Situational swap.
    expect(screen.getByText("If their healing grows")).toBeInTheDocument();
  });

  it("re-ranks live when a recommendation-updated event arrives, and toasts the shift", async () => {
    renderApp();
    await screen.findByText("Zhonya's Hourglass");
    expect(cardFor("Zhonya's Hourglass")).toHaveAttribute("data-next");

    // First event seeds the toast baseline silently (mirrors the poller's first emit)...
    await act(async () => {
      tauri.emit("recommendation-updated", REC_A);
    });
    // ...then the enemy's purchase shifts the build.
    await act(async () => {
      tauri.emit("recommendation-updated", REC_B);
    });

    // The new signal appears and the next-purchase emphasis moves from Zhonya's to Void Staff
    // (the live re-rank). `findBy*` lets the Query observer flush the re-render.
    expect(await screen.findByText("Stacking MR")).toBeInTheDocument();
    await waitFor(() =>
      expect(cardFor("Void Staff")).toHaveAttribute("data-next"),
    );
    expect(cardFor("Zhonya's Hourglass")).not.toHaveAttribute("data-next");

    // A build-shift toast surfaced the change.
    expect(
      await screen.findByText("Enemy Vi is stacking magic resist"),
    ).toBeInTheDocument();
  });

  it("clears the dashboard to the no-game state when the game ends", async () => {
    renderApp();
    await screen.findByText("Zhonya's Hourglass");

    await act(async () => {
      tauri.emit("connection-status", "no-game");
    });

    expect(screen.getByText("No game running")).toBeInTheDocument();
    expect(screen.queryByText("Zhonya's Hourglass")).not.toBeInTheDocument();
  });
});
