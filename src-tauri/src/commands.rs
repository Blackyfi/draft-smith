//! Tauri commands exposed to the frontend (FE→Rust half of the contract, PROJECT_SPEC §4.2),
//! plus the DDragon bootstrap that drives the `ddragon-status` event.

use crate::ddragon::{
    self, cache::DdragonCache, fetch::DdragonFetcher, icons::IconKind, LoadOutcome, ResolvedData,
};
use crate::model::settings::DEFAULT_LOCALE;
use crate::model::{ChampionMeta, ConnectionStatus, DdragonStatus, Recommendation, Settings};
use crate::state::{DdragonState, LiveState, SettingsState};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

/// Returns the current connection / coaching status, as maintained by the Live Client poller (M2).
#[tauri::command]
pub fn get_status(state: State<'_, LiveState>) -> ConnectionStatus {
    *state.status.lock().unwrap()
}

/// Returns the latest engine recommendation, or `None` when there's no live game (so the FE can
/// hydrate on mount without waiting for the next `recommendation-updated` event). The poller keeps
/// this in sync; the engine never recomputes here (PROJECT_SPEC §4.2, §5.2).
#[tauri::command]
pub async fn get_current_recommendation(
    state: State<'_, LiveState>,
) -> Result<Option<Recommendation>, String> {
    Ok(state.recommendation.read().await.clone())
}

/// Re-runs the DDragon bootstrap, forcing a re-download even if the cached patch looks current.
/// Returns the terminal status (`ready` or `offline`).
#[tauri::command]
pub async fn force_refresh_ddragon(app: AppHandle) -> DdragonStatus {
    refresh_ddragon(&app, true).await
}

/// Returns the current user settings (the in-memory clone kept by [`SettingsState`]).
#[tauri::command]
pub fn get_settings(state: State<'_, SettingsState>) -> Settings {
    state.current()
}

/// Persists user settings and applies their side effects. Returns the *sanitized* value actually
/// stored, so the FE can reflect any clamping/normalization. Network side effects (a locale change
/// re-download) are spawned, never awaited, so the command returns promptly (PROJECT_SPEC §6.6).
#[tauri::command]
pub async fn set_settings(
    app: AppHandle,
    settings: Settings,
    settings_state: State<'_, SettingsState>,
) -> Result<Settings, String> {
    let next = settings.sanitized();
    let locale_changed = next.locale != settings_state.current().locale;

    settings_state.save(&next).map_err(|err| err.to_string())?;

    // Pin-on-top is applied immediately to the main window.
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(next.always_on_top);
    }

    // A locale switch re-downloads the DDragon text blobs; do it off the command so we never block
    // the FE on the network. `refresh_ddragon` reads the (already-persisted) new locale from state.
    if locale_changed {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            refresh_ddragon(&handle, true).await;
        });
    }

    Ok(next)
}

/// Clears the on-disk DDragon cache (best-effort) and re-runs the bootstrap, forcing a fresh
/// download. Returns the terminal status (`ready` or `offline`).
#[tauri::command]
pub async fn reset_ddragon_cache(app: AppHandle) -> DdragonStatus {
    let cache_root = app.state::<DdragonState>().cache_root.clone();
    // Best-effort: a partly-cleared or absent cache is fine — the forced refresh repopulates it.
    if cache_root.exists() {
        if let Err(err) = std::fs::remove_dir_all(&cache_root) {
            log::warn!(
                "reset_ddragon_cache: could not clear {} ({err})",
                cache_root.display()
            );
        }
    }
    refresh_ddragon(&app, true).await
}

/// Returns the patch version of the currently loaded DDragon data, or `None` if none is loaded yet
/// (or the lock is momentarily held by the bootstrap). A synchronous command keeps the FE contract
/// `Option<String>` rather than `Result<…>`; `try_read` never blocks the IPC thread.
#[tauri::command]
pub fn get_ddragon_version(state: State<'_, DdragonState>) -> Option<String> {
    state
        .data
        .try_read()
        .ok()
        .and_then(|guard| guard.as_ref().map(|data| data.version.clone()))
}

/// Looks up resolved champion metadata by its numeric key (the Live Client ID space).
/// Returns `Ok(None)` when DDragon data has not loaded yet or the key is unknown.
#[tauri::command]
pub async fn get_champion_meta(
    key: u32,
    state: State<'_, DdragonState>,
) -> Result<Option<ChampionMeta>, String> {
    let guard = state.data.read().await;
    Ok(guard
        .as_ref()
        .and_then(|data| data.champions.by_key(key).cloned()))
}

/// Resolves an item icon to an on-disk path, downloading it lazily on a cache miss.
/// Returns `Ok(None)` if DDragon data has not loaded or the item is unknown.
#[tauri::command]
pub async fn get_item_icon(
    id: u32,
    state: State<'_, DdragonState>,
) -> Result<Option<String>, String> {
    resolve_icon(&state, IconKind::Item, |data| {
        data.items.get(&id).map(|item| item.image.clone())
    })
    .await
}

/// Resolves a champion icon to an on-disk path, downloading it lazily on a cache miss.
/// Returns `Ok(None)` if DDragon data has not loaded or the champion is unknown.
#[tauri::command]
pub async fn get_champion_icon(
    key: u32,
    state: State<'_, DdragonState>,
) -> Result<Option<String>, String> {
    resolve_icon(&state, IconKind::Champion, |data| {
        data.champions.by_key(key).map(|champ| champ.image.clone())
    })
    .await
}

/// Resolves a champion icon by display name (e.g. "Ahri", "Wukong"). The frontend only has names
/// — the live payload and engine `Recommendation` carry champion names, not keys — so this is the
/// lookup the header and enemy threat board actually use. Returns `Ok(None)` if DDragon data has
/// not loaded or the name is unknown.
#[tauri::command]
pub async fn get_champion_icon_by_name(
    name: String,
    state: State<'_, DdragonState>,
) -> Result<Option<String>, String> {
    resolve_icon(&state, IconKind::Champion, |data| {
        data.champions
            .by_name(&name)
            .map(|champ| champ.image.clone())
    })
    .await
}

/// Shared body for the icon commands: pick the icon filename + patch from loaded state (releasing
/// the read lock before any network I/O), then resolve it to a cached path.
async fn resolve_icon(
    state: &DdragonState,
    kind: IconKind,
    pick_file: impl FnOnce(&ResolvedData) -> Option<String>,
) -> Result<Option<String>, String> {
    let Some((version, file)) = ({
        let guard = state.data.read().await;
        guard
            .as_ref()
            .and_then(|data| pick_file(data).map(|file| (data.version.clone(), file)))
    }) else {
        return Ok(None);
    };

    let cache = DdragonCache::new(state.cache_root.clone());
    let fetcher = DdragonFetcher::new().map_err(|err| err.to_string())?;
    let path = ddragon::icons::resolve_icon(&cache, &fetcher, &version, kind, &file, true)
        .await
        .map_err(|err| err.to_string())?;
    Ok(path.map(|p| p.to_string_lossy().into_owned()))
}

/// Ensures the DDragon cache is current, stores the resolved data in app state, and emits the
/// `ddragon-status` lifecycle (`checking → updating? → ready | offline`).
///
/// This only runs at startup or on explicit refresh — never during a game (PROJECT_SPEC §3.2).
/// It never returns an error or panics: every failure path degrades to `offline` so the app keeps
/// running.
pub async fn refresh_ddragon<R: Runtime>(app: &AppHandle<R>, force: bool) -> DdragonStatus {
    let state = app.state::<DdragonState>();
    let cache = DdragonCache::new(state.cache_root.clone());

    // The locale comes from settings when they're managed (always, in production), else the default.
    // Keeping a fallback lets the startup bootstrap run before/without managed settings in tests.
    let locale = app
        .try_state::<SettingsState>()
        .map(|s| s.current().locale)
        .unwrap_or_else(|| DEFAULT_LOCALE.to_string());

    let _ = app.emit("ddragon-status", DdragonStatus::Checking);

    let fetcher = match DdragonFetcher::new() {
        Ok(fetcher) => fetcher,
        Err(err) => {
            log::error!("DDragon: HTTP client init failed: {err}");
            return degrade_to_cache(app, &cache, &state).await;
        }
    };

    let on_updating = || {
        let _ = app.emit("ddragon-status", DdragonStatus::Updating);
    };

    match ddragon::ensure_up_to_date(&cache, &fetcher, force, &locale, on_updating).await {
        Ok((data, outcome)) => {
            log::info!(
                "DDragon {} (patch {}, {} items, {} champions)",
                outcome_label(&outcome),
                data.version,
                data.items.len(),
                data.champions.count()
            );
            let status = match outcome {
                LoadOutcome::Offline => DdragonStatus::Offline,
                LoadOutcome::Updated | LoadOutcome::UpToDate => DdragonStatus::Ready,
            };
            *state.data.write().await = Some(data);
            let _ = app.emit("ddragon-status", status);
            status
        }
        Err(err) => {
            log::error!("DDragon: unavailable and no usable cache ({err})");
            let _ = app.emit("ddragon-status", DdragonStatus::Offline);
            DdragonStatus::Offline
        }
    }
}

fn outcome_label(outcome: &LoadOutcome) -> &'static str {
    match outcome {
        LoadOutcome::Updated => "updated",
        LoadOutcome::UpToDate => "up to date",
        LoadOutcome::Offline => "offline (cached)",
    }
}

/// Best-effort fallback used only when the HTTP client itself can't be built: serve cached data if
/// present, then emit `offline`. Never errors.
async fn degrade_to_cache<R: Runtime>(
    app: &AppHandle<R>,
    cache: &DdragonCache,
    state: &DdragonState,
) -> DdragonStatus {
    match ddragon::load_from_cache(cache) {
        Ok(data) => {
            log::warn!("DDragon degraded; serving cached patch {}", data.version);
            *state.data.write().await = Some(data);
        }
        Err(err) => log::error!("DDragon degraded and no cached data available ({err})"),
    }
    let _ = app.emit("ddragon-status", DdragonStatus::Offline);
    DdragonStatus::Offline
}
