//! Read-only game discovery. Native code owns paths; the frontend receives opaque
//! pack tokens and bounded bytes, and uses the engine's canonical PAK validator.
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pack {
    pub token: String,
    pub game: String,
    pub name: String,
    pub path: PathBuf,
    pub bytes: u64,
    pub modified: String,
    /// A loose game file beside the packs (LOOSE_FILES), not a pack: the frontend mounts these as one pack under
    /// the game's own packs, as Quake searches a game folder after its packs.
    pub loose: bool,
}
/// A folder found in the library that no known game names (`mod_<folder>`). Its contents are validated as an add-on
/// over Quake by the frontend; a folder found only by its box art has no packs and cannot become playable from art.
#[derive(Clone, Serialize, Debug, PartialEq)]
pub struct Discovered {
    pub id: String,
    pub name: String,
}
#[derive(Clone, Serialize, Default)]
pub struct Library {
    pub root: PathBuf,
    pub packs: Vec<Pack>,
    /// Optional box faces from the same selected game directory as its packs. These exact canonical paths are
    /// exposed only for shelf images; they are never archives, loose game files, or evidence that a game can start.
    pub artwork: BTreeMap<String, BTreeMap<String, PathBuf>>,
    /// Folders found by game contents or box art, not by a known name (any game files are in `packs` under their ids).
    pub discovered: Vec<Discovered>,
    pub error: Option<String>,
}
#[derive(Serialize, Deserialize)]
pub struct Settings {
    pub root: PathBuf,
}
pub const GAMES: &[(&str, &[&str])] = &[
    ("quake", &["id1", "Quake"]),
    ("shareware", &["shareware", "Quake shareware"]),
    ("hipnotic", &["hipnotic", "Scourge of Armagon"]),
    ("rogue", &["rogue", "Dissolution of Eternity"]),
    ("dopa", &["dopa", "Dimension of the Past"]),
    ("mg1", &["mg1", "Dimension of the Machine"]),
    ("ad", &["ad", "Arcane Dimensions"]),
    ("quoth", &["quoth"]),
    ("malice", &["malice"]),
    ("xmen", &["xmen", "X-Men"]),
    ("aopfm_v2", &["aopfm_v2", "Abyss of Pandemonium"]),
    ("soe", &["soe", "Soul of Evil"]),
];
/// The loose files Quake reads from a game folder that add-ons ship outside their packs (X-Men's progs.dat, Malice's
/// autoexec.cfg, Arcane Dimensions' quake.rc; docs/add-ons-2026-10-13.md). The same list as the source build's
/// (GAME_CATALOGUE_LOOSE_FILES, src/engine/common/game_catalogue.js); config.cfg is not read: the port keeps its own
/// settings. Listed only for add-ons (ADDONS): a player's own autoexec.cfg beside Quake is not part of any game.
pub const LOOSE_FILES: &[&str] = &["progs.dat", "autoexec.cfg", "quake.rc"];
/// The add-ons among GAMES (game_catalogue.js kind 'addon'): only they get loose files.
pub const ADDONS: &[&str] = &["ad", "quoth", "malice", "xmen", "aopfm_v2", "soe"];
/// Names of games the catalogue lists but cannot play yet (game_catalogue.js `placeholder`): a folder so named is not
/// discovered as an add-on, so it cannot start around the placeholder.
pub const PLACEHOLDERS: &[&str] = &["Dawn of the Machine", "dawn"];
/// Existing folders whose boxes have shipped defaults (GAME_BOXES in newer/ui/game_shelf.js), even when the user
/// has no local faces. This is shelf metadata only: these names do not add game files or engine compatibility.
pub const BOXED_FOLDERS: &[&str] = &["Hexen 2", "Hexen 2 Portal of Praevus", "Quaked", "Hexen 2 Shareware", "Alkaline", "Tremor"];
/// At most this many bytes for a loose file.
const LOOSE_LIMIT: u64 = 64 << 20;
const BOX_IMAGE_LIMIT: u64 = 16 << 20;
// Match GameShelf_ReadFolder's supported image types. Extension order breaks ties within one stem; canonical
// face names always win over their aliases, independently of the filesystem's directory enumeration order.
const BOX_IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif", "avif"];
fn children(path: &Path) -> Result<BTreeMap<String, PathBuf>, String> {
    let mut out = BTreeMap::new();
    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if out.insert(name.clone(), entry.path()).is_some() {
            return Err(format!("Ambiguous names differing only in case: {name}"));
        }
    }
    Ok(out)
}

fn list_artwork(dir: &Path, root: &Path) -> BTreeMap<String, PathBuf> {
    let mut artwork = BTreeMap::new();
    let Ok(entries) = children(dir) else {
        return artwork;
    };
    'faces: for (face, stems) in [
        ("front", &["front", "cover"][..]),
        ("back", &["back"][..]),
        ("spine", &["spine", "side"][..]),
    ] {
        for stem in stems {
            for extension in BOX_IMAGE_EXTENSIONS {
                let Some(path) = entries.get(&format!("{stem}.{extension}")) else { continue };
                let Ok(path) = path.canonicalize() else { continue };
                let Ok(meta) = fs::metadata(&path) else { continue };
                if !path.starts_with(root) || !meta.is_file() || meta.len() == 0 || meta.len() > BOX_IMAGE_LIMIT {
                    continue;
                }
                artwork.insert(face.to_string(), path);
                continue 'faces;
            }
        }
    }
    artwork
}
/// Lists one game folder's packs (pak0.. up to the first gap; pak5 only to detect the engine's bounded-set overflow)
/// and, for an add-on, its loose game files. Returns None when the folder is not a game: no pak0.pak, and (for an
/// add-on) no loose progs.dat either.
fn list_game(dir: &Path, game: &str, root: &Path, addon: bool) -> Result<Option<Vec<Pack>>, String> {
    let entries = children(dir)?;
    if !entries.contains_key("pak0.pak") && !(addon && entries.contains_key("progs.dat")) {
        return Ok(None);
    }
    let mut packs = Vec::new();
    for n in 0..=5 {
        let name = format!("pak{n}.pak");
        let Some(path) = entries.get(&name) else {
            break;
        };
        let path = path.canonicalize().map_err(|e| e.to_string())?;
        if !path.starts_with(root) {
            return Err("Game archive escapes selected location".into());
        }
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        if !meta.is_file() {
            return Err("Game archive is not a file".into());
        }
        packs.push(Pack {
            token: format!("{game}/{name}"),
            game: game.to_string(),
            name,
            path,
            bytes: meta.len(),
            modified: format!("{:?}", meta.modified().map_err(|e| e.to_string())?),
            loose: false,
        });
    }
    // optional: a loose file that cannot be read, resolves outside the library (as for packs) or is too large is
    // left out, never an error
    for name in LOOSE_FILES.iter().filter(|_| addon) {
        let Some(path) = entries.get(*name) else {
            continue;
        };
        let Ok(path) = path.canonicalize() else {
            continue;
        };
        let Ok(meta) = fs::metadata(&path) else {
            continue;
        };
        let Ok(modified) = meta.modified() else {
            continue;
        };
        if !path.starts_with(root) || !meta.is_file() || meta.len() > LOOSE_LIMIT {
            continue;
        }
        packs.push(Pack {
            token: format!("{game}/{name}"),
            game: game.to_string(),
            name: name.to_string(),
            path,
            bytes: meta.len(),
            modified: format!("{modified:?}"),
            loose: true,
        });
    }
    Ok(Some(packs))
}

/// A discovered add-on's id: `mod_` and its folder name in lower case, other characters as `_` (so it is safe in a
/// token, a URL and a storage key), `mod_addon` when nothing is left; a second folder with the same id gets `_2`, and
/// so on. The same as the source build's (GameCatalogue_DiscoveredId, src/engine/common/game_catalogue.js).
fn discovered_id(folder: &str, taken: &[String]) -> String {
    let slug: String = folder.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
    let slug = slug.trim_matches('_');
    // a name with no ASCII letter or digit (such as one in another script) still gets a usable id
    let base = format!("mod_{}", if slug.is_empty() { "addon" } else { slug });
    let mut id = base.clone();
    let mut n = 2;
    while taken.contains(&id) {
        id = format!("{base}_{n}");
        n += 1;
    }
    id
}

pub fn scan(root: &Path) -> Result<Library, String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("Game location unavailable: {e}"))?;
    let top = children(&root)?;
    let mut packs = Vec::new();
    let mut artwork = BTreeMap::new();
    for (game, aliases) in GAMES {
        let mut candidates = Vec::new();
        if aliases.iter().any(|a| {
            root.file_name()
                .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case(a))
        }) {
            candidates.push(root.clone());
        }
        for alias in *aliases {
            if let Some(path) = top.get(&alias.to_lowercase()) {
                candidates.push(path.clone());
            }
        }
        for dir in candidates {
            let dir = dir.canonicalize().map_err(|e| e.to_string())?;
            if !dir.starts_with(&root) || !dir.is_dir() {
                continue;
            }
            if let Some(found) = list_game(&dir, game, &root, ADDONS.contains(game))? {
                packs.extend(found);
                let faces = list_artwork(&dir, &root);
                if !faces.is_empty() {
                    artwork.insert(game.to_string(), faces);
                }
                break;
            }
        }
    }
    // Any other folder holding a pak0.pak or a progs.dat is an add-on too (docs/add-ons-2026-10-13.md: the engine
    // loads what a player adds without its own entry), named from its folder. A folder with only recognized box art
    // or an existing folder with a shipped default box (BOXED_FOLDERS), is shown too, but has no pack tokens: the
    // frontend's existing content validation keeps it unplayable. This does not recurse into nested game data or
    // imply support for another engine. A folder that cannot be read,
    // or resolves outside the library, is skipped: one odd folder never hides the others.
    let known: Vec<String> = GAMES
        .iter()
        .flat_map(|(_, aliases)| aliases.iter())
        .chain(PLACEHOLDERS.iter())
        .map(|a| a.to_lowercase())
        .collect();
    let mut discovered: Vec<Discovered> = Vec::new();
    for (lower, path) in &top {
        if lower.starts_with('.') || known.contains(lower) {
            continue;
        }
        let Ok(dir) = path.canonicalize() else {
            continue;
        };
        if !dir.starts_with(&root) || !dir.is_dir() {
            continue;
        }
        let folder = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let taken: Vec<String> = discovered.iter().map(|d| d.id.clone()).collect();
        let id = discovered_id(&folder, &taken);
        let Ok(found) = list_game(&dir, &id, &root, true) else {
            continue;
        };
        let faces = list_artwork(&dir, &root);
        if found.is_none() && faces.is_empty() && !BOXED_FOLDERS.iter().any(|name| name.eq_ignore_ascii_case(lower)) {
            continue;
        }
        if let Some(found) = found {
            packs.extend(found);
        }
        if !faces.is_empty() {
            artwork.insert(id.clone(), faces);
        }
        discovered.push(Discovered { id, name: folder });
    }
    Ok(Library {
        root,
        packs,
        artwork,
        discovered,
        error: None,
    })
}
pub fn read_range(
    library: &Library,
    token: &str,
    offset: u64,
    length: usize,
) -> Result<Vec<u8>, String> {
    if length > 131072 {
        return Err("Read exceeds PAK directory bound".into());
    }
    let pack = library
        .packs
        .iter()
        .find(|p| p.token == token)
        .ok_or("Unknown archive token")?;
    let path = pack.path.canonicalize().map_err(|e| e.to_string())?;
    if path != pack.path || !path.starts_with(&library.root) {
        return Err("Archive location changed".into());
    }
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if meta.len() != pack.bytes
        || format!("{:?}", meta.modified().map_err(|e| e.to_string())?) != pack.modified
    {
        return Err("Archive changed; refresh the game library".into());
    }
    if offset > pack.bytes {
        return Err("Range outside archive".into());
    }
    let size = (pack.bytes - offset).min(length as u64) as usize;
    let mut bytes = vec![0; size];
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| e.to_string())?;
    file.read_exact(&mut bytes).map_err(|e| e.to_string())?;
    Ok(bytes)
}
