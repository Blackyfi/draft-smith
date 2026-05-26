//! Tauri commands exposed to the frontend (FE→Rust half of the contract, PROJECT_SPEC §4.2),
//! plus the DDragon bootstrap that drives the `ddragon-status` event.

use crate::ddragon::{
    self, cache::DdragonCache, fetch::DdragonFetcher, icons::IconKind, LoadOutcome, ResolvedData,
};
use crate::meta::{self, cache::MetaCache, fetch::MetaFetcher};
use crate::model::settings::DEFAULT_LOCALE;
use crate::model::{
    ChampionMeta, ConnectionStatus, DdragonStatus, MetaBuild, Recommendation, Settings,
};
use crate::state::{DdragonState, LiveState, MetaState, SettingsState};
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

/// The app changelog, embedded at compile time (Markdown). Surfaced in-app via Settings → What's
/// new, so the user can read version history without leaving DraftSmith.
const CHANGELOG_MD: &str = include_str!("../../CHANGELOG.md");

/// Returns the bundled changelog (Markdown source) for the in-app "What's new" view.
#[tauri::command]
pub fn get_changelog() -> &'static str {
    CHANGELOG_MD
}

/// The installed application version (from `tauri.conf.json`), e.g. "0.1.3". Shown in Settings.
#[tauri::command]
pub fn get_app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// An available update, as surfaced to the frontend by [`check_for_update`].
/// Mirrors `UpdateInfo` in `src/types.ts`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    /// The version offered by the release endpoint (e.g. "0.1.4").
    pub version: String,
    /// The version currently installed (e.g. "0.1.3").
    pub current_version: String,
}

/// Checks the GitHub Releases endpoint for a newer version. `Ok(None)` means up to date; `Err`
/// means the check couldn't complete (offline, no published release yet, etc.). Desktop-only — the
/// updater plugin isn't built on mobile, where stores handle updates.
#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    #[cfg(desktop)]
    {
        crate::updater::check_update(&app)
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        Ok(None)
    }
}

/// Downloads + installs the available update (verified against the embedded minisign key) and
/// relaunches. Advisory: the frontend only calls this after the user clicks "Update now".
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        crate::updater::install_update(&app)
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        Err("In-app updates are desktop-only.".into())
    }
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

/// Resolves a champion icon by the string the FE has — which is the Live Client's `championName`,
/// i.e. the DDragon **id** ("Ahri", "Kaisa", "MonkeyKing"), though a real display name resolves
/// too (see [`ChampionIndex::by_name_or_id`]). This is the lookup the header and enemy threat
/// board use. Returns `Ok(None)` if DDragon data has not loaded or the champion is unknown.
#[tauri::command]
pub async fn get_champion_icon_by_name(
    name: String,
    state: State<'_, DdragonState>,
) -> Result<Option<String>, String> {
    resolve_icon(&state, IconKind::Champion, |data| {
        data.champions
            .by_name_or_id(&name)
            .map(|champ| champ.image.clone())
    })
    .await
}

/// Resolves a champion's human display name (e.g. "Kai'Sa", "Lee Sin", "Wukong") from the
/// id-or-name the live payload carries (e.g. "Kaisa", "LeeSin", "MonkeyKing"). Lets the FE show a
/// friendly label instead of the raw Live Client id. Returns `Ok(None)` if DDragon data has not
/// loaded or the champion is unknown, so the caller can fall back to the raw string.
#[tauri::command]
pub async fn get_champion_display_name(
    name: String,
    state: State<'_, DdragonState>,
) -> Result<Option<String>, String> {
    let guard = state.data.read().await;
    Ok(guard
        .as_ref()
        .and_then(|data| data.champions.by_name_or_id(&name).map(|c| c.name.clone())))
}

/// Returns the "Tier B" meta build (highest-win-rate u.gg build) for a champion, role, and rank.
///
/// `champion` is the DDragon id the Live Client passes (e.g. "Ahri", "Kaisa"); `role` is a friendly
/// name ("top"|"jungle"|"mid"|"adc"|"support") or `None` for the champion's primary (most-played)
/// role; `rank` is a friendly rank key ("diamond_plus", "platinum_plus", "challenger", …) with
/// Diamond+ as the fallback for an unknown value.
///
/// One fetched overview JSON covers every role/rank, so this fetches + caches at most **once per
/// champion + patch**; a warm cache does no network (CLAUDE.md #6, "no repeated fetch mid-game").
/// Returns `Ok(None)` when DDragon hasn't loaded, the champion is unknown, or u.gg has no data for
/// the requested role/rank; `Err` only for a genuine fetch/parse failure.
#[tauri::command]
pub async fn get_meta_build(
    champion: String,
    role: Option<String>,
    rank: String,
    ddragon: State<'_, DdragonState>,
    meta_state: State<'_, MetaState>,
) -> Result<Option<MetaBuild>, String> {
    // Snapshot the resolved DDragon data (clone, then release the read lock before any network).
    let Some(data) = ddragon.data.read().await.clone() else {
        return Ok(None);
    };

    let cache = MetaCache::new(meta_state.cache_root.clone());
    let fetcher = MetaFetcher::new().map_err(|err| err.to_string())?;

    meta::build_for(&cache, &fetcher, &data, &champion, role.as_deref(), &rank)
        .await
        .map_err(|err| err.to_string())
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
