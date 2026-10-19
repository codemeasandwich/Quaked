//! The app's pack downloader against the real `data` release (docs/per-game-packs-design-2026-10-13.md): a part comes
//! from https://github.com/<repo>/releases/download/data/ through GitHub's redirect to its download host, with the
//! app's https-only client, and is verified and unpacked. Needs the network, so it runs only when asked:
//! `QUAKED_RELEASE_TRIAL=1 cargo test --test packs_release_trial`.
#[path = "../src/packs.rs"]
#[allow(dead_code)]
mod packs;

#[test]
fn a_real_part_downloads_from_the_data_release() {
    if std::env::var("QUAKED_RELEASE_TRIAL").is_err() {
        eprintln!("skipped: set QUAKED_RELEASE_TRIAL=1 to download from the real release");
        return;
    }
    // Quoth's one part, as uploaded by CI on 13 October 2026 (its whole body as one asset)
    let sha = "106b23b9311a193ed5f2622a65fe233c361152fae68ba24827fdaa4114af8d22".to_string();
    let pack = packs::Pack {
        name: "quoth".into(),
        parts: vec![packs::Part {
            file: "quoth-106b23b9311a193e.bin".into(),
            bytes: 1_081_235,
            sha256: sha.clone(),
            priority: 0,
        }],
        assets: vec![packs::Asset {
            sha256: sha.clone(),
            offset: 0,
            length: 1_081_235,
            ext: ".bin".into(),
        }],
    };
    let root = std::env::temp_dir().join(format!("quaked-release-trial-{}", std::process::id()));
    let mut phases = Vec::new();
    let result = packs::ensure(
        &root,
        "https://github.com/codemeasandwich/Quaked/releases/download/data/",
        &[pack],
        &mut |p| phases.push(p.phase),
    );
    let unpacked = root.join("assets").join(format!("{sha}.bin"));
    let len = std::fs::metadata(&unpacked).map(|m| m.len());
    let _ = std::fs::remove_dir_all(&root);
    result.expect("download, verify and unpack");
    assert_eq!(len.ok(), Some(1_081_235), "the asset is unpacked whole");
    assert!(phases.contains(&"download"), "it was downloaded, not found");
}
