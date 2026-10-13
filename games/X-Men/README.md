# X-Men

A community add-on for Quake (its folder is `xmen`). Put the add-on's own files here, as its release ships them: its
packs (`pak0.pak` and on) and its loose `progs.dat`.

X-Men plays over Quake (13 October 2026; [docs/add-ons-2026-10-13.md](../../docs/add-ons-2026-10-13.md)): choose it on
the game shelf. Quake's packs are mounted first, then the loose game files here (`progs.dat`, `autoexec.cfg`,
`quake.rc`), then every pack here from `pak0` up to the first missing one, as Quake reads a game folder. It runs as
standard Quake with its own QuakeC, maps, saves and settings.

Nothing you put here is ever committed: the repository's `.gitignore` keeps everything in `games/` out of Git except
the shareware `pak0.pak` and these README files.
