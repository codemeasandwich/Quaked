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
