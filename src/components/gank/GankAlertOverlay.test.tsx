import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GankAlertOverlay } from "@/components/gank/GankAlertOverlay";
import { SETTINGS_KEY } from "@/hooks/useSettings";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useGankAlert } from "@/hooks/useGankAlert";
import type { GankAlert, Settings } from "@/types";

// ── Stub the sound module so jsdom never needs AudioContext ─────────────────
vi.mock("@/lib/gankSound", () => ({
  playGankAlertSound: vi.fn(),
}));

// ── Tauri mock ──────────────────────────────────────────────────────────────
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

// ── Fixtures ────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = {
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
};

const SETTINGS_ALERTS_OFF: Settings = {
  ...DEFAULT_SETTINGS,
  gankAlertsEnabled: false,
};

const SAMPLE_ALERT: GankAlert = {
  jungler: "Vi",
  kind: "first-gank",
  style: "early",
  message: "Moving fast — expect a top gank",
};

const ULT_ALERT: GankAlert = {
  jungler: "Elise",
  kind: "ultimate",
  style: "standard",
  message: "Just hit level 6 — ult is up",
};

// ── Test harness ─────────────────────────────────────────────────────────────

/**
 * Thin wrapper that wires `useGankAlert` → `GankAlertOverlay` — mirrors App.tsx.
 */
function Harness() {
  const { alert, dismiss } = useGankAlert();
  return <GankAlertOverlay alert={alert} onDismiss={dismiss} />;
}

/**
 * Renders the harness with the given settings pre-seeded into the query cache
 * (avoids async query latency that would make the event arrive before settings load).
 */
function renderHarness(settings: Settings = DEFAULT_SETTINGS) {
  tauri.invokeHandlers["get_champion_display_name"] = (args) =>
    (args as { name: string }).name;
  tauri.invokeHandlers["get_ddragon_version"] = () => "16.10.1";

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Pre-seed settings so the hook's settingsRef is populated synchronously.
  queryClient.setQueryData(SETTINGS_KEY, settings);

  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Harness />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("GankAlertOverlay + useGankAlert", () => {
  beforeEach(() => {
    tauri.reset();
  });

  it("shows the overlay when a gank-alert event is emitted (alerts enabled)", async () => {
    renderHarness(DEFAULT_SETTINGS);

    await act(async () => {
      tauri.emit("gank-alert", SAMPLE_ALERT);
    });

    // Headline for first-gank kind
    expect(await screen.findByText("GANK WINDOW")).toBeInTheDocument();
    // Message appears at least once (sr-only + visible paragraph both contain it).
    expect(screen.getAllByText(/Moving fast/).length).toBeGreaterThan(0);
    // role="alert" container is present
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows LEVEL 6 — ULT UP headline for ultimate kind", async () => {
    renderHarness(DEFAULT_SETTINGS);

    await act(async () => {
      tauri.emit("gank-alert", ULT_ALERT);
    });

    expect(await screen.findByText("LEVEL 6 — ULT UP")).toBeInTheDocument();
    expect(screen.getAllByText(/Just hit level 6/).length).toBeGreaterThan(0);
  });

  it("does NOT show the overlay when gankAlertsEnabled is false", async () => {
    renderHarness(SETTINGS_ALERTS_OFF);

    await act(async () => {
      tauri.emit("gank-alert", SAMPLE_ALERT);
    });

    // The aria-live region exists but the banner should not appear.
    await waitFor(() => {
      expect(screen.queryByText("GANK WINDOW")).not.toBeInTheDocument();
    });
  });

  it("dismisses the overlay when the dismiss button is clicked", async () => {
    const user = userEvent.setup();
    renderHarness(DEFAULT_SETTINGS);

    await act(async () => {
      tauri.emit("gank-alert", SAMPLE_ALERT);
    });

    expect(await screen.findByText("GANK WINDOW")).toBeInTheDocument();

    const dismissBtn = screen.getByRole("button", {
      name: /dismiss gank alert/i,
    });
    await user.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByText("GANK WINDOW")).not.toBeInTheDocument();
    });
  });

  it("plays sound when gankAlertSound is true", async () => {
    const { playGankAlertSound } = await import("@/lib/gankSound");
    const soundSpy = vi.mocked(playGankAlertSound);
    soundSpy.mockClear();

    renderHarness(DEFAULT_SETTINGS);

    await act(async () => {
      tauri.emit("gank-alert", SAMPLE_ALERT);
    });

    expect(await screen.findByText("GANK WINDOW")).toBeInTheDocument();
    expect(soundSpy).toHaveBeenCalledOnce();
  });

  it("does NOT play sound when gankAlertSound is false", async () => {
    const { playGankAlertSound } = await import("@/lib/gankSound");
    const soundSpy = vi.mocked(playGankAlertSound);
    soundSpy.mockClear();

    renderHarness({ ...DEFAULT_SETTINGS, gankAlertSound: false });

    await act(async () => {
      tauri.emit("gank-alert", SAMPLE_ALERT);
    });

    expect(await screen.findByText("GANK WINDOW")).toBeInTheDocument();
    expect(soundSpy).not.toHaveBeenCalled();
  });
});
