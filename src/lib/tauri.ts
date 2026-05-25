import { invoke } from "@tauri-apps/api/core";

import type { ConnectionStatus } from "@/types";

/**
 * Thin typed bridge over Tauri commands (FE→Rust).
 *
 * Components and hooks call through `api`; they never invoke Tauri directly, so the contract
 * stays in one place and is easy to mock in tests.
 */
export const api = {
  /** Current connection / coaching status. */
  getStatus: () => invoke<ConnectionStatus>("get_status"),
};
