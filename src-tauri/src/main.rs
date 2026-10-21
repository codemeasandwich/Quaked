#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod lan;
mod library;
mod packs;
#[cfg(target_os = "macos")]
mod pointer_lock;
#[cfg(target_os = "macos")]
mod gyro;
#[cfg(target_os = "macos")]
mod gyro_hid;
use library::{Library, Settings};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
struct State {
    library: Mutex<Library>,
}
#[tauri::command]
async fn lan_host(
    state: tauri::State<'_, lan::Lan>,
    fingerprint: String,
    port: u16,
) -> Result<String, String> {
    let network = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        network.host(&format!("0.0.0.0:{port}"), fingerprint)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn lan_join(
    state: tauri::State<'_, lan::Lan>,
    fingerprint: String,
    address: String,
    peer: String,
) -> Result<(), String> {
    let network = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || network.join(&address, &fingerprint, &peer))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn lan_send(
    state: tauri::State<'_, lan::Lan>,
    message: serde_json::Value,
) -> Result<(), String> {
    let network = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || network.send(message))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
fn lan_poll(state: tauri::State<lan::Lan>) -> Result<Vec<serde_json::Value>, String> {
    state.poll()
}
#[tauri::command]
async fn lan_stop(state: tauri::State<'_, lan::Lan>) -> Result<(), String> {
    let network = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || network.stop())
        .await
        .map_err(|e| e.to_string())
}
/// The writable shared data cache: `QUAKED_DATA_DIR` for trials, else `~/quaked/.data`.
/// The game shelf ignores dot-directories, so `.data` never appears as a game.
fn data_cache(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("QUAKED_DATA_DIR") {
        let path = PathBuf::from(dir);
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        return Ok(path);
    }
    let path = app
        .path()
        .home_dir()
        .map_err(|e| e.to_string())?
        .join("quaked")
        .join(".data");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}

/// A read-only `data/` directory beside `Quaked.app`, for a downloaded app + data folder.
/// Finder launches with `/` as the working directory, so the bundle path is used instead.
/// A quarantined app may be translocated to a random read-only path; in that case the
/// original download folder is unknown here, so the user cache is used.
fn same_dir_data() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    if exe.to_string_lossy().contains("/AppTranslocation/") {
        return None;
    }
    let mut current = exe.parent()?;
    loop {
        if current.extension().and_then(|value| value.to_str()) == Some("app") {
            let parent = current.parent()?;
            // The assembled build keeps the app's per-game packs in app-data/ and the
            // HTML's shareware-only data in data/. Prefer the app packs; a legacy folder
            // with parts at data/ still works.
            for name in ["app-data", "data"] {
                let data = parent.join(name);
                if data.is_dir() {
                    return Some(data);
                }
            }
            return None;
        }
        current = current.parent()?;
    }
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let path = entry.path();
        let target = to.join(entry.file_name());
        if path.is_dir() {
            copy_dir(&path, &target)?;
        } else {
            fs::copy(&path, &target)?;
        }
    }
    Ok(())
}

/// Carries the old `app_data_dir()/packs/assets` cache into `~/quaked/.data` once, so an
/// upgrade does not re-download data the user already has. A rename is used when possible.
fn migrate_old_cache(app: &tauri::AppHandle, cache: &Path) -> Result<(), String> {
    let new = cache.join("assets");
    let has_new = fs::read_dir(&new)
        .map(|mut dir| dir.next().is_some())
        .unwrap_or(false);
    if has_new {
        return Ok(());
    }
    let old = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("packs")
        .join("assets");
    if !old.is_dir() {
        return Ok(());
    }
    if new.is_dir() {
        fs::remove_dir(&new).map_err(|e| e.to_string())?;
    }
    if fs::rename(&old, &new).is_ok() {
        return Ok(());
    }
    copy_dir(&old, &new).map_err(|e| e.to_string())
}

/// Downloads, verifies and unpacks the per-game data packs a game needs (packs.rs), reporting
/// `packs-progress` events. Parts are read from a `data/` directory beside the app when one
/// exists, downloaded into `~/quaked/.data/` otherwise, and kept there for later builds and
/// for the HTML copy. Returns the folder of unpacked assets.
#[tauri::command]
async fn packs_ensure(
    app: tauri::AppHandle,
    base: String,
    packs: Vec<packs::Pack>,
) -> Result<PathBuf, String> {
    let cache = data_cache(&app)?;
    migrate_old_cache(&app, &cache)?;
    let source = same_dir_data().unwrap_or_else(|| cache.clone());
    let events = app.clone();
    let assets = tauri::async_runtime::spawn_blocking(move || {
        packs::ensure_from(&source, &cache, &base, &packs, &mut |progress| {
            let _ = events.emit("packs-progress", progress);
        })
    })
    .await
    .map_err(|e| e.to_string())??;
    // Only the verified, content-named asset files: the parts folder stays out of the scope.
    app.asset_protocol_scope()
        .allow_directory(&assets, false)
        .map_err(|e| e.to_string())?;
    Ok(assets)
}
#[tauri::command]
fn distribution_resources(app: tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("assets"))
}
fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("library.json"))
}
fn refresh(app: &tauri::AppHandle) -> Result<Library, String> {
    let settings = settings_path(app)?;
    let root = if settings.exists() {
        match fs::read(settings).map_err(|e|e.to_string()).and_then(|bytes|serde_json::from_slice::<Settings>(&bytes).map_err(|e|e.to_string())){
   Ok(settings)=>settings.root,
   Err(error)=>return Ok(Library{root:PathBuf::new(),packs:vec![],discovered:vec![],artwork:Default::default(),error:Some(format!("Saved game location could not be read: {error}. Select Game Locations to recover."))})
  }
    } else {
        let root = app
            .path()
            .home_dir()
            .map_err(|e| e.to_string())?
            .join("quaked");
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        root
    };
    let next = library::scan(&root).unwrap_or_else(|error| Library {
        root,
        packs: vec![],
        discovered: vec![],
        artwork: Default::default(),
        error: Some(error),
    });
    let state = app.state::<State>();
    let mut current = state.library.lock().map_err(|e| e.to_string())?;
    // Scope is populated only with exact discovered paths. Location changes restart
    // the host below, clearing the old process's permissions before the next scan.
    let current_paths = current.packs.iter().map(|p| &p.path)
        .chain(current.artwork.values().flat_map(|faces| faces.values()));
    let next_paths: Vec<_> = next.packs.iter().map(|p| &p.path)
        .chain(next.artwork.values().flat_map(|faces| faces.values())).collect();
    for path in current_paths {
        if !next_paths.contains(&path) {
            app.asset_protocol_scope()
                .forbid_file(path)
                .map_err(|e| e.to_string())?;
        }
    }
    if next_paths.iter().any(|path| app.asset_protocol_scope().is_forbidden(path))
    {
        app.restart();
    }
    for path in next_paths {
        app.asset_protocol_scope()
            .allow_file(path)
            .map_err(|e| e.to_string())?;
    }
    *current = next.clone();
    Ok(next)
}
/// Frontend diagnostics for the native Hexen II path: appends one line to `hexen2-trace.log` in the app data dir.
/// Screen capture and UI automation are unavailable on the trial host, so this is the readable trace.
/// Trial only: an edition id from `HEXEN2_TRIAL_GAME`, so a packaged Hexen run can be started without UI automation.
#[tauri::command]
fn trial_game() -> Option<String> {
    std::env::var("HEXEN2_TRIAL_GAME").ok()
}

/// Trial only: scripted look/move/attack input for a packaged run (`HEXEN2_TRIAL_AUTOPLAY=1`).
#[tauri::command]
fn trial_autoplay() -> bool {
    std::env::var("HEXEN2_TRIAL_AUTOPLAY").as_deref() == Ok("1")
}

/// Trial only: run the packaged pause-menu Save/Load probe.
#[tauri::command]
fn trial_save() -> bool {
    std::env::var("HEXEN2_TRIAL_SAVE").as_deref() == Ok("1")
}

/// Trial only: the base class an autostarted packaged run uses (`HEXEN2_TRIAL_CLASS`), so all four can be exercised
/// without UI automation. The frontend still validates it through the normal start gate.
#[tauri::command]
fn trial_class() -> Option<String> {
    std::env::var("HEXEN2_TRIAL_CLASS").ok()
}

#[tauri::command]
fn hexen_log(app: tauri::AppHandle, text: String) {
    let dir = app.path().app_data_dir().ok();
    if let Some(dir) = dir {
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("hexen2-trace.log");
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(path)
        {
            use std::io::Write;
            let _ = writeln!(file, "{:?} {}", std::time::SystemTime::now(), text);
        }
    }
}

#[tauri::command]
fn library_scan(app: tauri::AppHandle) -> Result<Library, String> {
    refresh(&app)
}
#[tauri::command]
fn library_read(
    state: tauri::State<State>,
    token: String,
    offset: u64,
    length: usize,
) -> Result<tauri::ipc::Response, String> {
    let library = state.library.lock().map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(library::read_range(
        &library, &token, offset, length,
    )?))
}
#[tauri::command]
async fn library_choose(app: tauri::AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(picked) = app
            .dialog()
            .file()
            .set_title("Select Game Locations")
            .blocking_pick_folder()
        else {
            return Ok(false);
        };
        let root = picked
            .into_path()
            .map_err(|e| e.to_string())?
            .canonicalize()
            .map_err(|e| e.to_string())?;
        library::scan(&root)?;
        let path = settings_path(&app)?;
        fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        let temp = path.with_extension("json.tmp");
        fs::write(
            &temp,
            serde_json::to_vec(&Settings { root }).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        fs::rename(temp, path).map_err(|e| e.to_string())?;
        app.restart()
    })
    .await
    .map_err(|e| e.to_string())?
}
fn main() {
    tauri::Builder::default()
        .manage(State::default())
        .manage(lan::Lan::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            trial_game,
            trial_autoplay,
            trial_class,
            trial_save,
            hexen_log,
            library_scan,
            library_read,
            library_choose,
            distribution_resources,
            packs_ensure,
            lan_host,
            lan_join,
            lan_send,
            lan_poll,
            lan_stop
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            gyro::start(app.handle().clone());
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
            let locations = MenuItem::with_id(
                app,
                "locations",
                "Select Game Locations…",
                true,
                None::<&str>,
            )?;
            let multiplayer =
                MenuItem::with_id(app, "lan", "LAN Multiplayer…", true, None::<&str>)?;
            let submenu = Submenu::with_items(
                app,
                "Quaked",
                true,
                &[
                    &locations,
                    &multiplayer,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?;
            app.set_menu(Menu::with_items(app, &[&submenu])?)?;
            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                let hooked = window.with_webview(|webview| {
                    if !pointer_lock::allow(webview.inner()) {
                        eprintln!(
                            "Quaked: pointer lock could not be enabled; mouse look stays off"
                        );
                    }
                });
                // Mouse look is not worth refusing to start over.
                if let Err(error) = hooked {
                    eprintln!("Quaked: pointer lock not set up ({error}); mouse look stays off");
                }
            }
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "locations" => {
                let _ = app.emit("select-game-location", ());
            }
            "lan" => {
                let _ = app.emit("lan-menu", ());
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("Quaked failed to start");
}
