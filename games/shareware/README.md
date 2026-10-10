# shareware

The shareware Quake (version 1.06's `pak0.pak`, the Introduction and Episode 1), free to share and the one game pack
in this repository. The page (`main.js`), the room server (`server/game_server.js`, from `server/` as
`../games/shareware/pak0.pak`), the tools and the tests read it from here. A deployment that still serves it at the
site's root is tried next, so an older copy of the site keeps working.

It must stay byte for byte the same: `tests/games_layout_test.js` checks its SHA-256
(35a9c55e5e5a284a159ad2a62e0e8def23d829561fe2f54eb402dbc0a9a946af).
