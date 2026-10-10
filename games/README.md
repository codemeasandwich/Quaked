# games

One folder per game or add-on. Only `shareware/` ships with the repository (its `pak0.pak` is free to share); every
other folder holds instructions for a copy you own, which stays out of Git.

| Folder | What it is | Quake's folder |
|---|---|---|
| `shareware/` | Shareware Quake: Introduction and Episode 1 (in the repository) | `id1` (shareware) |
| `Quake/` | The full game, Episodes 1 to 4 | `id1` |
| `Scourge of Armagon/` | Mission pack 1 | `hipnotic` |
| `Dissolution of Eternity/` | Mission pack 2 | `rogue` |
| `Dimension of the Past/` | 20th-anniversary episode | `dopa` |
| `Dimension of the Machine/` | 2021 re-release episode | `mg1` |
| `Dawn of the Machine/` | Placeholder: not installed | |
| `Arcane Dimensions/`, `Quoth/`, `Malice/`, `X-Men/`, `Abyss of Pandemonium/` | Community add-ons found installed; support not assumed | `ad`, `quoth`, `malice`, `xmen`, `aopfm_v2` |

Card [34a] made this layout; [34b] detects what is installed, [34c] mounts and selects it, [34d] moves the owned packs
here from `resources/`.
