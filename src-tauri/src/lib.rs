mod commands;
mod ddragon;
mod model;
mod state;
mod tray;

use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            tray::build_tray(app.handle())?;

            // DDragon cache lives in the app-data dir (outside the repo). Resolve it, register
            // the managed state, and kick off the bootstrap off the main thread so startup is
            // never blocked on the network (PROJECT_SPEC §3.2; falls back to cache when offline).
            let cache_root = app.path().app_data_dir()?.join("ddragon");
            app.manage(state::DdragonState::new(cache_root));
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                commands::refresh_ddragon(&handle, false).await;
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Keep DraftSmith living in the tray: closing the window hides it rather than
            // quitting the app (PROJECT_SPEC §6.2).
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_status,
            commands::force_refresh_ddragon,
            commands::get_champion_meta,
            commands::get_item_icon,
            commands::get_champion_icon,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
