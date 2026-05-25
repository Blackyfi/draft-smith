import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUiStore } from "@/store/ui";
import type { Settings } from "@/types";

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
const DEFAULT_SETTINGS: Settings = {
  pollIntervalSecs: 3,
  theme: "dark",
  alwaysOnTop: false,
  locale: "en_US",
  aggressiveness: "rules-only",
};

// ---------- Helpers ----------
function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Open the dialog via the Zustand store before rendering.
  useUiStore.setState({ settingsOpen: true });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SettingsDialog />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

// ---------- Tests ----------
describe("SettingsDialog", () => {
  beforeEach(() => {
    tauri.reset();
    tauri.invokeHandlers["get_settings"] = () => DEFAULT_SETTINGS;
    tauri.invokeHandlers["set_settings"] = (args) => {
      // Return the settings as-is (Rust would sanitize, but for tests just echo).
      const { settings } = args as { settings: Settings };
      return settings;
    };
    tauri.invokeHandlers["force_refresh_ddragon"] = () => "ready";
    tauri.invokeHandlers["reset_ddragon_cache"] = () => "ready";
  });

  it("renders all controls seeded from get_settings", async () => {
    renderDialog();

    // Dialog title present.
    expect(await screen.findByText("Settings")).toBeInTheDocument();

    // All section labels present.
    expect(screen.getByText("Poll interval")).toBeInTheDocument();
    expect(screen.getByText("Dark mode")).toBeInTheDocument();
    expect(screen.getByText("Always on top")).toBeInTheDocument();
    expect(screen.getByText("Language / Locale")).toBeInTheDocument();
    expect(screen.getByText("Recommendation style")).toBeInTheDocument();
    expect(screen.getByText("Patch data")).toBeInTheDocument();

    // Action buttons.
    expect(
      screen.getByRole("button", { name: /refresh patch data/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reset cache/i }),
    ).toBeInTheDocument();
  });

  it("calls set_settings with the toggled always-on-top value", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText("Settings");

    const captured: Settings[] = [];
    tauri.invokeHandlers["set_settings"] = (args) => {
      const { settings } = args as { settings: Settings };
      captured.push(settings);
      return settings;
    };

    // Find the always-on-top switch (aria-label from the Switch component).
    const aotSwitch = screen.getByRole("switch", {
      name: /toggle always on top/i,
    });
    await user.click(aotSwitch);

    await waitFor(() => expect(captured.length).toBeGreaterThan(0));
    expect(captured[0].alwaysOnTop).toBe(true);
  });

  it("calls set_settings with theme light when dark-mode switch is toggled off", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText("Settings");

    const captured: Settings[] = [];
    tauri.invokeHandlers["set_settings"] = (args) => {
      const { settings } = args as { settings: Settings };
      captured.push(settings);
      return settings;
    };

    const themeSwitch = screen.getByRole("switch", {
      name: /toggle dark mode/i,
    });

    // Default is dark — switch should be checked.
    expect(themeSwitch).toHaveAttribute("aria-checked", "true");

    await user.click(themeSwitch);

    await waitFor(() => expect(captured.length).toBeGreaterThan(0));
    expect(captured[0].theme).toBe("light");
  });

  it("theme switch reflects the current theme from settings", async () => {
    renderDialog();
    await screen.findByText("Settings");

    // Default settings have theme: "dark" — the switch should be checked (dark = on).
    const themeSwitch = screen.getByRole("switch", {
      name: /toggle dark mode/i,
    });
    expect(themeSwitch).toHaveAttribute("aria-checked", "true");
  });

  it("shows a success toast after refresh patch data", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText("Settings");

    const refreshBtn = screen.getByRole("button", {
      name: /refresh patch data/i,
    });
    await user.click(refreshBtn);

    expect(
      await screen.findByText("Patch data refreshed"),
    ).toBeInTheDocument();
  });

  it("shows a success toast after reset cache", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText("Settings");

    const resetBtn = screen.getByRole("button", { name: /reset cache/i });
    await user.click(resetBtn);

    expect(
      await screen.findByText("Patch cache cleared and rebuilt"),
    ).toBeInTheDocument();
  });
});