//! Auto-update flow for the tray "Check for updates…" action (PROJECT_SPEC §6.2).
//!
//! Desktop-only: the `tauri-plugin-updater` pulls minisign-signed bundles from the GitHub
//! Releases endpoint configured in `tauri.conf.json`. The flow is **advisory** — it always
//! asks before installing, consistent with the app's "recommend, never act" stance (§1.2).
//! This module is only compiled on desktop (see the `cfg` gate in `lib.rs`).

use crate::commands::UpdateInfo;
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

/// Checks the release endpoint and returns the available update (if any) for the frontend's
/// in-app update card. Pure query — downloads nothing.
pub async fn check_update<R: Runtime>(
    app: &AppHandle<R>,
) -> tauri_plugin_updater::Result<Option<UpdateInfo>> {
    let current_version = app.package_info().version.to_string();
    Ok(app.updater()?.check().await?.map(|update| UpdateInfo {
        version: update.version.clone(),
        current_version,
    }))
}

/// Downloads + installs the available update and relaunches. No-op if already up to date.
pub async fn install_update<R: Runtime>(app: &AppHandle<R>) -> tauri_plugin_updater::Result<()> {
    if let Some(update) = app.updater()?.check().await? {
        log::info!("installing update {} from in-app prompt", update.version);
        update.download_and_install(|_, _| {}, || {}).await?;
        app.restart();
    }
    Ok(())
}

/// Kicks off an update check on a background task (the tray menu handler must not block).
///
/// `notify_when_current` controls the "you're up to date" feedback: the manual menu action
/// passes `true` so the user always gets an answer; a future silent/background check would
/// pass `false`.
pub fn check_for_updates<R: Runtime>(app: &AppHandle<R>, notify_when_current: bool) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(err) = run(&app, notify_when_current).await {
            log::error!("update check failed: {err}");
            app.dialog()
                .message(format!("Could not check for updates.\n\n{err}"))
                .kind(MessageDialogKind::Error)
                .title("DraftSmith — Update")
                .blocking_show();
        }
    });
}

async fn run<R: Runtime>(
    app: &AppHandle<R>,
    notify_when_current: bool,
) -> tauri_plugin_updater::Result<()> {
    match app.updater()?.check().await? {
        Some(update) => {
            let version = update.version.clone();
            let confirmed = app
                .dialog()
                .message(format!(
                    "DraftSmith {version} is available.\n\nDownload and install it now? \
                     The app will restart to apply the update."
                ))
                .title("DraftSmith — Update available")
                .buttons(MessageDialogButtons::OkCancelCustom(
                    "Update now".into(),
                    "Later".into(),
                ))
                .blocking_show();

            if confirmed {
                log::info!("downloading update {version}");
                update
                    .download_and_install(
                        |_, _| {},
                        || log::info!("update download complete; installing"),
                    )
                    .await?;
                log::info!("update {version} installed; relaunching");
                app.restart();
            }
        }
        None => {
            log::info!("update check: already on the latest version");
            if notify_when_current {
                app.dialog()
                    .message("You're running the latest version of DraftSmith.")
                    .title("DraftSmith — Up to date")
                    .blocking_show();
            }
        }
    }
    Ok(())
}
