//! Tauri commands exposed to the frontend (FE→Rust half of the contract, PROJECT_SPEC §4.2),
//! plus the DDragon bootstrap that drives the `ddragon-status` event.

use crate::ddragon::{
    self, cache::DdragonCache, fetch::DdragonFetcher, icons::IconKind, LoadOutcome, ResolvedData,
};
use crate::model::{ChampionMeta, ConnectionStatus, DdragonStatus};
use crate::state::DdragonState;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

/// Returns the current connection / coaching status.
///
/// M0 stub: always [`ConnectionStatus::NoGame`]. The Live Client poller (M2) will drive this
/// from real game state.
#[tauri::command]
pub fn get_status() -> ConnectionStatus {
    ConnectionStatus::NoGame
}

/// Re-runs the DDragon bootstrap, forcing a re-download even if the cached patch looks current.
/// Returns the terminal status (`ready` or `offline`).
#[tauri::command]
pub async fn force_refresh_ddragon(app: AppHandle) -> DdragonStatus {
    refresh_ddragon(&app, true).await
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

    match ddragon::ensure_up_to_date(&cache, &fetcher, force, on_updating).await {
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
