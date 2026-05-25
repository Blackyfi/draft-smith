import { useEffect, useRef } from "react";

import { subscribe, type TauriEvents } from "@/lib/events";

/**
 * Subscribes to a Tauri event for the lifetime of the calling component, with correct async
 * cleanup: `listen` resolves to its unlisten fn *after* an `await`, so an unmount that races the
 * subscription must still tear it down. We track that with a flag and unlisten on resolve.
 *
 * `handler` is read through a ref so a new closure each render doesn't re-subscribe; pass whatever
 * you like without memoizing. The subscription itself is created once per `event`.
 */
export function useTauriEvent<K extends keyof TauriEvents>(
  event: K,
  handler: (payload: TauriEvents[K]) => void,
) {
  // Keep the latest handler without making it a dependency of the subscription effect. Updated in
  // an effect (not during render) so the subscription created below can read the freshest closure.
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void subscribe(event, (payload) => ref.current(payload)).then((fn) => {
      if (active) unlisten = fn;
      else fn(); // unmounted before the listener resolved — tear it down immediately.
    });
    return () => {
      active = false;
      unlisten?.();
    };
  }, [event]);
}
