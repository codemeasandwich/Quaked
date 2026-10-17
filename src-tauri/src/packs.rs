//! Per-game data packs (docs/per-game-packs-design-2026-10-13.md). The app bundles the core
//! assets; every other pack is downloaded when a game needs it, from content-named parts on a
//! GitHub release, verified by SHA-256 and unpacked into one file per asset named by its own
//! SHA-256, so later launches (and later app versions sharing the asset) work offline. Nothing
//! unverified is ever kept under its final name.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Deserialize, Clone, Debug)]
pub struct Part {
    pub file: String,
    pub bytes: u64,
    pub sha256: String,
    /// 0 = needed to open the first level, 1 = actors/weapons, 2 = background.
    /// Older manifests omit it; zero keeps their original order.
    #[serde(default)]
    pub priority: u8,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Asset {
    pub sha256: String,
    pub offset: u64,
    pub length: u64,
    pub ext: String,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Pack {
    pub name: String,
    pub parts: Vec<Part>,
    pub assets: Vec<Asset>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Progress {
    pub pack: String,
    pub phase: &'static str,
    pub done: u64,
    pub total: u64,
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn is_hex64(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// An asset's extension: a dot and 1 to 15 letters or digits (`.webp`, `.gz`, `.part10`).
/// tools/distribution/build.mjs refuses to build a pack with any other.
fn ext_ok(ext: &str) -> bool {
    ext.len() >= 2 && ext.len() <= 16 && ext.starts_with('.') && ext[1..].bytes().all(|b| b.is_ascii_alphanumeric())
}

fn check_names(pack: &Pack) -> Result<(), String> {
    let name_ok = !pack.name.is_empty() && pack.name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_');
    if !name_ok {
        return Err(format!("Invalid pack name {}", pack.name));
    }
    for part in &pack.parts {
        let prefix = format!("{}-", pack.name);
        let stem = part.file.strip_prefix(&prefix).and_then(|rest| rest.strip_suffix(".bin"));
        let stem_ok = stem.is_some_and(|s| s.len() == 16 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
        if !stem_ok || !is_hex64(&part.sha256) {
            return Err(format!("Invalid part {} in pack {}", part.file, pack.name));
        }
    }
    for asset in &pack.assets {
        if !is_hex64(&asset.sha256) || !ext_ok(&asset.ext) {
            return Err(format!("Invalid asset entry in pack {}", pack.name));
        }
    }
    Ok(())
}

/// The pack host: an https URL, or plain http only to this computer (trials), ending in `/`,
/// with no user name or password, judged on the parsed URL rather than its spelling.
/// Returns whether it is https (redirects are then refused unless they stay on https).
fn check_base(base: &str) -> Result<bool, String> {
    let refused = || format!("Pack host must be an https URL ending in /: {base}");
    let url = url::Url::parse(base).map_err(|_| refused())?;
    if !base.ends_with('/') || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
        return Err(refused());
    }
    match (url.scheme(), url.host_str()) {
        ("https", Some(_)) => Ok(true),
        ("http", Some("127.0.0.1" | "localhost")) => Ok(false),
        _ => Err(refused()),
    }
}

fn asset_path(root: &Path, asset: &Asset) -> PathBuf {
    root.join("assets").join(format!("{}{}", asset.sha256, asset.ext))
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1 << 20];
    loop {
        let read = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex(&hasher.finalize()))
}

fn present(root: &Path, asset: &Asset) -> bool {
    fs::metadata(asset_path(root, asset)).map(|m| m.len() == asset.length).unwrap_or(false)
}

/// Whether every asset of the pack is already unpacked (the size is checked; contents were
/// verified when written).
#[cfg(test)]
fn installed(root: &Path, pack: &Pack) -> bool {
    pack.assets.iter().all(|asset| present(root, asset))
}

/// Progress is reported at most once per this many bytes, so a large pack does not flood the page.
const REPORT_BYTES: u64 = 1 << 20;

fn download(agent: &ureq::Agent, base: &str, part: &Part, target: &Path, report: &mut dyn FnMut(u64)) -> Result<(), String> {
    let url = format!("{base}{}", part.file);
    let response = agent.get(&url).call().map_err(|e| e.to_string())?;
    let partial = target.with_extension("partial");
    let result = (|| {
        let mut out = fs::File::create(&partial).map_err(|e| e.to_string())?;
        let mut reader = response.into_reader().take(part.bytes + 1);
        let mut hasher = Sha256::new();
        let mut buffer = vec![0u8; 1 << 20];
        let (mut received, mut unreported) = (0u64, 0u64);
        loop {
            let read = reader.read(&mut buffer).map_err(|e| format!("download of {url} interrupted: {e}"))?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
            out.write_all(&buffer[..read]).map_err(|e| e.to_string())?;
            received += read as u64;
            unreported += read as u64;
            if unreported >= REPORT_BYTES {
                report(unreported);
                unreported = 0;
            }
        }
        report(unreported);
        out.sync_all().map_err(|e| e.to_string())?;
        let digest = hex(&hasher.finalize());
        if received != part.bytes || digest != part.sha256 {
            return Err(format!("{url} failed verification ({received} bytes, sha256 {digest})"));
        }
        Ok(())
    })();
    match result {
        Ok(()) => fs::rename(&partial, target).map_err(|e| e.to_string()),
        Err(error) => {
            let _ = fs::remove_file(&partial);
            Err(error)
        }
    }
}

/// Reads `length` bytes at `offset` of the pack's parts taken end to end.
fn read_range(parts: &[(PathBuf, u64)], offset: u64, length: u64) -> Result<Vec<u8>, String> {
    let mut out = Vec::with_capacity(length as usize);
    let mut start = 0u64;
    for (path, size) in parts {
        let end = start + size;
        if offset + length > start && offset < end {
            let from = offset.max(start) - start;
            let to = (offset + length).min(end) - start;
            let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
            std::io::Seek::seek(&mut file, std::io::SeekFrom::Start(from)).map_err(|e| e.to_string())?;
            let mut chunk = vec![0u8; (to - from) as usize];
            file.read_exact(&mut chunk).map_err(|e| e.to_string())?;
            out.extend_from_slice(&chunk);
        }
        start = end;
    }
    if out.len() as u64 != length {
        return Err("Pack asset lies outside its parts".into());
    }
    Ok(out)
}

/// One download at a time: two windows choosing a game together would otherwise share the
/// same temporary files.
static ENSURE: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn part_ok(path: &Path, part: &Part) -> bool {
    fs::metadata(path).map(|m| m.len() == part.bytes).unwrap_or(false)
        && file_sha256(path).map(|hash| hash == part.sha256).unwrap_or(false)
}

/// Makes sure every listed pack is unpacked under `cache`, reading verified parts from the
/// read-only `source` first and downloading only the parts that neither `source` nor `cache`
/// can supply. Parts stay in `cache/parts` (and `source` is never written), so the same data
/// can be shared with the HTML and reused by a later app version. Returns the unpacked assets.
pub fn ensure_from(source: &Path, cache: &Path, base: &str, packs: &[Pack], progress: &mut dyn FnMut(Progress)) -> Result<PathBuf, String> {
    let https = check_base(base)?;
    for pack in packs {
        check_names(pack)?;
    }
    let _only = ENSURE.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let agent = ureq::AgentBuilder::new().https_only(https).timeout_connect(Duration::from_secs(30)).timeout_read(Duration::from_secs(60)).build();
    fs::create_dir_all(cache.join("assets")).map_err(|e| e.to_string())?;
    fs::create_dir_all(cache.join("parts")).map_err(|e| e.to_string())?;
    for pack in packs {
        let missing: Vec<&Asset> = pack.assets.iter().filter(|asset| !present(cache, asset)).collect();
        if missing.is_empty() {
            progress(Progress { pack: pack.name.clone(), phase: "ready", done: 1, total: 1 });
            continue;
        }
        // The parts whose bytes hold a missing asset; the others are not fetched at all.
        let mut start = 0u64;
        let spans: Vec<(u64, u64)> = pack.parts.iter().map(|part| {
            let span = (start, start + part.bytes);
            start += part.bytes;
            span
        }).collect();
        let needed: Vec<bool> = spans.iter().map(|(from, to)| missing.iter().any(|a| a.offset < *to && a.offset + a.length > *from)).collect();
        let total: u64 = pack.parts.iter().zip(&needed).filter(|(_, n)| **n).map(|(p, _)| p.bytes).sum();
        // Resolve each part from the read-only source first, then the writable cache. Missing
        // parts download into the cache in priority order; the part order itself stays the
        // pack's byte order because asset offsets depend on it.
        let mut paths: Vec<PathBuf> = Vec::with_capacity(pack.parts.len());
        let mut downloads: Vec<usize> = Vec::new();
        for (index, part) in pack.parts.iter().enumerate() {
            // The shared data folder keeps parts at its root; a tests/local cache may use parts/.
            let source_path = if source.join(&part.file).is_file() { source.join(&part.file) } else { source.join("parts").join(&part.file) };
            let cache_path = cache.join("parts").join(&part.file);
            if needed[index] && part_ok(&source_path, part) {
                paths.push(source_path);
            } else if part_ok(&cache_path, part) {
                paths.push(cache_path);
            } else {
                paths.push(cache_path);
                if needed[index] { downloads.push(index); }
            }
        }
        downloads.sort_by_key(|index| pack.parts[*index].priority);
        let mut done = 0u64;
        for index in downloads {
            let part = &pack.parts[index];
            let target = cache.join("parts").join(&part.file);
            let name = pack.name.clone();
            let mut report = |bytes: u64| {
                done += bytes;
                progress(Progress { pack: name.clone(), phase: "download", done, total });
            };
            download(&agent, base, part, &target, &mut report)?;
            if !part_ok(&target, part) {
                return Err(format!("Pack {} part {} failed verification", pack.name, part.file));
            }
        }
        progress(Progress { pack: pack.name.clone(), phase: "download", done: total, total });
        let local_parts: Vec<(PathBuf, u64)> = paths.into_iter().zip(pack.parts.iter()).map(|(path, part)| (path, part.bytes)).collect();
        let count = missing.len() as u64;
        for (index, asset) in missing.iter().enumerate() {
            let target = asset_path(cache, asset);
            if present(cache, asset) {
                continue;
            }
            let bytes = read_range(&local_parts, asset.offset, asset.length)?;
            if hex(&Sha256::digest(&bytes)) != asset.sha256 {
                return Err(format!("Pack {} asset {} failed verification", pack.name, asset.sha256));
            }
            let temp = target.with_extension("unpacking");
            let mut out = fs::File::create(&temp).map_err(|e| e.to_string())?;
            out.write_all(&bytes).and_then(|_| out.sync_all()).map_err(|e| e.to_string())?;
            drop(out);
            fs::rename(&temp, &target).map_err(|e| e.to_string())?;
            progress(Progress { pack: pack.name.clone(), phase: "unpack", done: index as u64 + 1, total: count });
        }
        // Keep the parts: they are the shared data files, and a later app version can reuse
        // every part whose content did not change.
        progress(Progress { pack: pack.name.clone(), phase: "ready", done: 1, total: 1 });
    }
    Ok(cache.join("assets"))
}

/// Backwards-compatible entry point when the read-only source and writable cache are the
/// same directory (unit tests, a local stand-in host).
pub fn ensure(root: &Path, base: &str, packs: &[Pack], progress: &mut dyn FnMut(Progress)) -> Result<PathBuf, String> {
    ensure_from(root, root, base, packs, progress)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    /// A stand-in for the release host: serves the given files once per request and records
    /// which were asked for.
    fn serve(files: HashMap<String, Vec<u8>>) -> (String, Arc<Mutex<Vec<String>>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://127.0.0.1:{}/", listener.local_addr().unwrap().port());
        let asked = Arc::new(Mutex::new(Vec::new()));
        let log = asked.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                let mut line = String::new();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                reader.read_line(&mut line).unwrap();
                loop {
                    let mut header = String::new();
                    if reader.read_line(&mut header).unwrap() == 0 || header == "\r\n" {
                        break;
                    }
                }
                let path = line.split_whitespace().nth(1).unwrap_or("/").trim_start_matches('/').to_string();
                log.lock().unwrap().push(path.clone());
                match files.get(&path) {
                    Some(body) => {
                        let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len());
                        let _ = stream.write_all(body);
                    }
                    None => {
                        let _ = write!(stream, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                    }
                }
            }
        });
        (base, asked)
    }

    fn sha(bytes: &[u8]) -> String {
        hex(&Sha256::digest(bytes))
    }

    /// A pack of three assets in two parts, the middle asset spanning the boundary.
    fn fixture() -> (Pack, HashMap<String, Vec<u8>>, Vec<Vec<u8>>) {
        let assets: Vec<Vec<u8>> = vec![b"first asset".to_vec(), b"second asset spans parts".to_vec(), b"third".to_vec()];
        let body: Vec<u8> = assets.concat();
        let (a, b) = body.split_at(20);
        let mut files = HashMap::new();
        let mut parts = Vec::new();
        for chunk in [a, b] {
            let file = format!("quake-{}.bin", &sha(chunk)[..16]);
            parts.push(Part { file: file.clone(), bytes: chunk.len() as u64, sha256: sha(chunk), priority: 0 });
            files.insert(file, chunk.to_vec());
        }
        let mut offset = 0u64;
        let list = assets
            .iter()
            .map(|bytes| {
                let asset = Asset { sha256: sha(bytes), offset, length: bytes.len() as u64, ext: ".webp".into() };
                offset += bytes.len() as u64;
                asset
            })
            .collect();
        (Pack { name: "quake".into(), parts, assets: list }, files, assets)
    }

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("quaked-packs-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn downloads_verifies_unpacks_and_then_works_offline() {
        let (pack, files, assets) = fixture();
        let (base, asked) = serve(files);
        let root = temp("ok");
        let mut events = Vec::new();
        let dir = ensure(&root, &base, &[pack.clone()], &mut |p| events.push(p)).unwrap();
        for (asset, bytes) in pack.assets.iter().zip(&assets) {
            assert_eq!(&fs::read(dir.join(format!("{}.webp", asset.sha256))).unwrap(), bytes);
        }
        assert_eq!(fs::read_dir(root.join("parts")).unwrap().count(), 2, "parts are retained for later builds and HTML sharing");
        assert_eq!(events.last().unwrap().phase, "ready");
        assert!(events.iter().any(|e| e.phase == "download" && e.done == e.total));
        assert_eq!(asked.lock().unwrap().len(), 2);
        // Offline: an unreachable host is never contacted for a pack already unpacked.
        let mut again = Vec::new();
        ensure(&root, "http://127.0.0.1:9/", &[pack], &mut |p| again.push(p)).unwrap();
        assert_eq!(again, vec![Progress { pack: "quake".into(), phase: "ready", done: 1, total: 1 }]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_corrupt_part_is_refused_and_nothing_unverified_is_kept() {
        let (pack, mut files, _) = fixture();
        let name = pack.parts[1].file.clone();
        let bad = files.get_mut(&name).unwrap();
        bad[0] ^= 1;
        let (base, _) = serve(files);
        let root = temp("corrupt");
        let error = ensure(&root, &base, &[pack.clone()], &mut |_| {}).unwrap_err();
        assert!(error.contains("failed verification"), "{error}");
        assert!(!root.join("parts").join(&name).exists());
        assert!(!root.join("parts").join(&name).with_extension("partial").exists());
        // The first part was verified, so a retry keeps it.
        assert!(root.join("parts").join(&pack.parts[0].file).exists());
        assert!(!installed(&root, &pack));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_verified_part_is_not_downloaded_again() {
        let (pack, files, _) = fixture();
        let root = temp("resume");
        fs::create_dir_all(root.join("parts")).unwrap();
        let first = pack.parts[0].file.clone();
        fs::write(root.join("parts").join(&first), &files[&first]).unwrap();
        let mut rest = files.clone();
        rest.remove(&first);
        let (base, asked) = serve(rest);
        ensure(&root, &base, &[pack.clone()], &mut |_| {}).unwrap();
        assert_eq!(*asked.lock().unwrap(), vec![pack.parts[1].file.clone()]);
        assert!(installed(&root, &pack));
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_read_only_source_part_is_used_without_downloading() {
        let (pack, files, assets) = fixture();
        let source = temp("source");
        let cache = temp("cache");
        fs::create_dir_all(source.join("parts")).unwrap();
        let first = pack.parts[0].file.clone();
        fs::write(source.join("parts").join(&first), &files[&first]).unwrap();
        let mut rest = files.clone();
        rest.remove(&first);
        let (base, asked) = serve(rest);
        ensure_from(&source, &cache, &base, &[pack.clone()], &mut |_| {}).unwrap();
        assert_eq!(*asked.lock().unwrap(), vec![pack.parts[1].file.clone()], "only the part absent from the read-only source is downloaded");
        for (asset, bytes) in pack.assets.iter().zip(&assets) {
            assert_eq!(&fs::read(asset_path(&cache, asset)).unwrap(), bytes);
        }
        assert!(source.join("parts").join(&first).exists(), "the read-only source is never written");
        let _ = fs::remove_dir_all(&source);
        let _ = fs::remove_dir_all(&cache);
    }

    #[test]
    fn only_the_parts_holding_missing_assets_are_downloaded() {
        let (pack, files, assets) = fixture();
        let (base, asked) = serve(files);
        let root = temp("incremental");
        ensure(&root, &base, &[pack.clone()], &mut |_| {}).unwrap();
        // A retained part can rebuild a missing asset without any download.
        fs::remove_file(asset_path(&root, &pack.assets[2])).unwrap();
        asked.lock().unwrap().clear();
        ensure(&root, &base, &[pack.clone()], &mut |_| {}).unwrap();
        assert_eq!(*asked.lock().unwrap(), Vec::<String>::new(), "retained parts rebuild missing assets offline");
        assert_eq!(fs::read(asset_path(&root, &pack.assets[2])).unwrap(), assets[2]);
        // If the later app version's part itself is gone, only that part is downloaded.
        fs::remove_file(asset_path(&root, &pack.assets[2])).unwrap();
        fs::remove_file(root.join("parts").join(&pack.parts[1].file)).unwrap();
        asked.lock().unwrap().clear();
        ensure(&root, &base, &[pack.clone()], &mut |_| {}).unwrap();
        assert_eq!(*asked.lock().unwrap(), vec![pack.parts[1].file.clone()]);
        assert_eq!(fs::read(asset_path(&root, &pack.assets[2])).unwrap(), assets[2]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn an_asset_that_does_not_match_its_listed_hash_is_refused() {
        let (mut pack, files, _) = fixture();
        pack.assets[1].sha256 = "0".repeat(64);
        let (base, _) = serve(files);
        let root = temp("asset-hash");
        let error = ensure(&root, &base, &[pack.clone()], &mut |_| {}).unwrap_err();
        assert!(error.contains("asset") && error.contains("failed verification"), "{error}");
        assert!(!asset_path(&root, &pack.assets[1]).exists());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_part_longer_than_listed_is_refused() {
        let (pack, mut files, _) = fixture();
        files.get_mut(&pack.parts[0].file).unwrap().push(0);
        let (base, _) = serve(files);
        let root = temp("oversized");
        let error = ensure(&root, &base, &[pack.clone()], &mut |_| {}).unwrap_err();
        assert!(error.contains("failed verification"), "{error}");
        assert_eq!(fs::read_dir(root.join("parts")).unwrap().count(), 0, "nothing unverified is kept, not even a partial file");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn refuses_plain_http_hosts_and_unsafe_names() {
        let (pack, _, _) = fixture();
        let root = temp("hosts");
        for base in ["http://127.0.0.1:80@evil.example/", "http://localhost.evil.example/", "https://user@example.com/", "https://example.com/?x/", "ftp://127.0.0.1/"] {
            assert!(ensure(&root, base, &[pack.clone()], &mut |_| {}).is_err(), "{base}");
        }
        assert!(!root.exists());
        assert!(ext_ok(".part10") && ext_ok(".webp") && !ext_ok(".") && !ext_ok("webp") && !ext_ok(".a/b"));
    }

    #[test]
    fn refuses_unsafe_names() {
        let (pack, _, _) = fixture();
        let root = temp("names");
        assert!(ensure(&root, "http://example.com/", &[pack.clone()], &mut |_| {}).unwrap_err().contains("https"));
        assert!(ensure(&root, "https://example.com", &[pack.clone()], &mut |_| {}).is_err());
        let mut bad = pack.clone();
        bad.name = "../quake".into();
        assert!(ensure(&root, "https://example.com/", &[bad], &mut |_| {}).is_err());
        let mut bad = pack.clone();
        bad.parts[0].file = "../../etc.bin".into();
        assert!(ensure(&root, "https://example.com/", &[bad], &mut |_| {}).is_err());
        let mut bad = pack;
        bad.assets[0].ext = "/../x".into();
        assert!(ensure(&root, "https://example.com/", &[bad], &mut |_| {}).is_err());
        assert!(!root.exists(), "nothing is written before the request is validated");
    }
}
