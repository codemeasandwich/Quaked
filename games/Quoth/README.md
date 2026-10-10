# Quoth

A community add-on for Quake (its folder is `quoth`). Put the add-on's own files here, as its release ships them.

It is listed because a copy is installed on the owner's machine; that does not mean the game supports it. Add-ons
often need engine features (new entity types, BSP2 maps, higher limits) that may be missing: whether this one runs is
for [34b] to detect and say, not assumed.

Nothing you put here is ever committed: the repository's `.gitignore` keeps everything in `games/` out of Git except
the shareware `pak0.pak` and these README files.

The game does not read this folder yet. Detecting what is installed here ([34b]), choosing it from the menu and running
it with its own saves and settings ([34c]) come in later cards; until then an owned Quake is read from
`resources/id1/pak0.pak` as before ([34d] moves those packs here, checking every byte).
