import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FocusCallout } from "@/components/threat/FocusCallout";
import type { Recommendation } from "@/types";

// ── Tauri mock (same pattern as loop.test.tsx) ─────────────────────────────
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

// ── Fixtures ───────────────────────────────────────────────────────────────
const BASE_REC: Recommendation = {
  selfChampion: "Ahri",
  buildPath: [],
  swaps: [],
  threats: [],
  focus: [],
  skill: null,
};

const REC_WITH_FOCUS: Recommendation = {
  ...BASE_REC,
  focus: [
    {
      champion: "Zed",
      priority: "primary",
      reason: "Delete Zed — their squishiest high-value carry.",
    },
    {
      champion: "Darius",
      priority: "secondary",
      reason: "Secondary target if Zed is out of reach.",
    },
  ],
};

// ── Helpers ────────────────────────────────────────────────────────────────
function renderWithQuery(rec: Recommendation | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Pre-seed the recommendation into the query cache directly.
  qc.setQueryData(["recommendation"], rec);
  return render(
    <QueryClientProvider client={qc}>
      <FocusCallout />
    </QueryClientProvider>,
  );
}

describe("FocusCallout", () => {
  beforeEach(() => {
    tauri.reset();
    tauri.invokeHandlers["get_champion_display_name"] = (args) =>
      (args as { name: string }).name;
    tauri.invokeHandlers["get_champion_icon_by_name"] = () => null;
    tauri.invokeHandlers["get_ddragon_version"] = () => "16.10.1";
  });

  it("renders nothing when focus is empty", () => {
    const { container } = renderWithQuery(BASE_REC);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when recommendation is null", () => {
    const { container } = renderWithQuery(null);
    expect(container.firstChild).toBeNull();
  });

  it("renders the primary target with champion name and reason", () => {
    renderWithQuery(REC_WITH_FOCUS);

    // "Who to focus" heading
    expect(screen.getByText("Who to focus")).toBeInTheDocument();

    // Primary champion name
    expect(screen.getByText("Zed")).toBeInTheDocument();

    // Primary "Focus" priority chip (text + icon)
    expect(screen.getByText("Focus")).toBeInTheDocument();

    // Primary reason text
    expect(
      screen.getByText("Delete Zed — their squishiest high-value carry."),
    ).toBeInTheDocument();
  });

  it("renders the secondary target more quietly when present", () => {
    renderWithQuery(REC_WITH_FOCUS);

    // Secondary champion name
    expect(screen.getByText("Darius")).toBeInTheDocument();

    // Secondary chip label
    expect(screen.getByText("Secondary")).toBeInTheDocument();

    // Secondary reason
    expect(
      screen.getByText("Secondary target if Zed is out of reach."),
    ).toBeInTheDocument();
  });

  it("renders only primary when secondary is absent", () => {
    const rec: Recommendation = {
      ...BASE_REC,
      focus: [
        { champion: "Zed", priority: "primary", reason: "Primary only." },
      ],
    };
    renderWithQuery(rec);

    expect(screen.getByText("Zed")).toBeInTheDocument();
    expect(screen.queryByText("Secondary")).not.toBeInTheDocument();
  });
});
