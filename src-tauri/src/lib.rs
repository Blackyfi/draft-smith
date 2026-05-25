mod commands;
mod model;
mod tray;

use tauri::WindowEvent;

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
        .invoke_handler(tauri::generate_handler![commands::get_status])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
