import { NoGame } from "@/components/states/NoGame";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import type { ConnectionStatus } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  "no-game": "No game",
  connecting: "Connecting…",
  "in-game": "In game",
  error: "Error",
};

/** Status dot color. Always paired with the text label, so color is never the only signal. */
const STATUS_DOT: Record<ConnectionStatus, string> = {
  "no-game": "bg-muted-foreground/40",
  connecting: "bg-sky-500",
  "in-game": "bg-emerald-500",
  error: "bg-destructive",
};

function App() {
  const { data: status, isLoading } = useConnectionStatus();
  // While the first status resolves, present it as "Connecting…" (a real, labeled state)
  // rather than an ambiguous placeholder.
  const current: ConnectionStatus = isLoading ? "connecting" : (status ?? "no-game");

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold tracking-tight">DraftSmith</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn("size-2 rounded-full", STATUS_DOT[current])}
            aria-hidden="true"
          />
          {STATUS_LABEL[current]}
        </span>
      </header>

      <main className="min-h-0 flex-1">
        {/* M0 wires only the no-game state; loading / in-game / error states arrive in M4–M5. */}
        <NoGame />
      </main>

      <footer className="border-t px-4 py-2 text-[11px] text-muted-foreground">
        data: Live Client + Data Dragon
      </footer>
    </div>
  );
}

export default App;
