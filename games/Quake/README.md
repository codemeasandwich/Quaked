# Quake

The full game (registered Quake, Episodes 1 to 4). From the 2021 re-release copy its `id1/pak0.pak` (it holds all four episodes); from the original release, `id1/pak0.pak` and `id1/pak1.pak`. Quake calls this game's folder `id1`.

Put that pack here as `pak0.pak` (and `pak1.pak` if your copy has one), unchanged. You need your own copy: it is not
free to share.

Nothing you put here is ever committed: the repository's `.gitignore` keeps everything in `games/` out of Git except
the shareware `pak0.pak` and these README files.

The game does not read this folder yet. Detecting what is installed here ([34b]), choosing it from the menu and running
it with its own saves and settings ([34c]) come in later cards; until then an owned Quake is read from
`resources/id1/pak0.pak` as before ([34d] moves those packs here, checking every byte).
