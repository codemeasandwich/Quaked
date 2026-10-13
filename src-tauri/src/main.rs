#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod lan;
mod library;
mod packs;
#[cfg(target_os = "macos")]
mod pointer_lock;
use library::{Library, Settings};
use std::{fs, path::PathBuf, sync::Mutex};
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
/// Downloads, verifies and unpacks the per-game data packs a game needs (packs.rs), reporting
/// `packs-progress` events; returns the folder of unpacked assets in the app data folder.
#[tauri::command]
async fn packs_ensure(app: tauri::AppHandle, base: String, packs: Vec<packs::Pack>) -> Result<PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?.join("packs");
    let events = app.clone();
    let assets = tauri::async_runtime::spawn_blocking(move || {
        packs::ensure(&root, &base, &packs, &mut |progress| {
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
   Err(error)=>return Ok(Library{root:PathBuf::new(),packs:vec![],error:Some(format!("Saved game location could not be read: {error}. Select Game Locations to recover."))})
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
        error: Some(error),
    });
    let state = app.state::<State>();
    let mut current = state.library.lock().map_err(|e| e.to_string())?;
    // Scope is populated only with exact discovered paths. Location changes restart
    // the host below, clearing the old process's permissions before the next scan.
    for pack in &current.packs {
        if !next.packs.iter().any(|p| p.path == pack.path) {
            app.asset_protocol_scope()
                .forbid_file(&pack.path)
                .map_err(|e| e.to_string())?;
        }
    }
    if next
        .packs
        .iter()
        .any(|p| app.asset_protocol_scope().is_forbidden(&p.path))
    {
        app.restart();
    }
    for pack in &next.packs {
        app.asset_protocol_scope()
            .allow_file(&pack.path)
            .map_err(|e| e.to_string())?;
    }
    *current = next.clone();
    Ok(next)
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
                window.with_webview(|webview| {
                    if !pointer_lock::allow(webview.inner()) {
                        eprintln!("Quaked: pointer lock could not be enabled; mouse look stays off");
                    }
                })?;
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
