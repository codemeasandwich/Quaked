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
#[derive(Clone, Serialize, Default)]
pub struct Library {
    pub root: PathBuf,
    pub packs: Vec<Pack>,
    pub error: Option<String>,
}
#[derive(Serialize, Deserialize)]
pub struct Settings {
    pub root: PathBuf,
}
pub const GAMES: &[(&str, &[&str])] = &[
    ("quake", &["id1", "Quake"]),
    ("shareware", &["shareware"]),
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
/// At most this many bytes for a loose file.
const LOOSE_LIMIT: u64 = 64 << 20;
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
pub fn scan(root: &Path) -> Result<Library, String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("Game location unavailable: {e}"))?;
    let top = children(&root)?;
    let mut packs = Vec::new();
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
            let entries = children(&dir)?;
            if !entries.contains_key("pak0.pak") {
                continue;
            }
            // Include pak5 only to detect the engine's bounded-set overflow. Gaps end a set.
            for n in 0..=5 {
                let name = format!("pak{n}.pak");
                let Some(path) = entries.get(&name) else {
                    break;
                };
                let path = path.canonicalize().map_err(|e| e.to_string())?;
                if !path.starts_with(&root) {
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
            for name in LOOSE_FILES.iter().filter(|_| ADDONS.contains(game)) {
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
                if !path.starts_with(&root) || !meta.is_file() || meta.len() > LOOSE_LIMIT {
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
            break;
        }
    }
    Ok(Library {
        root,
        packs,
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
