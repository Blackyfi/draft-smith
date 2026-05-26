import { useCallback, useEffect, useRef, useState } from "react";

import { playGankAlertSound } from "@/lib/gankSound";
import { useSettings } from "@/hooks/useSettings";
import { useTauriEvent } from "@/hooks/useTauriEvent";
import type { GankAlert } from "@/types";

/** Auto-dismiss delay in milliseconds. */
const DISMISS_MS = 3000;

/**
 * Subscribes to the `gank-alert` Tauri event and manages the current alert state.
 *
 * - If `gankAlertsEnabled` is false in settings, incoming events are ignored entirely.
 * - A newer alert replaces the current one and resets the auto-dismiss timer.
 * - Timers are cleared on unmount.
 * - When an alert is accepted and `gankAlertSound` is true, the sound plays.
 *
 * Exposes `{ alert, dismiss }` — the component only needs to render and call `dismiss`.
 */
export function useGankAlert(): { alert: GankAlert | null; dismiss: () => void } {
  const [alert, setAlert] = useState<GankAlert | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: settings } = useSettings();

  // Keep latest settings values in a ref so the event handler closure doesn't stale.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });

  const dismiss = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setAlert(null);
  }, []);

  useTauriEvent("gank-alert", (payload) => {
    const s = settingsRef.current;
    // Guard: if alerts are explicitly disabled, silently ignore.
    // Treat unloaded settings (undefined) as "enabled" since both default to true.
    if (s?.gankAlertsEnabled === false) return;

    // Clear any existing timer before setting the new alert.
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    setAlert(payload);

    // Play sound only when setting is explicitly true (default true, so undefined → play).
    if (s?.gankAlertSound !== false) {
      playGankAlertSound();
    }

    timerRef.current = setTimeout(() => {
      setAlert(null);
      timerRef.current = null;
    }, DISMISS_MS);
  });

  // Clean up timer on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { alert, dismiss };
}
