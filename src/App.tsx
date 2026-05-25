import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { Dashboard } from "@/components/Dashboard";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Connecting } from "@/components/states/Connecting";
import { ErrorState } from "@/components/states/ErrorState";
import { NoGame } from "@/components/states/NoGame";
import { useBuildShiftToasts } from "@/hooks/useBuildShiftToasts";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { useRecommendation } from "@/hooks/useRecommendation";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import { useThemeSync } from "@/hooks/useThemeSync";
import { useUpdateCheck } from "@/hooks/useUpdateCheck";
import { useUiStore } from "@/store/ui";
import type { ConnectionStatus, Recommendation } from "@/types";

function App() {
  const { data: status, isLoading } = useConnectionStatus();
  const { data: recommendation } = useRecommendation();
  // Toast build shifts as the engine re-ranks (mounted once, app-wide).
  useBuildShiftToasts();
  // Seed the update-check query once at app start so the Header badge and the
  // About section in SettingsDialog share the same cached result.
  useUpdateCheck();
  // Apply the theme from settings to document.documentElement.
  useThemeSync();
  // Open the settings dialog when the tray "Settings" entry fires.
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  useTauriEvent("open-settings", () => setSettingsOpen(true));

  // While the first status resolves, present it as "Connecting…" (a real, labeled state) rather
  // than an ambiguous placeholder.
  const current: ConnectionStatus = isLoading
    ? "connecting"
    : (status ?? "no-game");

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header status={current} />
      {/* Center a comfortable reading column so the app looks intentional at any window size
          (compact overlay → maximized) instead of stretching edge-to-edge. The scrollbar sits at
          the window edge; the content stays centered within max-w-app. */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-app flex-col">
          {renderMain(current, recommendation)}
        </div>
      </main>
      <Footer />
      <SettingsDialog />
    </div>
  );
}

/** Maps the connection status to the appropriate state view (PROJECT_SPEC §6.4). */
function renderMain(
  status: ConnectionStatus,
  recommendation: Recommendation | null | undefined,
) {
  switch (status) {
    case "in-game":
      return <Dashboard recommendation={recommendation} />;
    case "connecting":
      return <Connecting />;
    case "error":
      return <ErrorState />;
    case "no-game":
      return <NoGame />;
  }
}

export default App;
