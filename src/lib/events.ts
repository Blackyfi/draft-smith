import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type {
  ConnectionStatus,
  DdragonStatus,
  GameStateSummary,
  Recommendation,
} from "@/types";

/**
 * Typed map of the Rust→FE Tauri events (PROJECT_SPEC §4.2). The key is the event name as emitted
 * by the poller / DDragon bootstrap; the value is its payload type. Keeping this in one place means
 * `subscribe` is fully typed and the FE can't listen for an event the Rust side never emits.
 */
export interface TauriEvents {
  "connection-status": ConnectionStatus;
  "game-state-changed": GameStateSummary;
  "recommendation-updated": Recommendation;
  "ddragon-status": DdragonStatus;
  /** Emitted by the tray "Settings" menu item; the FE opens the Settings dialog. No payload. */
  "open-settings": null;
}

/**
 * Thin typed wrapper over Tauri's `listen`. Returns the unlisten function. The handler receives the
 * already-unwrapped payload (not the `{ payload }` envelope), so callers stay clean.
 */
export function subscribe<K extends keyof TauriEvents>(
  event: K,
  handler: (payload: TauriEvents[K]) => void,
): Promise<UnlistenFn> {
  return listen<TauriEvents[K]>(event, (e) => handler(e.payload));
}
