# Soul of Evil

A community add-on for Quake (its folder is `soe`). Put the add-on's own files here, as its release ships them
(`pak0.pak` to `pak3.pak`). Its release names them `pak0.PAK` and on: the Mac app reads those as they are; the source
build reads them on a Mac's case-insensitive disk, but a case-sensitive server needs them renamed to `.pak`.

Soul of Evil plays over Quake (13 October 2026; [docs/add-ons-2026-10-13.md](../../docs/add-ons-2026-10-13.md)): choose it
on the game shelf. Quake's packs are mounted first, then every pack here from `pak0` up to the first missing one, and it
runs as standard Quake with its own QuakeC, maps, saves and settings. Its Level Select lists its own levels.

Nothing you put here is ever committed: the repository's `.gitignore` keeps everything in `games/` out of Git except
the shareware `pak0.pak` and these README files.
