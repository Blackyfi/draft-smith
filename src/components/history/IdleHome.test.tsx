import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IdleHome } from "@/components/history/IdleHome";
import { useUiStore } from "@/store/ui";
import type { MatchSummary } from "@/types";

const tauri = vi.hoisted(() => {
  const invokeHandlers: Record<string, (args: unknown) => unknown> = {};
  return {
    invokeHandlers,
    reset() {
      for (const k of Object.keys(invokeHandlers)) delete invokeHandlers[k];
    },
  };
});

vi.mock("@tauri-apps/api/event", () => ({ listen: async () => () => {} }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (name: string, args: unknown) =>
    tauri.invokeHandlers[name]?.(args) ?? null,
  convertFileSrc: (p: string) => `asset://localhost/${p}`,
}));

function summary(id: string): MatchSummary {
  return {
    id,
    endedAt: 100,
    selfChampion: "Ahri",
    result: "win",
    durationSeconds: 1000,
    gameMode: "CLASSIC",
    kills: 1,
    deaths: 2,
    assists: 3,
    creepScore: 100,
  };
}

function renderHome() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <IdleHome />
    </QueryClientProvider>,
  );
}

describe("IdleHome", () => {
  beforeEach(() => {
    tauri.reset();
    useUiStore.setState({ idleView: "home", selectedMatchId: null });
  });

  it("shows a saved-matches count badge on the Match History card", async () => {
    tauri.invokeHandlers["get_match_history"] = () => [
      summary("a"),
      summary("b"),
      summary("c"),
    ];
    renderHome();
    expect(await screen.findByLabelText("3 saved matches")).toHaveTextContent("3");
  });

  it("omits the badge when there are no saved matches", async () => {
    tauri.invokeHandlers["get_match_history"] = () => [];
    renderHome();
    // Give the query a tick to resolve to an empty list.
    expect(await screen.findByText("Match History")).toBeInTheDocument();
    expect(screen.queryByLabelText(/saved match/)).not.toBeInTheDocument();
  });

  it("opens the history view when the card is clicked", async () => {
    tauri.invokeHandlers["get_match_history"] = () => [summary("a")];
    renderHome();
    await screen.findByLabelText("1 saved match");
    fireEvent.click(screen.getByText("Match History"));
    expect(useUiStore.getState().idleView).toBe("history");
  });
});
