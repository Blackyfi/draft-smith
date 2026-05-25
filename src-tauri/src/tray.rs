//! System-tray icon + menu, and the show/hide-to-tray behavior (PROJECT_SPEC §6.2).
//!
//! Tray status colors (grey/blue/green) are added in a later milestone; the runtime
//! `set_icon` seam exists on the tray (looked up by the `"main-tray"` id) for that.

use crate::model::ConnectionStatus;
use crate::state::SettingsState;
use tauri::{
    menu::{CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime,
};

/// The tray's stable lookup id (used by [`set_status`] to update the tooltip from the poller).
const TRAY_ID: &str = "main-tray";

/// Builds the tray icon and its menu, and wires left-click + menu interactions.
pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_hide = MenuItemBuilder::with_id("show_hide", "Show / Hide").build(app)?;
    let settings = MenuItemBuilder::with_id("settings", "Settings…").build(app)?;
    // Initial checked state mirrors the persisted pin-on-top setting (settings are managed before
    // the tray is built in `lib.rs::setup`).
    let pinned = app
        .try_state::<SettingsState>()
        .map(|s| s.current().always_on_top)
        .unwrap_or(false);
    let pin_on_top: CheckMenuItem<R> = CheckMenuItemBuilder::with_id("pin_on_top", "Pin on top")
        .checked(pinned)
        .build(app)?;
    let check_updates =
        MenuItemBuilder::with_id("check_updates", "Check for updates…").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit DraftSmith").build(app)?;
    let menu = MenuBuilder::new(app)
        .items(&[&show_hide, &settings, &pin_on_top, &check_updates, &quit])
        .build()?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("DraftSmith")
        .menu(&menu)
        // Left-click toggles the window; the menu is reserved for right-click.
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "show_hide" => toggle_main_window(app),
            "settings" => open_settings(app),
            "pin_on_top" => toggle_pin_on_top(app, &pin_on_top),
            "check_updates" => check_for_updates(app),
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

/// Brings the main window to the front and asks the FE to open the Settings dialog (the FE listens
/// for the `open-settings` event — PROJECT_SPEC §6.2/§6.6).
fn open_settings<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit("open-settings", ());
}

/// Runs the advisory update check (PROJECT_SPEC §6.2). Desktop-only — the updater module isn't
/// compiled on mobile, where updates come from the app store.
fn check_for_updates<R: Runtime>(app: &AppHandle<R>) {
    #[cfg(desktop)]
    crate::updater::check_for_updates(app, true);
    #[cfg(not(desktop))]
    let _ = app;
}

/// Flips the persisted pin-on-top setting, applies it to the main window, and syncs the menu check.
fn toggle_pin_on_top<R: Runtime>(app: &AppHandle<R>, item: &CheckMenuItem<R>) {
    let Some(state) = app.try_state::<SettingsState>() else {
        return;
    };
    let mut next = state.current();
    next.always_on_top = !next.always_on_top;
    if let Err(err) = state.save(&next) {
        log::warn!("tray: failed to persist pin-on-top ({err})");
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(next.always_on_top);
    }
    let _ = item.set_checked(next.always_on_top);
}

/// Updates the tray tooltip to reflect the live connection status (PROJECT_SPEC §6.2). Colored
/// status icons are deferred to M6; the tooltip is the only surface here. Looks the tray up by its
/// stable id, so this is safe to call from the poller without holding a handle to the icon.
pub fn set_status<R: Runtime>(app: &AppHandle<R>, status: ConnectionStatus) {
    let label = match status {
        ConnectionStatus::InGame => "DraftSmith — In game",
        ConnectionStatus::NoGame => "DraftSmith — No game",
        ConnectionStatus::Connecting => "DraftSmith — Connecting…",
        ConnectionStatus::Error => "DraftSmith — Error",
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(label));
    }
}
