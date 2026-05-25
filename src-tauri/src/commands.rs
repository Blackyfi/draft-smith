//! Tauri commands exposed to the frontend (FE→Rust half of the contract, PROJECT_SPEC §4.2).

use crate::model::ConnectionStatus;

/// Returns the current connection / coaching status.
///
/// M0 stub: always [`ConnectionStatus::NoGame`]. The Live Client poller (M2) will drive this
/// from real game state.
#[tauri::command]
pub fn get_status() -> ConnectionStatus {
    ConnectionStatus::NoGame
}
