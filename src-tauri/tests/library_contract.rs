//! Public filesystem contracts for the native library. Temporary fixtures contain
//! arbitrary bytes: parsing Quake content remains the existing frontend's job.
#[path = "../src/library.rs"]
#[allow(dead_code)]
mod library;

use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture(PathBuf);
impl Fixture {
    fn new() -> Self {
        let serial = NEXT.fetch_add(1, Ordering::Relaxed);
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "quaked-library-contract-{}-{stamp}-{serial}",
            std::process::id()
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn path(&self, relative: &str) -> PathBuf {
        self.0.join(relative)
    }
    fn write(&self, relative: &str, bytes: &[u8]) -> PathBuf {
        let path = self.path(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, bytes).unwrap();
        path
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn tokens(found: &library::Library) -> Vec<&str> {
    found.packs.iter().map(|p| p.token.as_str()).collect()
}
fn error_contains(result: Result<Vec<u8>, String>, expected: &str) {
    assert!(
        result
            .as_ref()
            .err()
            .is_some_and(|error| error.contains(expected)),
        "expected {expected:?}, got {result:?}"
    );
}

#[test]
fn scans_known_case_insensitive_aliases_without_recursing_arbitrary_directories() {
    let f = Fixture::new();
    f.write("ID1/PAK0.PAK", b"base");
    f.write("ID1/pAk1.PaK", b"registered");
    f.write("sCoUrGe Of ArMaGoN/PaK0.pAk", b"expansion");
    f.write("soul of evil/pak0.PAK", b"add-on, as its release names it");
    f.write("soul of evil/pak1.PAK", b"add-on");
    f.write("unknown/pak0.pak", b"not a configured game");
    f.write("nested/rogue/pak0.pak", b"not an immediate known folder");
    let found = library::scan(&f.0).unwrap();
    assert_eq!(
        tokens(&found),
        ["quake/pak0.pak", "quake/pak1.pak", "hipnotic/pak0.pak", "soe/pak0.pak", "soe/pak1.pak", "mod_unknown/pak0.pak"],
        "an unknown immediate folder with a pak0 is an add-on (docs/add-ons-2026-10-13.md); nested ones are not"
    );
    assert_eq!(found.root, f.0.canonicalize().unwrap());
    for pack in &found.packs {
        assert!(pack.path.is_absolute());
        assert!(pack.path.starts_with(&found.root));
        assert_eq!(pack.bytes, fs::metadata(&pack.path).unwrap().len());
    }
    let direct = library::scan(&f.path("ID1")).unwrap();
    assert_eq!(
        tokens(&direct),
        ["quake/pak0.pak", "quake/pak1.pak"],
        "a selected game folder works too"
    );
}

#[test]
fn stops_at_a_numbering_gap_and_exposes_only_one_overflow_sentinel() {
    let f = Fixture::new();
    f.write("id1/pak0.pak", b"base");
    f.write("id1/pak2.pak", b"after gap");
    assert_eq!(tokens(&library::scan(&f.0).unwrap()), ["quake/pak0.pak"]);
    for n in 1..=7 {
        f.write(&format!("id1/pak{n}.pak"), &[n]);
    }
    let found = library::scan(&f.0).unwrap();
    assert_eq!(
        found.packs.len(),
        6,
        "pak5 is exposed solely so JS can refuse a set beyond five packs"
    );
    assert_eq!(found.packs.last().unwrap().name, "pak5.pak");
    assert!(!tokens(&found).iter().any(|t| t.ends_with("pak6.pak")));
}

#[test]
fn bounded_reads_return_exact_bytes_clip_at_eof_and_refuse_unknown_tokens() {
    let f = Fixture::new();
    let bytes: Vec<u8> = (0..140_000).map(|i| (i % 251) as u8).collect();
    f.write("id1/pak0.pak", &bytes);
    let found = library::scan(&f.0).unwrap();
    assert_eq!(
        library::read_range(&found, "quake/pak0.pak", 4, 12).unwrap(),
        bytes[4..16]
    );
    assert_eq!(
        library::read_range(&found, "quake/pak0.pak", 0, 131_072).unwrap(),
        bytes[..131_072]
    );
    assert_eq!(
        library::read_range(&found, "quake/pak0.pak", 139_998, 12).unwrap(),
        bytes[139_998..]
    );
    assert!(library::read_range(&found, "quake/pak0.pak", 140_000, 12)
        .unwrap()
        .is_empty());
    error_contains(
        library::read_range(&found, "quake/pak0.pak", 0, 131_073),
        "bound",
    );
    error_contains(
        library::read_range(&found, "quake/pak0.pak", u64::MAX, 12),
        "outside",
    );
    error_contains(
        library::read_range(&found, "../../secret", 0, 12),
        "Unknown archive token",
    );
    error_contains(
        library::read_range(&found, "quake/pak1.pak", 0, 12),
        "Unknown archive token",
    );
}

#[test]
fn refuses_a_file_changed_since_discovery_then_allows_an_explicit_rescan() {
    let f = Fixture::new();
    let path = f.write("id1/pak0.pak", b"before");
    let old = library::scan(&f.0).unwrap();
    fs::write(&path, b"changed and longer").unwrap();
    error_contains(
        library::read_range(&old, "quake/pak0.pak", 0, 12),
        "changed",
    );
    let current = library::scan(&f.0).unwrap();
    assert_eq!(
        library::read_range(&current, "quake/pak0.pak", 0, 7).unwrap(),
        b"changed"
    );
    fs::remove_file(path).unwrap();
    assert!(library::read_range(&current, "quake/pak0.pak", 0, 12).is_err());
}

#[cfg(unix)]
fn symlink(source: &Path, target: &Path) {
    std::os::unix::fs::symlink(source, target).unwrap();
}

#[cfg(unix)]
#[test]
fn canonical_paths_prevent_directory_and_archive_symlink_escape() {
    let f = Fixture::new();
    let outside = Fixture::new();
    let external = outside.write("id1/pak0.pak", b"private");
    symlink(&outside.path("id1"), &f.path("id1"));
    assert!(
        library::scan(&f.0).unwrap().packs.is_empty(),
        "outside game directories are not discovered"
    );
    fs::remove_file(f.path("id1")).unwrap();
    fs::create_dir(f.path("id1")).unwrap();
    symlink(&external, &f.path("id1/pak0.pak"));
    assert!(library::scan(&f.0)
        .err()
        .is_some_and(|e| e.contains("escapes")));

    fs::remove_file(f.path("id1/pak0.pak")).unwrap();
    let local = f.write("id1/pak0.pak", b"local");
    let found = library::scan(&f.0).unwrap();
    fs::remove_file(&local).unwrap();
    symlink(&external, &local);
    error_contains(
        library::read_range(&found, "quake/pak0.pak", 0, 5),
        "location changed",
    );
}

#[test]
fn missing_root_and_directory_named_as_archive_fail_without_creating_content() {
    let f = Fixture::new();
    let absent = f.path("not-created");
    assert!(library::scan(&absent).is_err());
    assert!(!absent.exists());
    fs::create_dir_all(f.path("id1/pak0.pak")).unwrap();
    assert!(library::scan(&f.0)
        .err()
        .is_some_and(|e| e.contains("not a file")));
}

#[test]
fn lists_an_add_ons_loose_game_files_after_its_packs_and_nothing_else_loose() {
    let f = Fixture::new();
    f.write("X-Men/pak0.pak", b"pack");
    f.write("X-Men/PROGS.DAT", b"loose quakec");
    f.write("X-Men/autoexec.cfg", b"bind i prevtoy");
    f.write("X-Men/config.cfg", b"unbindall");
    f.write("X-Men/readme.txt", b"not a game file");
    f.write("Quoth/progs.dat", b"an add-on of loose files only is a game too");
    f.write("Scourge of Armagon/progs.dat", b"a mission pack without its pak0 is not");
    let found = library::scan(&f.0).unwrap();
    assert_eq!(tokens(&found), ["quoth/progs.dat", "xmen/pak0.pak", "xmen/progs.dat", "xmen/autoexec.cfg"]);
    let loose: Vec<bool> = found.packs.iter().map(|p| p.loose).collect();
    assert_eq!(loose, [true, false, true, true]);
    assert_eq!(library::read_range(&found, "xmen/progs.dat", 0, 5).unwrap(), b"loose");
}

#[cfg(unix)]
#[test]
fn a_base_game_gets_no_loose_files_and_a_bad_loose_file_is_left_out_without_failing_the_scan() {
    let f = Fixture::new();
    f.write("Quake/pak0.pak", b"base");
    f.write("Quake/autoexec.cfg", b"the player's own");
    f.write("X-Men/pak0.pak", b"pack");
    let elsewhere = Fixture::new();
    let outside = elsewhere.write("progs.dat", b"outside the library");
    symlink(&outside, &f.path("X-Men/progs.dat"));
    std::os::unix::fs::symlink(f.path("missing"), f.path("X-Men/autoexec.cfg")).unwrap();
    let big = fs::File::create(f.path("X-Men/quake.rc")).unwrap();
    big.set_len((64 << 20) + 1).unwrap();
    let found = library::scan(&f.0).expect("an unreadable, escaping or oversized loose file does not fail the scan");
    assert_eq!(tokens(&found), ["quake/pak0.pak", "xmen/pak0.pak"], "no loose file for Quake; none of the bad ones");
}

#[test]
fn any_folder_with_a_pak0_or_progs_dat_is_discovered_as_an_add_on_named_from_its_folder() {
    let f = Fixture::new();
    f.write("Quake/pak0.pak", b"base");
    f.write("My Mod!/pak0.pak", b"pack");
    f.write("My Mod!/autoexec.cfg", b"bind i prevtoy");
    f.write("my-mod/progs.dat", b"loose quakec only");
    f.write(".hidden/pak0.pak", b"not a game");
    f.write("notes/readme.txt", b"not a game");
    let found = library::scan(&f.0).unwrap();
    assert_eq!(
        tokens(&found),
        ["quake/pak0.pak", "mod_my_mod/pak0.pak", "mod_my_mod/autoexec.cfg", "mod_my_mod_2/progs.dat"]
    );
    let names: Vec<(&str, &str)> = found.discovered.iter().map(|d| (d.id.as_str(), d.name.as_str())).collect();
    assert_eq!(names, [("mod_my_mod", "My Mod!"), ("mod_my_mod_2", "my-mod")], "named from the folder; a clash gets _2");
}

#[test]
fn a_folder_with_no_ascii_name_gets_a_usable_id_and_a_placeholder_folder_is_not_discovered() {
    let f = Fixture::new();
    f.write("Quake/pak0.pak", b"base");
    f.write("日本語/pak0.pak", b"pack");
    f.write("Mod😀X/pak0.pak", b"pack");
    f.write("Dawn of the Machine/pak0.pak", b"not playable yet");
    let found = library::scan(&f.0).unwrap();
    let mut ids: Vec<&str> = found.discovered.iter().map(|d| d.id.as_str()).collect();
    ids.sort();
    // one `_` per character, as the source build's GameCatalogue_DiscoveredId (its test has the same cases)
    assert_eq!(ids, ["mod_addon", "mod_mod_x"], "no empty id; the placeholder's folder is left to its placeholder");
}

#[test]
fn box_faces_are_case_insensitive_deterministic_and_never_mounted_as_game_files() {
    let f = Fixture::new();
    f.write("Quoth/pak0.pak", b"game");
    // Create aliases first: canonical face names win without relying on enumeration order.
    f.write("Quoth/cover.png", b"cover alias");
    f.write("Quoth/side.png", b"side alias");
    let front = f.write("Quoth/FRONT.JpG", b"front");
    f.write("Quoth/front.webp", b"another supported type");
    let spine = f.write("Quoth/SPINE.AvIf", b"spine");
    let back = f.write("Quoth/Back.JPEG", b"back");
    f.write("Quoth/images/back.png", b"nested art is not a box face");
    let found = library::scan(&f.0).unwrap();
    let faces = &found.artwork["quoth"];
    assert_eq!(faces.len(), 3);
    assert_eq!(faces["front"], front.canonicalize().unwrap());
    assert_eq!(faces["spine"], spine.canonicalize().unwrap());
    assert_eq!(faces["back"], back.canonicalize().unwrap());
    assert_eq!(tokens(&found), ["quoth/pak0.pak"]);
    assert!(library::read_range(&found, "quoth/front.jpg", 0, 1).is_err(), "art is not a game archive token");
    assert_eq!(library::read_range(&found, "quoth/pak0.pak", 0, 4).unwrap(), b"game");
}

#[test]
fn box_art_uses_only_the_directory_selected_for_the_game_not_another_alias_or_nested_folder() {
    let f = Fixture::new();
    f.write("id1/pak0.pak", b"selected");
    let selected = f.write("id1/front.png", b"selected front");
    f.write("id1/gfx/back.png", b"nested back");
    f.write("Quake/pak0.pak", b"unselected alias");
    f.write("Quake/front.png", b"wrong front");
    f.write("Quake/back.png", b"wrong back");
    let found = library::scan(&f.0).unwrap();
    assert_eq!(found.artwork["quake"].len(), 1);
    assert_eq!(found.artwork["quake"]["front"], selected.canonicalize().unwrap());
    assert_eq!(library::read_range(&found, "quake/pak0.pak", 0, 8).unwrap(), b"selected");
    let direct = library::scan(&f.path("id1")).unwrap();
    assert_eq!(direct.artwork["quake"], found.artwork["quake"], "a directly selected game folder has the same art");
}

#[test]
fn shareware_and_addons_get_art_while_art_only_folders_get_titles_without_mountable_content() {
    let f = Fixture::new();
    f.write("Quake shareware/pak0.pak", b"shareware");
    let cover = f.write("Quake shareware/cover.png", b"cover");
    let side = f.write("Quake shareware/side.gif", b"side");
    f.write("My Mod/progs.dat", b"loose game");
    let addon_front = f.write("My Mod/front.webp", b"addon front");
    let quaked_front = f.write("Quaked/front.png", b"art alone");
    let hexen_front = f.write("Hexen 2/front.png", b"box with nested data");
    f.write("Hexen 2/data1/pak0.pak", b"not a supported immediate archive");
    f.write("notes/readme.txt", b"ordinary folder without art or game content");
    f.write("Poster Only/poster.png", b"not a canonical box face");
    f.write(".hidden/front.png", b"hidden art alone");
    f.write("Dawn of the Machine/front.png", b"placeholder art alone");
    let found = library::scan(&f.0).unwrap();
    assert_eq!(tokens(&found), ["shareware/pak0.pak", "mod_my_mod/progs.dat"]);
    assert_eq!(found.artwork["shareware"]["front"], cover.canonicalize().unwrap());
    assert_eq!(found.artwork["shareware"]["spine"], side.canonicalize().unwrap());
    assert_eq!(found.artwork["mod_my_mod"]["front"], addon_front.canonicalize().unwrap());
    let titles: Vec<(&str, &str)> = found.discovered.iter().map(|d| (d.id.as_str(), d.name.as_str())).collect();
    assert_eq!(titles, [("mod_hexen_2", "Hexen 2"), ("mod_my_mod", "My Mod"), ("mod_quaked", "Quaked")]);
    assert_eq!(found.artwork["mod_quaked"]["front"], quaked_front.canonicalize().unwrap());
    assert_eq!(found.artwork["mod_hexen_2"]["front"], hexen_front.canonicalize().unwrap());
    assert!(!found.packs.iter().any(|p| p.game == "mod_quaked" || p.game == "mod_hexen_2"),
        "neither artwork nor nested foreign archives grant mountable content");
    assert!(library::read_range(&found, "mod_quaked/pak0.pak", 0, 1).is_err());
    assert!(library::read_range(&found, "mod_hexen_2/pak0.pak", 0, 1).is_err());
    assert!(!found.artwork.contains_key("dawn"));
}

#[test]
fn existing_folders_with_default_boxes_get_metadata_without_local_art_or_nested_game_admission() {
    let f = Fixture::new();
    f.write("hExEn 2/data1/pak0.pak", b"nested foreign game data");
    f.write("Hexen 2 Portal of Praevus/portals/pak3.pak", b"nested foreign expansion data");
    fs::create_dir(f.path("Quaked")).unwrap();
    f.write("Another Game/data1/pak0.pak", b"a nested-only folder without default art stays absent");
    let found = library::scan(&f.0).unwrap();
    let titles: Vec<(&str, &str)> = found.discovered.iter().map(|d| (d.id.as_str(), d.name.as_str())).collect();
    assert_eq!(titles, [
        ("mod_hexen_2", "hExEn 2"),
        ("mod_hexen_2_portal_of_praevus", "Hexen 2 Portal of Praevus"),
        ("mod_quaked", "Quaked"),
    ], "only existing display-only folders with shipped boxes are added");
    assert!(found.packs.is_empty(), "default box art grants no pack or loose-file tokens");
    assert!(found.artwork.is_empty(), "no local art is invented; the shelf uses its bundled defaults");
    for title in &found.discovered {
        assert!(library::read_range(&found, &format!("{}/pak0.pak", title.id), 0, 1).is_err());
    }
    fs::remove_dir(f.path("Quaked")).unwrap();
    let refreshed = library::scan(&f.0).unwrap();
    assert!(!refreshed.discovered.iter().any(|d| d.id == "mod_quaked"), "a default box does not fabricate a missing folder");
}

#[test]
fn retained_new_boxed_folders_remain_visible_after_original_art_is_imported() {
    let f = Fixture::new();
    // Import removes canonical local faces only after preserving their originals in
    // the project. Empty retained folders still identify bundled, display-only boxes.
    for folder in ["aLkAlInE", "Tremor", "Hexen 2 Shareware", "The Immortal Lock", "Unboxed Empty"] {
        fs::create_dir(f.path(folder)).unwrap();
    }
    let found = library::scan(&f.0).unwrap();
    let titles: Vec<(&str, &str)> = found.discovered.iter()
        .map(|d| (d.id.as_str(), d.name.as_str())).collect();
    assert_eq!(titles, [
        ("mod_alkaline", "aLkAlInE"),
        ("mod_hexen_2_shareware", "Hexen 2 Shareware"),
        ("mod_the_immortal_lock", "The Immortal Lock"),
        ("mod_tremor", "Tremor"),
    ], "the exact retained folder identities select their shipped defaults case-insensitively");
    assert!(found.packs.is_empty(), "box defaults never admit game archives");
    assert!(found.artwork.is_empty(), "no local images remain or are fabricated");
    for title in &found.discovered {
        assert!(library::read_range(&found, &format!("{}/pak0.pak", title.id), 0, 1).is_err());
    }
    fs::remove_dir(f.path("Tremor")).unwrap();
    let refreshed = library::scan(&f.0).unwrap();
    assert!(!refreshed.discovered.iter().any(|d| d.id == "mod_tremor"),
        "a bundled default does not invent an absent folder");
}

#[cfg(unix)]
#[test]
fn invalid_optional_box_images_are_skipped_without_hiding_the_game_or_safe_face_fallback() {
    let f = Fixture::new();
    let outside = Fixture::new();
    f.write("Quoth/pak0.pak", b"game");
    let external = outside.write("front.png", b"outside library");
    symlink(&external, &f.path("Quoth/front.png"));
    let cover = f.write("Quoth/cover.jpg", b"safe cover fallback");
    symlink(&f.path("missing"), &f.path("Quoth/spine.png"));
    let side = f.write("Quoth/side.webp", b"safe side fallback");
    fs::create_dir(f.path("Quoth/back.png")).unwrap();
    f.write("Quoth/back.jpg", b"");
    let big = fs::File::create(f.path("Quoth/back.webp")).unwrap();
    big.set_len((16 << 20) + 1).unwrap();
    f.write("Quoth/back.svg", b"not a supported image type");
    f.write("Quoth/nested/back.gif", b"not top level");
    let found = library::scan(&f.0).expect("optional image errors must not prevent game discovery");
    assert_eq!(tokens(&found), ["quoth/pak0.pak"]);
    assert_eq!(found.artwork["quoth"].len(), 2);
    assert_eq!(found.artwork["quoth"]["front"], cover.canonicalize().unwrap());
    assert_eq!(found.artwork["quoth"]["spine"], side.canonicalize().unwrap());
    assert!(!found.artwork["quoth"].contains_key("back"));
    // Discovery checks file metadata, leaving actual image decoding to the shelf. The bound is inclusive.
    let boundary = fs::File::create(f.path("Quoth/back.avif")).unwrap();
    boundary.set_len(16 << 20).unwrap();
    let refreshed = library::scan(&f.0).unwrap();
    assert_eq!(refreshed.artwork["quoth"]["back"], f.path("Quoth/back.avif").canonicalize().unwrap());
}
