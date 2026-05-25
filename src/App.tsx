import { Dashboard } from "@/components/Dashboard";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Connecting } from "@/components/states/Connecting";
import { ErrorState } from "@/components/states/ErrorState";
import { NoGame } from "@/components/states/NoGame";
import { useBuildShiftToasts } from "@/hooks/useBuildShiftToasts";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { useRecommendation } from "@/hooks/useRecommendation";
import type { ConnectionStatus, Recommendation } from "@/types";

function App() {
  const { data: status, isLoading } = useConnectionStatus();
  const { data: recommendation } = useRecommendation();
  // Toast build shifts as the engine re-ranks (mounted once, app-wide).
  useBuildShiftToasts();

  // While the first status resolves, present it as "Connecting…" (a real, labeled state) rather
  // than an ambiguous placeholder.
  const current: ConnectionStatus = isLoading
    ? "connecting"
    : (status ?? "no-game");

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header status={current} />
      <main className="min-h-0 flex-1 overflow-y-auto">
        {renderMain(current, recommendation)}
      </main>
      <Footer />
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
