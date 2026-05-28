import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MatchDetail } from "@/components/history/MatchDetail";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUiStore } from "@/store/ui";
import type { MatchRecord } from "@/types";

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

const RECORD: MatchRecord = {
  id: "200_Ahri",
  startedAt: 100,
  endedAt: 200,
  appVersion: "0.1.13",
  patch: "16.11.1",
  gameMode: "CLASSIC",
  mapName: "Map11",
  mapNumber: 11,
  durationSeconds: 1694,
  result: "win",
  selfChampion: "Ahri",
  players: [
    {
      key: "Me",
      champion: "Ahri",
      riotId: "Me#EUW",
      summonerName: "Me",
      team: "ORDER",
      position: "MIDDLE",
      isBot: false,
      isSelf: true,
      summonerSpells: ["Flash", "Ignite"],
      finalLevel: 16,
      kills: 7,
      deaths: 2,
      assists: 9,
      creepScore: 180,
      wardScore: 12,
      finalItems: [{ id: 6655, name: "Luden's Companion", slot: 0 }],
    },
    {
      key: "Foe",
      champion: "Zed",
      riotId: "Foe#EUW",
      summonerName: "Foe",
      team: "CHAOS",
      position: "MIDDLE",
      isBot: false,
      isSelf: false,
      summonerSpells: ["Flash", "Ignite"],
      finalLevel: 15,
      kills: 5,
      deaths: 4,
      assists: 3,
      creepScore: 170,
      wardScore: 8,
      finalItems: [],
    },
  ],
  itemTimeline: [
    {
      gameTime: 30,
      playerKey: "Me",
      itemId: 1056,
      name: "Doran's Ring",
      kind: "acquired",
    },
  ],
  levelTimeline: [],
  skillTimeline: [
    {
      gameTime: 30,
      slot: "Q",
      abilityRank: 1,
      championLevel: 1,
      abilityName: "Orb of Deception",
    },
  ],
  events: [
    {
      gameTime: 600,
      kind: "ChampionKill",
      killer: "Me#EUW",
      victim: "Foe#EUW",
    },
    { gameTime: 1694, kind: "GameEnd" },
  ],
  diagnostics: [],
};

function mockCommon() {
  tauri.invokeHandlers["get_champion_display_name"] = (args) =>
    (args as { name: string }).name;
  tauri.invokeHandlers["get_champion_icon_by_name"] = () => null;
  tauri.invokeHandlers["get_item_icon"] = () => null;
  tauri.invokeHandlers["get_item_meta"] = () => null;
  tauri.invokeHandlers["get_ddragon_version"] = () => "16.11.1";
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
}

function renderDetail() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MatchDetail />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("MatchDetail", () => {
  beforeEach(() => {
    tauri.reset();
    mockCommon();
    useUiStore.setState({ idleView: "history", selectedMatchId: "200_Ahri" });
  });

  it("renders the header, scoreboard, build, skill order, and event log", async () => {
    tauri.invokeHandlers["get_match"] = (args) =>
      (args as { id: string }).id === "200_Ahri" ? RECORD : null;
    renderDetail();

    // Header + result
    expect(await screen.findByText("Win")).toBeInTheDocument();
    expect(screen.getByText("Patch 16.11.1")).toBeInTheDocument();

    // Scoreboard: both teams, self marked
    expect(screen.getByText("Your team")).toBeInTheDocument();
    expect(screen.getByText("Enemy team")).toBeInTheDocument();
    expect(screen.getByText("YOU")).toBeInTheDocument();

    // Build timeline (acquisition)
    expect(screen.getByText("Doran's Ring")).toBeInTheDocument();

    // Skill order key badge
    expect(screen.getByText("Q")).toBeInTheDocument();

    // Event log line: tags stripped, each player annotated with their champion
    expect(screen.getByText("Me (Ahri) killed Foe (Zed)")).toBeInTheDocument();

    // Build item carries its purchase-order badge
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("rewinds the event log when the timeline is scrubbed back", async () => {
    tauri.invokeHandlers["get_match"] = () => RECORD;
    renderDetail();

    // The kill (at 600s) is visible at the live/final position.
    expect(
      await screen.findByText("Me (Ahri) killed Foe (Zed)"),
    ).toBeInTheDocument();

    // Scrub to 300s — before the kill — and it disappears from the revealed log.
    fireEvent.change(screen.getByRole("slider"), { target: { value: "300" } });
    expect(
      screen.queryByText("Me (Ahri) killed Foe (Zed)"),
    ).not.toBeInTheDocument();

    // A point-in-time marker confirms the scrubbed view.
    expect(screen.getByText("@ 5:00")).toBeInTheDocument();
  });

  it("shows a not-found state when the match is gone", async () => {
    tauri.invokeHandlers["get_match"] = () => null;
    renderDetail();
    expect(await screen.findByText("Match not found")).toBeInTheDocument();
  });

  it("returns to the list when back is pressed", async () => {
    tauri.invokeHandlers["get_match"] = () => RECORD;
    renderDetail();
    const back = await screen.findByText("Back to history");
    back.click();
    expect(useUiStore.getState().selectedMatchId).toBeNull();
  });
});
