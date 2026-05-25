//! System-tray icon + menu, and the show/hide-to-tray behavior (PROJECT_SPEC §6.2).
//!
//! Tray status colors (grey/blue/green) are added in a later milestone; the runtime
//! `set_icon` seam exists on the tray (looked up by the `"main-tray"` id) for that.

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

/// Builds the tray icon and its menu, and wires left-click + menu interactions.
pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_hide = MenuItemBuilder::with_id("show_hide", "Show / Hide").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit DraftSmith").build(app)?;
    let menu = MenuBuilder::new(app).items(&[&show_hide, &quit]).build()?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("DraftSmith")
        .menu(&menu)
        // Left-click toggles the window; the menu is reserved for right-click.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show_hide" => toggle_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        });

    // Use the bundled app icon when available; fall back to the platform default rather
    // than panicking if it is somehow missing.
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    } else {
        log::warn!("no default window icon available; tray will use the platform default");
    }

    builder.build(app)?;

    Ok(())
}

/// Shows the main window if hidden, hides it if visible.
fn toggle_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}
