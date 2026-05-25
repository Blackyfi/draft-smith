mod commands;
mod ddragon;
mod engine;
mod live_client;
mod model;
mod poll;
mod rules;
mod state;
mod tray;
// Auto-updater is desktop-only; mobile platforms update through their app stores.
#[cfg(desktop)]
mod updater;

use tauri::{Manager, WindowEvent};
use tauri_plugin_log::{Target, TargetKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Auto-updater (M6): the plugin and the native dialog it prompts through are desktop-only.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_dialog::init());
    }

    builder
        .setup(|app| {
            // Log to a file in every build (PROJECT_SPEC §6.4 "log to file"), plus stdout in debug.
            let mut targets = vec![Target::new(TargetKind::LogDir { file_name: None })];
            if cfg!(debug_assertions) {
                targets.push(Target::new(TargetKind::Stdout));
            }
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .targets(targets)
                    .build(),
            )?;

            // User settings persist to the app-data dir. Load them first (degrades to defaults on a
            // missing/corrupt file, never panics) so the bootstrap below picks up the saved locale.
            let app_data_dir = app.path().app_data_dir()?;
            let settings_path = app_data_dir.join("settings.json");
            let settings_state = state::SettingsState::load(settings_path);
            let always_on_top = settings_state.current().always_on_top;
            app.manage(settings_state);

            tray::build_tray(app.handle())?;

            // Apply the persisted pin-on-top to the main window.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_always_on_top(always_on_top);
            }

            // DDragon cache lives in the app-data dir (outside the repo). Resolve it, register
            // the managed state, and kick off the bootstrap off the main thread so startup is
            // never blocked on the network (PROJECT_SPEC §3.2; falls back to cache when offline).
            // `refresh_ddragon` reads the locale from the settings state managed above.
            let cache_root = app_data_dir.join("ddragon");
            app.manage(state::DdragonState::new(cache_root));
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                commands::refresh_ddragon(&handle, false).await;
            });

            // Live Client poller (M2): drives `connection-status` / `game-state-changed` from the
            // local game. Runs off the main thread for the life of the app; "no game" outside a
            // match is the normal state, not an error (PROJECT_SPEC §3.1).
            app.manage(state::LiveState::default());
            poll::spawn(app.handle().clone());

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
            commands::get_current_recommendation,
            commands::force_refresh_ddragon,
            commands::get_champion_meta,
            commands::get_item_icon,
            commands::get_champion_icon,
            commands::get_champion_icon_by_name,
            commands::get_champion_display_name,
            commands::get_changelog,
            commands::get_app_version,
            commands::check_for_update,
            commands::install_update,
            commands::get_settings,
            commands::set_settings,
            commands::reset_ddragon_cache,
            commands::get_ddragon_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
