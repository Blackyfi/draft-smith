import { useState } from "react";
import { DatabaseIcon, RefreshCwIcon } from "lucide-react";
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
import { useSettings } from "@/hooks/useSettings";
import { api } from "@/lib/tauri";
import { useUiStore } from "@/store/ui";
import type { KeyLayout } from "@/types";

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

        <div className="grid gap-5 py-2">
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
            <Label htmlFor="aggressiveness-select">
              Recommendation style
            </Label>
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
              Rules only uses the data-driven rule engine (Tier A).
              Stats-biased will blend win-rate data in a future update (Tier B /
              M7).
            </p>
          </div>

          {/* Ability keys */}
          <div className="grid gap-1.5">
            <Label htmlFor="ability-layout-select">Ability key layout</Label>
            <Select
              value={settings.abilityKeys.layout}
              onValueChange={(v) =>
                update({
                  abilityKeys: { ...settings.abilityKeys, layout: v as KeyLayout },
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
                        update({ abilityKeys: { ...settings.abilityKeys, custom: next } });
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
        </div>
      </DialogContent>
    </Dialog>
  );
}