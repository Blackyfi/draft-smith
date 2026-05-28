import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MatchHistory } from "@/components/history/MatchHistory";
import { TooltipProvider } from "@/components/ui/tooltip";
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

const SUMMARIES: MatchSummary[] = [
  {
    id: "200_Ahri",
    endedAt: 200,
    selfChampion: "Ahri",
    result: "win",
    durationSeconds: 1694,
    gameMode: "CLASSIC",
    kills: 7,
    deaths: 2,
    assists: 9,
    creepScore: 180,
  },
  {
    id: "100_Zed",
    endedAt: 100,
    selfChampion: "Zed",
    result: "loss",
    durationSeconds: 900,
    gameMode: "CLASSIC",
    kills: 3,
    deaths: 6,
    assists: 1,
    creepScore: 140,
  },
];

function mockCommon() {
  tauri.invokeHandlers["get_champion_display_name"] = (args) =>
    (args as { name: string }).name;
  tauri.invokeHandlers["get_champion_icon_by_name"] = () => null;
  tauri.invokeHandlers["get_ddragon_version"] = () => "16.11.1";
}

function renderHistory() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MatchHistory />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("MatchHistory", () => {
  beforeEach(() => {
    tauri.reset();
    mockCommon();
    useUiStore.setState({ idleView: "history", selectedMatchId: null });
  });

  it("lists recorded matches with champion, result, and KDA", async () => {
    tauri.invokeHandlers["get_match_history"] = () => SUMMARIES;
    renderHistory();

    expect(await screen.findByText("Ahri")).toBeInTheDocument();
    expect(screen.getByText("Zed")).toBeInTheDocument();
    expect(screen.getByText("Win")).toBeInTheDocument();
    expect(screen.getByText("Loss")).toBeInTheDocument();
    expect(screen.getByText("7 / 2 / 9")).toBeInTheDocument();
    expect(screen.getByText("28:14")).toBeInTheDocument();
  });

  it("opens a match's detail on click (sets the selected id in the store)", async () => {
    tauri.invokeHandlers["get_match_history"] = () => SUMMARIES;
    renderHistory();

    const row = await screen.findByLabelText(/Open Ahri match/);
    fireEvent.click(row);
    expect(useUiStore.getState().selectedMatchId).toBe("200_Ahri");
  });

  it("shows a friendly empty state when there are no matches", async () => {
    tauri.invokeHandlers["get_match_history"] = () => [];
    renderHistory();
    expect(
      await screen.findByText("No matches recorded yet"),
    ).toBeInTheDocument();
  });

  it("deletes a match via the row action", async () => {
    tauri.invokeHandlers["get_match_history"] = () => SUMMARIES;
    const deleted: string[] = [];
    tauri.invokeHandlers["delete_match"] = (args) => {
      deleted.push((args as { id: string }).id);
      return null;
    };
    renderHistory();

    const del = await screen.findByLabelText("Delete Ahri match");
    fireEvent.click(del);
    // The mutation is async — wait for delete_match to be invoked with the row's id.
    await waitFor(() => expect(deleted).toContain("200_Ahri"));
  });
});
