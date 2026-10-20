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
fn music_tokens(found: &library::Library) -> Vec<&str> {
    found
        .packs
        .iter()
        .filter(|p| p.name.starts_with("music/"))
        .map(|p| p.token.as_str())
        .collect()
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
    f.write(
        "Quoth/progs.dat",
        b"an add-on of loose files only is a game too",
    );
    f.write(
        "Scourge of Armagon/progs.dat",
        b"a mission pack without its pak0 is not",
    );
    let found = library::scan(&f.0).unwrap();
    assert_eq!(
        tokens(&found),
        [
            "quoth/progs.dat",
            "xmen/pak0.pak",
            "xmen/progs.dat",
            "xmen/autoexec.cfg"
        ]
    );
    let loose: Vec<bool> = found.packs.iter().map(|p| p.loose).collect();
    assert_eq!(loose, [true, false, true, true]);
    assert_eq!(
        library::read_range(&found, "xmen/progs.dat", 0, 5).unwrap(),
        b"loose"
    );
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
    let found = library::scan(&f.0)
        .expect("an unreadable, escaping or oversized loose file does not fail the scan");
    assert_eq!(
        tokens(&found),
        ["quake/pak0.pak", "xmen/pak0.pak"],
        "no loose file for Quake; none of the bad ones"
    );
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
        [
            "quake/pak0.pak",
            "mod_my_mod/pak0.pak",
            "mod_my_mod/autoexec.cfg",
            "mod_my_mod_2/progs.dat"
        ]
    );
    let names: Vec<(&str, &str)> = found
        .discovered
        .iter()
        .map(|d| (d.id.as_str(), d.name.as_str()))
        .collect();
    assert_eq!(
        names,
        [("mod_my_mod", "My Mod!"), ("mod_my_mod_2", "my-mod")],
        "named from the folder; a clash gets _2"
    );
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
    assert_eq!(
        ids,
        ["mod_addon", "mod_mod_x"],
        "no empty id; the placeholder's folder is left to its placeholder"
    );
}

#[test]
fn finds_hexen2_under_data1_with_gapped_paks_and_loose_files() {
    let f = Fixture::new();
    f.write("Hexen 2/data1/pak0.pak", b"base");
    f.write("Hexen 2/data1/PAK1.PAK", b"base one");
    f.write("Hexen 2/data1/pak3.pak", b"base three, after a gap");
    f.write("Hexen 2/data1/progs.dat", b"loose program");
    f.write("Hexen 2/data1/strings.txt", b"loose strings");
    f.write("Hexen 2/data1/hexen.rc", b"loose startup");
    f.write("Hexen 2/data1/readme.txt", b"not engine content");
    let found = library::scan(&f.0).unwrap();
    assert_eq!(
        tokens(&found),
        [
            "hexen2/pak0.pak",
            "hexen2/pak1.pak",
            "hexen2/pak3.pak",
            "hexen2/progs.dat",
            "hexen2/strings.txt",
            "hexen2/hexen.rc",
        ],
        "the installation's data1 packs are probed through gaps and its loose files are exposed"
    );
    let loose: Vec<&str> = found
        .packs
        .iter()
        .filter(|p| p.loose)
        .map(|p| p.name.as_str())
        .collect();
    assert_eq!(loose, ["progs.dat", "strings.txt", "hexen.rc"]);
    for pack in &found.packs {
        assert!(pack.path.starts_with(&found.root));
        assert_eq!(pack.bytes, fs::metadata(&pack.path).unwrap().len());
    }
    // selecting the installation folder itself also resolves data1
    let direct = library::scan(&f.path("Hexen 2")).unwrap();
    assert_eq!(
        tokens(&direct).len(),
        6,
        "the installation root resolves its data1 and does not rediscover it as an add-on"
    );
}

#[test]
fn lists_hexen_music_tracks_for_each_edition_and_never_for_a_quake_game() {
    let f = Fixture::new();
    f.write("Hexen 2/data1/pak0.pak", b"base");
    f.write("Hexen 2/data1/music/casa1.ogg", b"ogg one");
    f.write("Hexen 2/data1/music/CASA2.MP3", b"mp3 two");
    f.write("Hexen 2/data1/music/casa3.wav", b"wav three");
    f.write("Hexen 2/data1/music/readme.txt", b"not a track");
    f.write("Hexen 2/data1/music/nested/deep.ogg", b"not directly in music/");
    f.write("Hexen 2/portals/pak3.pak", b"portal add-on");
    f.write("Hexen 2/portals/progs.dat", b"portal program");
    f.write("Hexen 2/portals/music/tulku1.ogg", b"portal track");
    f.write("Hexen 2/portals/music/track02.mp3", b"portal menu");
    f.write(
        "Hexen 2 Shareware/hexen2-demo/data1/pak0.pak",
        b"demo",
    );
    f.write(
        "Hexen 2 Shareware/hexen2-demo/data1/music/demo1.ogg",
        b"demo track",
    );
    f.write("Quake/pak0.pak", b"quake");
    f.write("Quake/music/quake.ogg", b"not a Hexen edition");
    let found = library::scan(&f.0).unwrap();
    assert_eq!(
        music_tokens(&found),
        [
            "hexen2/music/casa1.ogg",
            "hexen2/music/casa2.mp3",
            "hexen2/music/casa3.wav",
            "hexen2-portals/music/track02.mp3",
            "hexen2-portals/music/tulku1.ogg",
            "hexen2-demo/music/demo1.ogg",
        ],
        "the case-insensitive direct music files of each Hexen edition, and no Quake folder"
    );
    for pack in found.packs.iter().filter(|p| p.name.starts_with("music/")) {
        assert!(pack.loose, "music is a loose game file, not an archive");
        assert!(pack.path.starts_with(&found.root));
        assert_eq!(pack.bytes, fs::metadata(&pack.path).unwrap().len());
    }
    assert_eq!(
        library::read_range(&found, "hexen2/music/casa1.ogg", 0, 3).unwrap(),
        b"ogg"
    );
    assert_eq!(
        library::read_range(&found, "hexen2-portals/music/tulku1.ogg", 7, 5).unwrap(),
        b"track"
    );
    let quake = library::scan(&f.path("Quake")).unwrap();
    assert!(
        music_tokens(&quake).is_empty(),
        "Quake's music folder is not the Hexen II loose-music contract"
    );
}

#[test]
fn hexen_music_lists_only_direct_regular_files_within_the_loose_bound() {
    let f = Fixture::new();
    f.write("Hexen 2/data1/pak0.pak", b"base");
    f.write("Hexen 2/data1/music/good.ogg", b"good");
    f.write("Hexen 2/data1/music/nested/deep.ogg", b"nested");
    fs::create_dir_all(f.path("Hexen 2/data1/music/folder.mp3")).unwrap();
    let big = fs::File::create(f.path("Hexen 2/data1/music/big.wav")).unwrap();
    big.set_len((64 << 20) + 1).unwrap();
    let found = library::scan(&f.0).unwrap();
    assert_eq!(
        music_tokens(&found),
        ["hexen2/music/good.ogg"],
        "nested paths, directories and files over the bound are left out"
    );
    // The bound is inclusive, as for loose game files.
    let edge = fs::File::create(f.path("Hexen 2/data1/music/edge.ogg")).unwrap();
    edge.set_len(64 << 20).unwrap();
    assert_eq!(
        music_tokens(&library::scan(&f.0).unwrap()),
        ["hexen2/music/edge.ogg", "hexen2/music/good.ogg"]
    );
}

#[cfg(unix)]
#[test]
fn hexen_music_ignores_a_symlink_that_resolves_outside_the_library() {
    let f = Fixture::new();
    let outside = Fixture::new();
    f.write("Hexen 2/data1/pak0.pak", b"base");
    f.write("Hexen 2/data1/music/safe.ogg", b"safe");
    let external = outside.write("escape.ogg", b"outside the library");
    symlink(&external, &f.path("Hexen 2/data1/music/escape.ogg"));
    symlink(&outside.0, &f.path("Hexen 2/data1/music/linked.ogg"));
    let found = library::scan(&f.0).expect("an escaping music symlink never fails the scan");
    assert_eq!(
        music_tokens(&found),
        ["hexen2/music/safe.ogg"],
        "a music symlink out of the library is left out like a loose game file"
    );
    assert!(library::read_range(&found, "hexen2/music/escape.ogg", 0, 1).is_err());
}

#[test]
fn finds_the_supplied_demo_wrapper_its_data1_program_and_its_loose_files() {
    let f = Fixture::new();
    f.write("Hexen 2 Shareware/hexen2-demo/data1/pak0.pak", b"demo");
    f.write(
        "Hexen 2 Shareware/hexen2-demo/data1/progs.dat",
        b"demo program",
    );
    f.write(
        "Hexen 2 Shareware/hexen2-demo/data1/strings.txt",
        b"demo strings",
    );
    f.write(
        "Hexen 2 Shareware/hexen2-demo/data1/hexen.rc",
        b"demo startup",
    );
    f.write(
        "Hexen 2 Shareware/hexen2-demo/data1/readme.txt",
        b"not engine content",
    );
    let expected = [
        "hexen2-demo/pak0.pak",
        "hexen2-demo/progs.dat",
        "hexen2-demo/strings.txt",
        "hexen2-demo/hexen.rc",
    ];
    let found = library::scan(&f.0).unwrap();
    assert_eq!(
        tokens(&found),
        expected,
        "the wrapper's nested data1 is found"
    );
    assert!(
        found.discovered.is_empty(),
        "the wrapper is a known demo installation, not an add-on"
    );
    assert_eq!(
        tokens(&library::scan(&f.path("Hexen 2 Shareware")).unwrap()),
        expected,
        "the wrapper root works"
    );
    assert_eq!(
        tokens(&library::scan(&f.path("Hexen 2 Shareware/hexen2-demo")).unwrap()),
        expected,
        "the demo's own root works"
    );
    assert_eq!(
        library::read_range(&found, "hexen2-demo/progs.dat", 0, 5).unwrap(),
        b"demo ",
        "the demo's loose program is readable through its token"
    );
}

#[test]
fn finds_the_owner_demo_fixture_when_it_is_present() {
    let wrapper = Path::new("/Users/bri/quaked/Hexen 2 Shareware");
    if !wrapper.exists() {
        return;
    }
    let found = library::scan(wrapper).expect("the demo wrapper scans");
    assert!(
        tokens(&found)
            .iter()
            .any(|token| *token == "hexen2-demo/pak0.pak"),
        "the verified demo pak0 is discovered: {:?}",
        tokens(&found)
    );
    assert!(
        tokens(&found)
            .iter()
            .any(|token| *token == "hexen2-demo/progs.dat"),
        "the demo's loose program is discovered"
    );
    let header = library::read_range(&found, "hexen2-demo/pak0.pak", 0, 4).unwrap();
    assert_eq!(header, b"PACK", "the discovered archive is the real PAK");
}

#[test]
fn discovers_portal_of_praevus_by_its_loose_program_and_add_on_pak() {
    let f = Fixture::new();
    f.write("Hexen 2/data1/pak0.pak", b"base");
    f.write("Hexen 2/data1/pak1.pak", b"base one");
    f.write("Hexen 2/portals/pak3.pak", b"portal add-on");
    f.write("Hexen 2/portals/progs.dat", b"portal program");
    f.write("Hexen 2/portals/strings.txt", b"portal strings");
    f.write("Hexen 2/portals/hexen.rc", b"portal startup");
    let found = library::scan(&f.0).unwrap();
    assert!(
        tokens(&found).contains(&"hexen2-portals/pak3.pak"),
        "Portal's add-on pak is discovered without a pak0: {:?}",
        tokens(&found)
    );
    assert!(
        tokens(&found).contains(&"hexen2-portals/progs.dat"),
        "Portal's loose program is discovered: {:?}",
        tokens(&found)
    );
    let portal_loose: Vec<&str> = found
        .packs
        .iter()
        .filter(|p| p.game == "hexen2-portals" && p.loose)
        .map(|p| p.name.as_str())
        .collect();
    assert_eq!(portal_loose, ["progs.dat", "strings.txt", "hexen.rc"]);
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
    // Hexen II is a recognised game: its data1 packs mount and its box art belongs to it, not to an add-on title.
    f.write("Hexen 2/data1/pak0.pak", b"hexen base pack");
    f.write("notes/readme.txt", b"ordinary folder without art or game content");
    f.write("Poster Only/poster.png", b"not a canonical box face");
    f.write(".hidden/front.png", b"hidden art alone");
    f.write("Dawn of the Machine/front.png", b"placeholder art alone");
    let found = library::scan(&f.0).unwrap();
    assert_eq!(tokens(&found), ["hexen2/pak0.pak", "shareware/pak0.pak", "mod_my_mod/progs.dat"]);
    assert_eq!(found.artwork["shareware"]["front"], cover.canonicalize().unwrap());
    assert_eq!(found.artwork["shareware"]["spine"], side.canonicalize().unwrap());
    assert_eq!(found.artwork["mod_my_mod"]["front"], addon_front.canonicalize().unwrap());
    let titles: Vec<(&str, &str)> = found.discovered.iter().map(|d| (d.id.as_str(), d.name.as_str())).collect();
    assert_eq!(titles, [("mod_my_mod", "My Mod"), ("mod_quaked", "Quaked")]);
    assert_eq!(found.artwork["mod_quaked"]["front"], quaked_front.canonicalize().unwrap());
    assert_eq!(found.artwork["hexen2"]["front"], hexen_front.canonicalize().unwrap());
    assert!(!found.packs.iter().any(|p| p.game == "mod_quaked"), "artwork alone grants no mountable content");
    assert!(library::read_range(&found, "mod_quaked/pak0.pak", 0, 1).is_err());
    assert!(!found.artwork.contains_key("dawn"));
}

#[test]
fn existing_folders_with_default_boxes_get_metadata_without_local_art_or_nested_game_admission() {
    let f = Fixture::new();
    // Recognised Hexen II folders are games, never display-only titles (their own contract is hexen-specific).
    f.write("hExEn 2/data1/pak0.pak", b"hexen base pack");
    fs::create_dir(f.path("Quaked")).unwrap();
    f.write("Another Game/data1/pak0.pak", b"a nested-only folder without default art stays absent");
    let found = library::scan(&f.0).unwrap();
    let titles: Vec<(&str, &str)> = found.discovered.iter().map(|d| (d.id.as_str(), d.name.as_str())).collect();
    assert_eq!(titles, [("mod_quaked", "Quaked")], "only existing display-only folders with shipped boxes are added");
    assert!(found.packs.iter().all(|p| p.game == "hexen2"), "default box art grants no pack or loose-file tokens");
    assert!(found.artwork.is_empty(), "no local art is invented; the shelf uses its bundled defaults");
    for title in &found.discovered {
        assert!(library::read_range(&found, &format!("{}/pak0.pak", title.id), 0, 1).is_err());
    }
    fs::remove_dir(f.path("Quaked")).unwrap();
    let refreshed = library::scan(&f.0).unwrap();
    assert!(!refreshed.discovered.iter().any(|d| d.id == "mod_quaked"), "a default box does not fabricate a missing folder");
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
