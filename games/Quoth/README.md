# Quoth

A community add-on for Quake (its folder is `quoth`). Put the add-on's own files here, as its release ships them:
`pak0.pak`, `pak1.pak` and `pak2.pak`.

Quoth plays over Quake (13 October 2026; [docs/add-ons-2026-10-13.md](../../docs/add-ons-2026-10-13.md)): choose it on
the game shelf. Quake's packs are mounted first, then every pack here from `pak0` up to the first missing one, and it
runs with Scourge of Armagon's switch (`-hipnotic`), as Quakespasm runs it, so its status bar is Scourge's. It keeps its
own saves and settings. Its skyboxes are not drawn yet (those maps show their classic sky).

Nothing you put here is ever committed: the repository's `.gitignore` keeps everything in `games/` out of Git except
the shareware `pak0.pak` and these README files.
