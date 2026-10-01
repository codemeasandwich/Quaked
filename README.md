<p align="center">
  <a href="https://codemeasandwich.github.io/Quaked/">
    <img src="docs/images/quaked-banner.png" alt="Play Quaked — project banner" width="100%">
  </a>
</p>

Quake in the browser, built on Three.js. Quaked is developed by [@codemeasandwich](https://github.com/codemeasandwich) and is based on [three-quake](https://github.com/mrdoob/three-quake) by [@mrdoob](https://github.com/mrdoob).

**Project repository: [codemeasandwich/Quaked](https://github.com/codemeasandwich/Quaked).** The enhancements below describe this repository's version.

### Play online

[Play Quaked](https://codemeasandwich.github.io/Quaked/) on GitHub Pages. Choose **Newer Game** for the enhancements described below.

GitHub Pages publishes the repository root from `main`. `.nojekyll` keeps the game files as plain static assets; pushes to `main` trigger a new deployment. Only committed files are published.

### Play this version locally

From the root of this checkout, serve the files over HTTP:

```sh
python3 -m http.server 8000
```

Open [localhost:8000](http://localhost:8000/) and choose **Newer Game** from the single-player menu to use the enhancements. **New Game** selects the classic presentation. Internet access is needed for the Three.js modules loaded from the CDN.

[Upstream three-quake demo](https://mrdoob.github.io/three-quake/) is a separate build; it does not demonstrate the enhancements documented here.

Confirming **Quit** opens [this project’s GitHub page](https://github.com/codemeasandwich/Quaked) in a new tab and returns the game to its main menu. Cancelling Quit stays in the game.

### Features

#### Live portals

Every teleporter surface (`*teleport`) that leads somewhere is a live camera onto its receiver. The world is rendered a second time from the destination, so the teleporter looks cut out of the wall with a slight shimmer, and what you see through it is the space you step into.

- Destinations come from the map's own entities (`trigger_teleport` → `info_teleport_destination`), so it works on any map.
- Up to 3 nearest visible portals are rendered per frame, at 75% resolution.
- `r_portals 0` in the console turns it off and restores the classic swirl.
- Teleporting is quieter: the sound stays, the white particle burst is gone, and the launch out of the teleporter is halved (300 to 150 units/s).
- In local single player, visibility includes the teleporter destination, so entities and secrets visible through its window are sent to the renderer. A remote server must also supply those entities.
- Limits: a portal seen through another portal shows the plain swirl; portals are off in WebXR. Camera portals are enabled for Newer Game and can be disabled in its feature options.

#### Newer Game options

New Game is always the original game: original lighting, water, monsters and teleporters, with no camera portals. In Newer Game, **Options > Newer Game features** switches its parts on and off one at a time: lighting, normal maps and parallax (`r_newer_normals`), liquids (`r_newer_water`, independent of lighting), enemies (the custom upsampled skins), camera portals (the teleporter windows and the seamless level crossings; these apply from the next level) and textures (our own higher resolution wall textures, `r_newer_textures`; see `newer/textures`, made with `tools/texture_sheets`) the shadows of enemies and items (`r_newer_shadows`; fires standing in a brazier or cauldron also darken the floor under them, and torches and fires flicker) and the status bar (`r_newer_hud`, higher resolution status bar sprites from `newer/hud`). The console variables are `r_newer_lighting`, `r_newer_normals`, `r_newer_water`, `r_newer_enemies`, `r_newer_portals`, `r_newer_textures`, `r_newer_hud` and `r_newer_shadows`.

The startup title demo compares enhanced and classic rendering at the same scene resolution on both halves, including resizing and dynamic-resolution scaling. Classic uses its original art, skins, lighting, opaque liquids and HUD; enhanced effects are isolated to the left. [Resolution verification](docs/demo-resolution-2026-10-01.md), [classic isolation and verification](docs/classic-demo-isolation-2026-10-01.md).

Advanced lighting follows the scene's dynamic resolution too: its rays and bounce sampling run at the scene target size, then a cheap display pass converts colour and applies brightness/contrast. This removes the former full-display lighting bottleneck when the scene had already scaled down. [Lighting performance investigation and measured results](docs/lighting-performance-2026-10-01.md).

Options now puts Newer Game features first, Performance profiler above Go to console, and FPS counter above Texture Filtering. Same-level camera portals retain approach angle, lateral position and momentum using their preview's transform. Flashlight shading retains unlit material colour separately from baked lighting, so genuinely unlit surfaces can stay black and recover their own texture colours under the beam. [Implementation and verification](docs/options-portals-flashlight-2026-10-01.md).

#### Getting the next level ready

When the player comes within about 900 units of an exit (a doorway, archway, pit or teleporter pad), the level behind it is prepared a few milliseconds per frame: its map is read, its own textures fetched and decoded, its monsters' and items' models loaded, and the relief maps of its textures made. The real level change then only has to put the level together. In a test the level build after a change took about 40% less work on the main thread. (Loading the files themselves is not the cost: the game's data is already in memory.)

#### Frame rate

**FPS counter:** Options > FPS counter (`cl_showfps 1`) shows the frame rate, frame time and, when it is below full, the resolution scale in the top right corner.

**Performance profiler:** Options > Performance profiler (or `perfprofile`, or `perfprofile 200` for the first 200 frames of each demo) plays the three demos back to back as fast as the machine will run them and times every frame, cut into stages (game logic, scene build, windows onto other levels, world draw, sun shadow, light shafts, bloom, the final lighting pass, overlays, the 2D screen). Each stage waits for the graphics card, so it shows where the time goes rather than the exact frame rate of normal play. It runs at full resolution (the dynamic resolution is off while it runs). The report, with per-demo frame rates, 1% lows, the worst frames, draw calls and triangles, the share of each stage and the bottlenecks with what to do about them, goes to the console (`perfreport` prints it again) and is downloaded as a JSON file. Opening the menu (Esc) stops it early (`perfstop`); either way the report so far is printed and a JSON file is downloaded automatically, to send in for review.

Newer Game aims for 60 frames a second (`r_fps_target`). When frames take longer than that allows, the 3D picture is drawn at a lower resolution (down to half) and scaled up to fill the screen, and it creeps back up when there is room; the status bar and text stay sharp. `r_dynres 0` turns this off and always draws at full resolution.

#### Lighting and muzzle flash

Newer lighting is lit by its sources: the baked light is curved (`r_newdark`, 2.8 by default; 1 is as baked) so areas with no clear source are dark, and lights (torches, pillar lamps, glowing surfaces) light the surfaces they can see, with things in the way casting shadows. Weapons have a muzzle flash that lights the room: a brief flash of warm light around the player (light only, nothing drawn at the barrel), reduced in already bright rooms. Added light retains the colour of the surface it hits. Sun shadows use geometry from the whole map, preventing unseen walls from leaking sunlight into closed rooms. Shots leave bullet holes on walls, rockets leave scorch marks, and blood (from gibs, hits and blood spray) lands and sticks to walls and floors (Options > Newer Game features > Marks and blood, `r_decals`). These marks follow the surface lighting rather than glowing in dark rooms. A shoulder-mounted flashlight (key F, `flashlight`, or Options > Newer Game features) throws a cone of light and a faint beam that trails your aim by a fraction of a second. Corners and edges where surfaces really meet at an angle get a slight accent (inside corners darken, outer edges catch light; `r_newedges`, 0 turns it off), and never on flat faces cut into several pieces. Edge accents are suppressed underwater and through pools. Monsters glide between the game's ten-a-second steps as well as blending between their poses, so they move smoothly.

#### Lens drops, lava glow and level changes

Coming out of water leaves the view beaded with clear drops that refract and slightly blur the picture, some running down before they dry; being close to a body bursting does the same with blood. Drops clear quickly and are suppressed underwater. Lava glows and breathes, and lights what is around it. In Newer Game, loading or changing level no longer automatically opens the console. Changing level keeps the last frame on screen; it is simply the new level when it is ready.

#### Seamless levels

In Newer Game, every Episode 1 level exit that is an archway, a passageway, a walk-through portal or a pit (that includes the start hub's difficulty doors and E1M4's secret exit) is a live window onto the next level: you can see its first room through the opening, and stepping through is not a level load or a teleport. You keep your speed and heading, and the game switches levels under you. Archways are crossed at the arch itself: the tunnel behind it is not walked (the window sits where the arch is) and unlocked doors across it are removed, while a locked key door stays; pits keep their fall. Looking back, the level you came from shows through the doorway behind you, and you can walk back through it (a level you have left is kept exactly as it was: dead monsters where they fell, dropped weapons, picked-up items and opened doors; a key door across the exit you return by is removed). The windows render the destination's real sky and show the level's monsters, items, torches, doors and secret or false walls (a level you have been in as you left it). Looking down into water shows what lies under it, secrets included. A teleporter pad (any exit with a slipgate machine or the swirling teleporter surface at it, so the start hall's slipgates and the exit of E1M1 too) stays a pad: stepping on it changes level at once, with no intermission or loading screen, the picture the player was seeing is copied, and that copy stretches upwards and splits into red, green and blue (animated by the browser, so it keeps moving while the next level loads behind it); when the new level is up the copy goes and the new level's colours come together at once. The way back through a doorway is only offered where the level you arrive in has a doorway, archway or portal there to come back through; otherwise there is none, and you go on. Console: `sv_seamless 0` off, `1` Newer Game only (default), `2` always. Single player only.

#### New Game and Newer Game

The single-player menu's added **Newer Game** and **Level Select** labels use the original game's letter sprites, composed once with measured spacing and baselines. The original New Game, Load and Save art and the five selection rows are preserved. [Menu lettering fix and verification](docs/single-player-menu-2026-10-01.md).

The single player menu has two ways to start:

- **New Game** uses the classic lighting, exactly as before.
- **Newer Game** switches on the HDR lighting pipeline: emissive surfaces (lava, light panels, glowing runes, torch flames, sky) can be brighter than white and bloom, and nearby lights, emissive surfaces and dynamic lights scatter through the air as volumetric light with shafts carved out by pillars and grates.

The sky sets the mood. Its brightness, colour and pattern are read from the map's own sky textures: a bright clear sky gives a bright sunlit outdoors with little haze, a dark or stormy one gives dimmer light, faint shafts and a little more haze. Shafts follow the sky's pattern (the clouds are projected along the sun, so shafts and sunlit patches break up the way the sky does) and only build up where light is contrasted with shade, so open daylight stays clear.

**Options > Newer Game features** has separate **Newer lighting**, **Normal maps**, and **Newer liquids** switches. Each takes effect on the next rendered frame; switching lighting off leaves the other two choices intact. With lighting off, the original baked lighting is used, normal maps retain their parallax relief and response to native dynamic lights, and liquids retain transparency, absorption, caustics, reflections and heat haze. Advanced sun/torch relighting, glow boosts, bloom, light shafts, bounce lighting and colour grading follow the lighting switch. The flashlight and enhanced enemy/item shadows still need that lighting. New Game remains the original look. See [visual options implementation and verification](docs/visual-options.md). The owner-supplied 2026-10-01 wizard texture update replaces twelve metal, stone and wood textures, with individually measured crops, alignment corrections and regenerated relief; [mapping and verification](docs/wizard-textures-2026-10-01.md).

Every world texture gets a generated normal map and a height map (see `src/gl_normals.js`), so bricks, cracks and grain have relief that reacts to the sun, torches and dynamic lights, with parallax that shifts the texture as you move. Matching crafted height assets are loaded when available; the fallback estimates height from Quake's texture brightness, which includes painted-in shading. It is normalised for contrast, blended across several scales so blocks read as blocks and not just noise, and made tileable. It is generated once per texture the first time Newer Game needs it (the cost depends on the map and hardware). Enemy bodies, heads and gibs have their own height-driven normal maps; the other item models, sprites, sky and water are not covered by the world normal-map generator.

Water and slime become see-through: the bottom of a pool shows through the surface, light is absorbed with depth (shallows stay clear, depths go dark and blue-green, slime green), and submerged floors get subdued animated caustics, strongly reduced on walls and near the surface. Visibility through water also includes entities and secrets, and looking out from inside a liquid remains clear. Lava stays opaque and glows.

Newer Game also:

- filters textures smoothly (linear and anisotropic), whatever `gl_texturemode` is set to; your own setting is left alone and comes back with the classic lighting;
- is graded 40% darker with 40% more contrast than its raw output (`r_newbright 0.6`, `r_newcontrast 1.4`; use 1 and 1 for the ungraded look);
- adds extra frames between model animation frames: Quake steps monsters and weapons through their poses ten times a second, and Newer Game blends between them so movement runs at your display's frame rate. `r_lerpmodels 0` turns it off, `1` (default) is Newer Game only, `2` forces it on in a normal classic game too; the demo comparison always disables enhancement interpolation on its classic half. It does not blend a model that has just come into view, teleported or changed model.

- uses the custom upsampled skins for the boss, demon, knight, ogre, shambler, soldier, wizard and zombie, fitted to the original models' skin layouts. Other enemy bodies and remaining head gibs keep their original Quake skins. The supplied Demon head, Dog head, Zombie gib and Shambler head now have fitted replacements with matching height maps; [mapping and verification](docs/head-skins-2026-10-01.md). **Options > Newer Game features > Newer enemies** (`r_newer_enemies`) switches these replacements off; New Game always uses the originals. Replacement skins also work with Newer lighting disabled.

The third-party enemy skin pack, its leftover extracted source textures and shader, and its destructive rebuild importer have been removed. The game loads replacements only from the custom-skin manifest; no pack download link or pack loader is provided. The existing custom diffuse files retain their alignment; the Shambler uses the owner-supplied 2026-10-01 update fitted to its original UV layout. `newer/enemies/_unused/player_upscaled.webp` is preserved as an unused asset and is not loaded by the game.

`newer/enemies/index.json` is the skin manifest. To add a replacement, add its WebP file and a model entry with `dir`, `maps.diffuse`, and `flipGreen`; preserve the existing custom files and entries. Enemy variants also carry a grayscale `height` map, `heightStrength` and `heightCap`; runtime normals use the same skin UVs. Optional normal, luma and gloss maps remain supported by the existing loader. Missing entries, pending downloads and failed texture loads fall back to the original skin. The retained enemy models each have one replacement, so `r_newer_variety` has no visible effect. The owner-supplied Shambler update and height coverage are documented in [enemy skin and height verification](docs/enemy-heights-2026-10-01.md). Heights cover original skins as well as replacements, including heads/gibs. `Normal maps` controls their relief independently of `Newer enemies`; visible relief shading uses Newer lighting. The custom Shambler now has reviewed blood-paint regions and separate wound/fold depth annotations; [height-authoring refinement and comparison](docs/height-authoring-refinement.md).

To try the result, serve the repository, reload the game, start **Newer Game**, and compare a soldier or ogre with **Newer enemies** on and off. A dog keeps its original diffuse in both cases, with height relief available in Newer Game. No game data or model geometry is changed.

### Phones and tablets

On a touch device the game shows on-screen controls. Held sideways the stick is on the left and the buttons on the right; held upright they sit in a panel along the bottom, with the status bar above it.

- **Stick** (left): up and down aim, left and right turn. `touch_strafe 1` makes left and right sidestep instead; `touch_turn` and `touch_aim` set the turning speed.
- **GO** (the big button in the bottom right corner): move forward. **FIRE** is straight above it, **JUMP** at 45 degrees up and to the left, and **WEAPON** to its left.
- **WEAPON** slows the game right down (`host_timescale`, single player), blurs the picture and lists the weapons you hold; tap one to choose it, or tap outside the list to close it.
- Dragging anywhere else on the screen looks around, and so does tilting the device. The pause button is at the top right.
- Newer Game starts with a wider view on a phone: `fov` 100 upright and 120 sideways (until you set your own `fov`; New Game keeps 90).

### Rare crate pictures

In Newer Game one crate in 40 wears a different side picture (`src/r_cratevariants.js`): a Dharma crate with a Half-Life graffiti crate on its other side, or an SCP crate with an SCP-and-graffiti one. Which crates change is chosen afresh each time the game starts (each page load), by the level and where the crate stands, and kept for the session, so a level looks the same on every visit. `r_newer_crates` sets the odds (40 = one in 40, 0 = never; applies from the next level). Ordinary crates also choose among three more common pictures (an eagle, a winged bolt and a winged skull) and their own, all four sides alike. Only the crate sides change: the tops do not. `r_newer_crates 0` switches all of this off.

### The Newer Game pack

Newer Game's art and data (`newer/textures`, `newer/enemies`, `newer/hud`, and their `index.json` manifests) can be packed into one ordinary Quake pak, `newer.pak`, next to `pak0.pak`:

    python3 tools/build_newer_pak.py

The game loads `newer.pak` when it is there and reads the art out of it; without it (a plain checkout) it reads the loose files in `newer/`, exactly as before. The pack is only visible while Newer Game is on, so New Game is still just `pak0.pak`. Files keep their names (`newer/textures/index.json`), so nothing else changes. Put the pack anywhere a web server serves it from; it is a single download that the browser can cache.

The pack can also carry per-map files, from `newer/maps/` (stored as `maps/<name>`), which the game finds like its own maps: `e1m1.lit` gives a level coloured lightmaps (RGB light from ericw-tools' `light -lit`, with bounce and sun if you like; used in Newer Game with the lighting pipeline) and `e1m1.ent` replaces the level's entity list (for example to add a `_sun_mangle` to the worldspawn, or lights; also used when working out which exits lead where). Neither exists yet for the shipped maps.

You can switch at any time from the console: `r_hdr 0` (classic) or `r_hdr 1` (newer). `r_bloom`, `r_volumetric` and `r_caustics` set the strength of each effect.

This is a rasterised approximation, not path tracing: light does not bounce, and point-light occlusion uses on-screen depth. Sun shadows and sun shafts use the full-map shadow geometry. It needs WebGL2 float render targets; without them the classic path is used automatically, and it is off in WebXR.

#### Stability fixes

Walking into a wall corner no longer crashes when a collision trace has no plane. Lava keeps its colour and glow, and liquid rendering no longer blacks out the view when looking out from within a pool.

### Console wallpaper

The console (and the main menu backdrop shown when no game is running) uses `conback.webp` instead of the original stone `conback.lmp`. It is cropped to fill the screen without stretching. To go back to the original, delete `conback.webp`.

### Verification of the skin and Quit changes

Removal verification (2026-09-30): all 78 imported pack files, including its credits file, are absent; all six retained WebP images match the pre-removal Git version byte-for-byte and decode successfully. Independent review passed. The 14 skin/animation tests passed using a Node 24 compatibility harness because Deno was unavailable; a mocked texture loader also verified all five custom material paths, lighting independence, the enemy toggle, and New Game fallback. Browser/WebGL appearance has not been visually verified. With Deno installed, the focused suite is `deno test --allow-read tests/r_newerskins_test.js tests/r_anim_test.js`.

Seven public-menu scenarios also passed using Node with a mocked `window.open`: Escape, n and N cancel; y and Y confirm; touch supports both confirmation and cancellation. Confirmation opens this project's GitHub URL in a new tab and returns to the main menu. Actual browser navigation and popup policy were not exercised. These checks cover the menu's Quit action; console `quit` retains its existing shutdown behavior.

### Upstream background

[Original three-quake development post](https://x.com/mrdoob/status/2015076521531355583). This is upstream background; the project repository is [codemeasandwich/Quaked](https://github.com/codemeasandwich/Quaked).

### Assets

Shareware `pak0.pak` included (Episode 1).  
For the full game, replace with your own `pak0.pak` from a registered copy of Quake.

### License

Code: GPL v2

### Newer Game ambience

Newer Game streams **Hallucinations (Lovecraftian Dark Ambient Hour)** by **Iron Cthulhu Apocalypse** quietly in the background. Safe movement away from living enemies produces occasional gentle volume swells; combat or nearby enemies keep it at the quiet background level. It picks randomized 20-minute sections and crossfades over 12 seconds, rather than playing the hour-long recording straight through. Classic games and title demos are silent.

Both the existing sound-volume slider (`volume`) and `bgmvolume` govern it; `bgmvolume 0` disables it. Menus, pause, death, intermission, hidden tabs and loading pause playback. Deploy `music/ambient.mp3` alongside the game, outside `newer.pak`. The artist appears on the Credits screen. [Implementation, controls and verification](docs/ambient-music-2026-10-01.md).

### Credits

- Quaked by [@codemeasandwich](https://github.com/codemeasandwich)
- Original game by id Software ([source](https://github.com/id-Software/Quake))
- Three.js port ([three-quake](https://github.com/mrdoob/three-quake)) by [@mrdoob](https://github.com/mrdoob) with [@claude](https://github.com/claude)

- Ambient music by **Iron Cthulhu Apocalypse**: *Hallucinations (Lovecraftian Dark Ambient Hour)* ([asset credits](music/CREDITS.txt)).
