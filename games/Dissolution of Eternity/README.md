# Dissolution of Eternity

Mission pack 2 (Rogue Entertainment, 1997). From your copy, the `rogue` folder's `pak0.pak`. Quake calls this game's folder `rogue`.

Put that pack here as `pak0.pak` (and `pak1.pak` if your copy has one), unchanged. You need your own copy: it is not
free to share.

Nothing you put here is ever committed: the repository's `.gitignore` keeps everything in `games/` out of Git except
the shareware `pak0.pak` and these README files.

The game does not read this folder yet. Detecting what is installed here ([34b]), choosing it from the menu and running
it with its own saves and settings ([34c]) come in later cards; until then an owned Quake is read from
`resources/id1/pak0.pak` as before ([34d] moves those packs here, checking every byte).
