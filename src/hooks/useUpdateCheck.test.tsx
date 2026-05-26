import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useUiStore } from "@/store/ui";
import type { Settings, UpdateInfo } from "@/types";

// ── Tauri mock ─────────────────────────────────────────────────────────────
const tauri = vi.hoisted(() => {
  const listeners = new Map<string, Set<(e: { payload: unknown }) => void>>();
  const invokeHandlers: Record<string, (args: unknown) => unknown> = {};
  return {
    listeners,
    invokeHandlers,
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

// ── Fixtures ───────────────────────────────────────────────────────────────
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
};

const UPDATE_AVAILABLE: UpdateInfo = {
  version: "0.2.0",
  currentVersion: "0.1.3",
};

// ── Helpers ────────────────────────────────────────────────────────────────
function renderDialog() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useUiStore.setState({ settingsOpen: true });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <SettingsDialog />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe("About & Updates section", () => {
  beforeEach(() => {
    tauri.reset();
    tauri.invokeHandlers["get_settings"] = () => DEFAULT_SETTINGS;
    tauri.invokeHandlers["set_settings"] = (args) =>
      (args as { settings: Settings }).settings;
    tauri.invokeHandlers["force_refresh_ddragon"] = () => "ready";
    tauri.invokeHandlers["reset_ddragon_cache"] = () => "ready";
    tauri.invokeHandlers["get_app_version"] = () => "0.1.3";
    tauri.invokeHandlers["get_changelog"] = () =>
      "## 0.1.3\n- Initial release\n- Bug fixes";
    // Default: up to date (null means no update available)
    tauri.invokeHandlers["check_for_update"] = () => null;
  });

  it("shows version and up-to-date status", async () => {
    renderDialog();

    // Version heading
    expect(await screen.findByText(/DraftSmith v0\.1\.3/i)).toBeInTheDocument();

    // Up-to-date status text includes the version
    expect(
      await screen.findByText(/you're on the latest version/i),
    ).toBeInTheDocument();
  });

  it("shows the update available state with Update now button", async () => {
    tauri.invokeHandlers["check_for_update"] = () => UPDATE_AVAILABLE;
    renderDialog();

    expect(
      await screen.findByText(/update available: v0\.2\.0/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /update now/i }),
    ).toBeInTheDocument();
  });

  it("shows install-pending state while installUpdate is in progress", async () => {
    tauri.invokeHandlers["check_for_update"] = () => UPDATE_AVAILABLE;
    // installUpdate never resolves — simulates long relaunch
    tauri.invokeHandlers["install_update"] = () => new Promise<void>(() => {});
    const user = userEvent.setup();
    renderDialog();

    const btn = await screen.findByRole("button", { name: /update now/i });
    await user.click(btn);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /installing/i }),
      ).toBeDisabled(),
    );
  });

  it("shows the error state with Retry button when check_for_update rejects", async () => {
    tauri.invokeHandlers["check_for_update"] = () => {
      throw new Error("offline");
    };
    renderDialog();

    expect(
      await screen.findByText(/couldn't check for updates/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("opens the changelog panel and renders content on 'What's new' click", async () => {
    const user = userEvent.setup();
    renderDialog();

    await screen.findByText(/DraftSmith v0\.1\.3/i);

    const whatsNewBtn = screen.getByRole("button", { name: /what's new/i });
    await user.click(whatsNewBtn);

    // The changelog heading and bullet from the fixture
    expect(await screen.findByText("0.1.3")).toBeInTheDocument();
    expect(screen.getByText("Initial release")).toBeInTheDocument();
    expect(screen.getByText("Bug fixes")).toBeInTheDocument();
  });
});
