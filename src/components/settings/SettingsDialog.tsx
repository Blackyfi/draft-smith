import React, { useState } from "react";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DatabaseIcon,
  DownloadIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useAppVersion } from "@/hooks/useAppVersion";
import { useChangelog } from "@/hooks/useChangelog";
import { useSettings } from "@/hooks/useSettings";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";
import type { KeyLayout, Rank } from "@/types";

/** Rank options for the Meta panel (Tier B). */
const RANK_OPTIONS: { value: Rank; label: string }[] = [
  { value: "challenger", label: "Challenger" },
  { value: "master_plus", label: "Master+" },
  { value: "diamond_plus", label: "Diamond+" },
  { value: "emerald_plus", label: "Emerald+" },
  { value: "platinum_plus", label: "Platinum+" },
];

/** Curated DDragon locale list (spec: locale drives the re-download). */
const LOCALES: { value: string; label: string }[] = [
  { value: "en_US", label: "English (US)" },
  { value: "en_GB", label: "English (UK)" },
  { value: "fr_FR", label: "Francais" },
  { value: "de_DE", label: "Deutsch" },
  { value: "es_ES", label: "Espanol (ES)" },
  { value: "es_MX", label: "Espanol (MX)" },
  { value: "it_IT", label: "Italiano" },
  { value: "pl_PL", label: "Polski" },
  { value: "pt_BR", label: "Portugues (BR)" },
  { value: "ru_RU", label: "Russkiy" },
  { value: "tr_TR", label: "Turkce" },
  { value: "ja_JP", label: "Japanese" },
  { value: "ko_KR", label: "Korean" },
  { value: "zh_CN", label: "Chinese (Simplified)" },
  { value: "zh_TW", label: "Chinese (Traditional)" },
];

/**
 * Settings dialog (PROJECT_SPEC 6.6). Open state is controlled by Zustand settingsOpen so the
 * tray Settings entry and the header gear button both open it without prop-drilling.
 *
 * All controls delegate to useSettings().update; components are purely presentational.
 * Talk to Rust only through @/lib/tauri (frontend.md rule).
 */
export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const { data: settings, update } = useSettings();

  const [refreshPending, setRefreshPending] = useState(false);
  const [resetPending, setResetPending] = useState(false);

  async function handleRefresh() {
    setRefreshPending(true);
    try {
      const status = await api.forceRefreshDdragon();
      toast.success(
        status === "ready"
          ? "Patch data refreshed"
          : "Patch data refresh complete",
        { description: `Status: ${status}` },
      );
    } catch {
      toast.error("Failed to refresh patch data", {
        description: "Check your internet connection and try again.",
      });
    } finally {
      setRefreshPending(false);
    }
  }

  async function handleReset() {
    setResetPending(true);
    try {
      const status = await api.resetDdragonCache();
      toast.success("Patch cache cleared and rebuilt", {
        description: `Status: ${status}`,
      });
    } catch {
      toast.error("Failed to reset patch cache", {
        description: "Check your internet connection and try again.",
      });
    } finally {
      setResetPending(false);
    }
  }

  if (!settings) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure DraftSmith behavior and appearance.
          </DialogDescription>
        </DialogHeader>

        {/* Scroll region: bounded by the dialog's max-height so the header + close button stay
            pinned and reachable even on short windows. The -mr-2 pr-2 keeps the themed scrollbar
            flush with the dialog edge without crowding the controls. */}
        <div className="-mr-2 grid min-h-0 flex-1 gap-5 overflow-y-auto py-1 pr-2">
          {/* Poll interval */}
          <div className="grid gap-1.5">
            <Label htmlFor="poll-interval">Poll interval</Label>
            <Select
              value={String(settings.pollIntervalSecs)}
              onValueChange={(v) => update({ pollIntervalSecs: Number(v) })}
            >
              <SelectTrigger id="poll-interval" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4, 5].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s} seconds
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              How often the Live Client API is queried during a game (2-5 s).
            </p>
          </div>

          {/* Theme */}
          <div className="flex items-center justify-between gap-4">
            <div className="grid gap-0.5">
              <Label htmlFor="theme-switch">Dark mode</Label>
              <p className="text-[11px] text-muted-foreground">
                Switch between dark and light appearance.
              </p>
            </div>
            <Switch
              id="theme-switch"
              checked={settings.theme === "dark"}
              onCheckedChange={(checked) =>
                update({ theme: checked ? "dark" : "light" })
              }
              aria-label="Toggle dark mode"
            />
          </div>

          {/* Always on top */}
          <div className="flex items-center justify-between gap-4">
            <div className="grid gap-0.5">
              <Label htmlFor="aot-switch">Always on top</Label>
              <p className="text-[11px] text-muted-foreground">
                Keep the window above other applications.
              </p>
            </div>
            <Switch
              id="aot-switch"
              checked={settings.alwaysOnTop}
              onCheckedChange={(checked) => update({ alwaysOnTop: checked })}
              aria-label="Toggle always on top"
            />
          </div>

          {/* DDragon locale */}
          <div className="grid gap-1.5">
            <Label htmlFor="locale-select">Language / Locale</Label>
            <Select
              value={settings.locale}
              onValueChange={(v) => update({ locale: v })}
            >
              <SelectTrigger id="locale-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOCALES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Item and champion names language. Changing this re-downloads patch
              data.
            </p>
          </div>

          {/* Aggressiveness */}
          <div className="grid gap-1.5">
            <Label htmlFor="aggressiveness-select">Recommendation style</Label>
            <Select
              value={settings.aggressiveness}
              onValueChange={(v) =>
                update({ aggressiveness: v as "rules-only" | "stats-biased" })
              }
            >
              <SelectTrigger id="aggressiveness-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rules-only">Rules only</SelectItem>
                <SelectItem value="stats-biased" disabled>
                  Stats-biased - coming soon
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Rules only uses the data-driven rule engine (Tier A). Stats-biased
              will blend win-rate data in a future update (Tier B / M7).
            </p>
          </div>

          {/* Meta panel — show/hide toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="grid gap-0.5">
              <Label htmlFor="meta-panel-switch">Show Meta panel</Label>
              <p className="text-[11px] text-muted-foreground">
                Display the highest win-rate build beside the Adapt panel.
              </p>
            </div>
            <Switch
              id="meta-panel-switch"
              checked={settings.showMetaPanel}
              onCheckedChange={(checked) => update({ showMetaPanel: checked })}
              aria-label="Toggle Meta panel"
            />
          </div>

          {/* Meta panel — rank selector */}
          <div className="grid gap-1.5">
            <Label htmlFor="meta-rank-select">Meta build rank</Label>
            <Select
              value={settings.metaRank}
              onValueChange={(v) => update({ metaRank: v as Rank })}
            >
              <SelectTrigger id="meta-rank-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANK_OPTIONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Rank bracket used for the Meta panel win-rate data (u.gg).
              Default: Diamond+.
            </p>
          </div>

          {/* Ability keys */}
          <div className="grid gap-1.5">
            <Label htmlFor="ability-layout-select">Ability key layout</Label>
            <Select
              value={settings.abilityKeys.layout}
              onValueChange={(v) =>
                update({
                  abilityKeys: {
                    ...settings.abilityKeys,
                    layout: v as KeyLayout,
                  },
                })
              }
            >
              <SelectTrigger id="ability-layout-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="qwerty">QWERTY (Q / W / E / R)</SelectItem>
                <SelectItem value="azerty">AZERTY (A / Z / E / R)</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {settings.abilityKeys.layout === "custom" && (
              <div className="mt-1 grid grid-cols-4 gap-2">
                {(["Q", "W", "E", "R"] as const).map((slot, i) => (
                  <div key={slot} className="grid gap-1">
                    <label
                      htmlFor={`custom-key-${slot}`}
                      className="text-[11px] text-muted-foreground text-center"
                    >
                      {slot} slot
                    </label>
                    <input
                      id={`custom-key-${slot}`}
                      type="text"
                      maxLength={1}
                      value={settings.abilityKeys.custom[i]}
                      onChange={(e) => {
                        const next: [string, string, string, string] = [
                          ...settings.abilityKeys.custom,
                        ] as [string, string, string, string];
                        next[i] = e.target.value.slice(-1).toUpperCase();
                        update({
                          abilityKeys: {
                            ...settings.abilityKeys,
                            custom: next,
                          },
                        });
                      }}
                      aria-label={`Custom key for slot ${slot}`}
                      className="h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-center text-sm font-bold uppercase shadow-xs outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              How ability slots are labeled in the skill-order coach. Custom
              lets you enter the exact keys you have bound in-game.
            </p>
          </div>

          {/* Patch data actions */}
          <div className="grid gap-2">
            <Label>Patch data</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshPending}
                aria-busy={refreshPending}
                className="gap-1.5"
              >
                <RefreshCwIcon
                  className={
                    refreshPending ? "animate-spin size-3.5" : "size-3.5"
                  }
                  aria-hidden="true"
                />
                {refreshPending ? "Refreshing..." : "Refresh patch data"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={resetPending}
                aria-busy={resetPending}
                className="gap-1.5"
              >
                <DatabaseIcon className="size-3.5" aria-hidden="true" />
                {resetPending ? "Resetting..." : "Reset cache"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Refresh checks for a new patch and downloads if available. Reset
              cache wipes local data and re-downloads everything.
            </p>
          </div>

          {/* About & Updates */}
          <AboutSection />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── status dot colours (always paired with text) ──────────────────────────────
const DOT_CLASS: Record<string, string> = {
  checking: "bg-muted-foreground/50",
  "up-to-date": "bg-emerald-500",
  available: "bg-amber-400",
  error: "bg-muted-foreground/50",
};

/**
 * "About & Updates" section rendered inside SettingsDialog. Extracted to keep the parent concise;
 * consumes the shared useUpdateCheck / useAppVersion / useChangelog queries.
 */
function AboutSection() {
  const { data: version } = useAppVersion();
  const { update, status, refetch } = useUpdateCheck();
  const changelog = useChangelog();

  const [installing, setInstalling] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);

  async function handleInstall() {
    setInstalling(true);
    try {
      await api.installUpdate();
      // App relaunches — no further action needed.
    } catch {
      toast.error("Update failed", {
        description: "Could not install the update. Please try again later.",
      });
      setInstalling(false);
    }
  }

  function handleToggleChangelog() {
    if (!changelogOpen) {
      // Trigger a fetch on first open (query has enabled:false by default).
      void changelog.refetch();
    }
    setChangelogOpen((prev) => !prev);
  }

  const statusText: Record<string, string> = {
    checking: "Checking for updates…",
    "up-to-date": `You're on the latest version${version ? ` (v${version})` : ""}.`,
    available: `Update available: v${update?.version ?? ""}`,
    error: "Couldn't check for updates",
  };

  return (
    <div className="grid gap-2">
      <Label>About &amp; Updates</Label>

      {/* Version row */}
      <p className="text-sm font-medium">
        DraftSmith{version ? ` v${version}` : ""}
      </p>

      {/* Update status row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5">
          <span
            className={cn("size-2 rounded-full", DOT_CLASS[status])}
            aria-hidden="true"
          />
          <span className="text-xs text-muted-foreground">
            {statusText[status]}
          </span>
          {status === "up-to-date" && (
            <CheckCircleIcon
              className="size-3.5 text-emerald-500"
              aria-hidden="true"
            />
          )}
        </span>

        {status === "available" && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleInstall}
            disabled={installing}
            aria-busy={installing}
            className="gap-1.5"
          >
            <DownloadIcon className="size-3.5" aria-hidden="true" />
            {installing ? "Installing…" : "Update now"}
          </Button>
        )}

        {status === "error" && (
          <Button
            size="sm"
            variant="outline"
            onClick={refetch}
            className="gap-1.5"
          >
            <RefreshCwIcon className="size-3.5" aria-hidden="true" />
            Retry
          </Button>
        )}
      </div>

      {/* What's new toggle */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggleChangelog}
        className="w-fit gap-1.5 px-0 text-xs text-muted-foreground hover:text-foreground"
        aria-expanded={changelogOpen}
      >
        {changelogOpen ? (
          <ChevronUpIcon className="size-3.5" aria-hidden="true" />
        ) : (
          <ChevronDownIcon className="size-3.5" aria-hidden="true" />
        )}
        What&apos;s new
      </Button>

      {changelogOpen && (
        <ChangelogPanel
          content={changelog.data ?? null}
          loading={changelog.isFetching}
        />
      )}
    </div>
  );
}

/** Renders the changelog markdown in a scrollable region without a markdown library. */
function ChangelogPanel({
  content,
  loading,
}: {
  content: string | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div
        className="flex h-24 items-center justify-center rounded-md border border-border bg-muted/30 text-xs text-muted-foreground"
        aria-live="polite"
        aria-busy="true"
      >
        Loading…
      </div>
    );
  }

  if (!content) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        No changelog available.
      </div>
    );
  }

  // Minimal inline renderer: ## / ### headings and - bullets, everything else as paragraphs.
  const lines = content.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("### ")) {
      nodes.push(
        <h4
          key={key++}
          className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {line.slice(4)}
        </h4>,
      );
    } else if (line.startsWith("## ")) {
      nodes.push(
        <h3
          key={key++}
          className="mt-3 text-xs font-semibold text-foreground first:mt-0"
        >
          {line.slice(3)}
        </h3>,
      );
    } else if (line.startsWith("- ")) {
      nodes.push(
        <li key={key++} className="ml-3 text-xs text-muted-foreground">
          {line.slice(2)}
        </li>,
      );
    } else if (line.trim() !== "") {
      nodes.push(
        <p key={key++} className="text-xs text-muted-foreground">
          {line}
        </p>,
      );
    }
  }

  return (
    <div
      role="region"
      aria-label="Changelog"
      className="max-h-48 overflow-y-auto rounded-md border border-border bg-muted/30 px-3 py-2"
    >
      <ul className="flex flex-col gap-0.5">{nodes}</ul>
    </div>
  );
}
