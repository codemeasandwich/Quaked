<p align="center">
  <a href="https://codemeasandwich.github.io/Quaked/">
    <img src="docs/images/quaked-banner.png" alt="Play Quaked — project banner" width="100%">
  </a>
</p>

# Quaked

**Quake, in your browser, looking the way it might if it were made today.** Quaked is the original 1996 game running on Three.js with no install and no plugin. Pick **Newer Game** and the same levels, monsters and weapons come with real lighting and shadows, water you can see through, explosions, flames and shotgun pellets you can watch fly, and new art for the walls, the enemies and the guns. Pick **New Game** and it keeps the original look and rules, apart from the web port's controls and softer, quieter teleporters.

Quaked is developed by [@codemeasandwich](https://github.com/codemeasandwich) and is based on [three-quake](https://github.com/mrdoob/three-quake) by [@mrdoob](https://github.com/mrdoob). The project lives at [codemeasandwich/Quaked](https://github.com/codemeasandwich/Quaked).

## Play

**[Play Quaked now](https://codemeasandwich.github.io/Quaked/)** in a recent browser with WebGL2 (a desktop is best; phones are covered below). It is developed in Chrome; Safari and Firefox have not been checked. From the main menu choose **Single Player**, then **Newer Game**. You start in a welcome hall; walk into the Easy, Normal or Hard corridor to choose the difficulty.

To run your own copy, serve this folder over HTTP and open it:

```sh
python3 -m http.server 8000
```

Then visit [localhost:8000](http://localhost:8000/). It needs internet access, because Three.js is loaded from a CDN.

## Which game do I pick?

| | New Game | Newer Game |
| --- | --- | --- |
| Look | The original Quake picture, untouched | Dynamic light, shadows, water, fire and explosions, new textures and skins |
| Rules | Original (the web port's controls and softer teleporters apply to both) | Original rules, with a few additions (a persistent body and dropped weapons when you die, a flashlight, shotgun damage that arrives with its pellets) |
| Levels | Load one at a time | Episode 1 levels join up: step through an archway and the next level is already there |
| Speed | Light | Heavier; the picture aims for 60 frames a second and lowers its resolution, down to half, when it cannot |

Newer Game's parts can be switched off one by one in **Options > Newer Game features**, and everything can be turned off from the console (`r_hdr 0`). If your browser cannot do the extra effects it falls back to the classic picture by itself.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move (you always run) |
| Mouse | Look; left button fires |
| Space | Jump |
| 1 to 8 | Choose a weapon |
| F | Flashlight (Newer Game) |
| Esc | Menu, options and saved games |
| ` (backtick) | Console |

Every key can be changed under Options. A game controller is supported, and so is touch:

### Phones and tablets

On a touch device the game shows on-screen controls. Held sideways the stick is on the left and the buttons on the right; held upright they sit in a panel along the bottom, with the status bar above it.

- **Stick** (left): up and down aim, left and right turn. `touch_strafe 1` makes left and right sidestep instead; `touch_turn` and `touch_aim` set the turning speed.
- **GO** (the big button in the bottom right corner): move forward. **FIRE** is straight above it, **JUMP** at 45 degrees up and to the left, and **WEAPON** to its left.
- **WEAPON** slows the game right down (`host_timescale`, single player), blurs the picture and lists the weapons you hold; tap one to choose it, or tap outside the list to close it.
- Dragging anywhere else on the screen looks around, and so does tilting the device. The pause button is at the top right.
- Newer Game starts with a wider view on a phone: `fov` 100 upright and 120 sideways (until you set your own `fov`; New Game keeps 90).

Options has separate **Sound Volume** (effects, environmental sounds and menus) and **Music Volume** (classic tracks and ambient music) sliders. Both settings are saved. Console equivalents are `volume` and `bgmvolume`. [Routing and verification](docs/audio-volume-controls-2026-10-02.md).


## Game data

The repository includes the free shareware `pak0.pak` (Episode 1). In your own local copy only (not the online page), you can add content from a Quake you own: copy the 2021 re-release's `id1/pak0.pak` to `resources/id1/pak0.pak`. It is read in addition to the shareware data and never uploaded or committed. So far only the first level of Episode 2 (E2M1, in Level Select) has been tried, the full campaign is not verified, and copies that split the data into `pak0.pak` and `pak1.pak` are not supported. [How it is loaded, what was tried and what is not covered](docs/fullgame-pak-2026-10-05.md).

## What Newer Game adds

A short tour; each line links the document that says how it was made and checked.

- **Light and shadow**: torches, lamps and lava light the rooms, with sun shafts, bloom and a shoulder flashlight. [Lighting](docs/emissive-lighting-2026-10-03.md), [flashlight](docs/flashlight-run-policy.md).
- **Water you can see into**: clear, tinted, muddy or toxic, with ripples, reflections and drops on the lens when you come out. [Water](docs/water-optics-2026-10-02.md).
- **Fire**: [explosions](docs/explosions-fireball-2026-10-08.md), [rocket smoke](docs/rocket-grenade-smoke-2026-10-08.md), [torch flames](docs/torch-fire-2026-10-08.md) and [shotgun pellets](docs/shotgun-pellets-2026-10-08.md) with muzzle smoke and underwater bubbles.
- **New art**: [wall textures](docs/level-texture-update-2026-10-02.md) with [relief](docs/continuous-rockfield-2026-10-02.md), [custom enemy skins](docs/enemy-heights-2026-10-01.md), [3D weapons and shells](docs/weapons-and-shells-2026-10-02.md), a [layered status-bar face](docs/gloom-hood-face-2026-10-04.md) and [real displacement on the demon plaques](docs/demon-displacement-2026-10-03.md).
- **Joined-up levels**: [seamless travel](docs/technical-notes.md#seamless-levels) and [live teleporter windows](docs/technical-notes.md#live-portals).
- **A Bestiary** that fills in as you meet each creature, [47 of them](docs/bestiary-complete-2026-10-04.md).
- **Death has a cost and a path back**: your weapons scatter where you fell and you [respawn with an axe](docs/clockwise-respawn-2026-10-04.md).
- **Sound**: quiet [ambient music](docs/ambient-music-2026-10-01.md) and [separate music and sound volume](docs/audio-volume-controls-2026-10-02.md).

Everything, in more detail: [technical notes](docs/technical-notes.md) (feature by feature, with the console variables) and the [documentation index](docs/index.md) (every document, by topic).

## Where it stands

Quaked is a working, playable project under active development, and has had little testing beyond its author's. Each feature's document records what was checked, including where no browser check was made, and its known limits. Several visual features are marked there as awaiting the owner's visual acceptance, the full game data is only partly tried (see Game data) and the Expansion/Dawn gameplay is unverified. Saved games and settings are kept in your browser. Pellets in flight when you save are lost.

## For developers

Source lives in `src/` (a JavaScript port of the Quake engine and its QuakeC virtual machine, with the Three.js renderer), tests in `tests/`, build and asset tools in `tools/`, and Newer Game's art and data in `newer/`. The docs are written so that a future contributor can continue the work: each says what a change is for, what it touches and what was checked. `python3 tests/docs_index_test.py` checks the links in this README, the index and the technical notes; `python3 tools/build_docs_index.py` rebuilds the index after you add a document. GitHub Pages publishes this folder from `main`; only committed files are deployed.

## License

Code: GPL v2. Quake is a trademark of id Software; the shareware data included is theirs.

### Upstream background

[Original three-quake development post](https://x.com/mrdoob/status/2015076521531355583). This is upstream background; the project repository is [codemeasandwich/Quaked](https://github.com/codemeasandwich/Quaked).


## Credits

- Quaked by [@codemeasandwich](https://github.com/codemeasandwich)
- Original game by id Software ([source](https://github.com/id-Software/Quake))
- Three.js port ([three-quake](https://github.com/mrdoob/three-quake)) by [@mrdoob](https://github.com/mrdoob) with [@claude](https://github.com/claude)

- Ambient music by **Iron Cthulhu Apocalypse**: *Hallucinations (Lovecraftian Dark Ambient Hour)* ([asset credits](music/CREDITS.txt)).
- Weapon models by **[小林 団那紀](https://sketchfab.com/dannaki_)** (the archives retain the original author metadata, 旦那気 大安 / dannaki_tayan).
- Shotgun-shell asset: only the shell from Weapon Pack is used. [Source and supplied license](newer/weapons/shell/license.txt).

