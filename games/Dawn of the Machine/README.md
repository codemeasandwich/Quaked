# Dawn of the Machine

A placeholder: this folder is kept for the game's name, but no copy is installed, and the prepared content skips it
("Owner does not have the pack; explicitly deferred", `newer/displacement/corpus.json`). Nothing here is read.

Nothing you put here is ever committed: the repository's `.gitignore` keeps everything in `games/` out of Git except
the shareware `pak0.pak` and these README files.

The game does not read this folder yet. Detecting what is installed here ([34b]), choosing it from the menu and running
it with its own saves and settings ([34c]) come in later cards; until then an owned Quake is read from
`resources/id1/pak0.pak` as before ([34d] moves those packs here, checking every byte).
