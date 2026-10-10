# Quaked technical notes

The detailed, per-feature description of what Newer Game adds, moved here from the README so the README can stay a short welcome. Each paragraph says what a feature does, names its console variables and links the document that records how it was built and checked. For a topic-by-topic list of every document in this folder see the [documentation index](index.md); to play, start with the [README](../README.md).

The text was moved from the README with these edits only: heading levels moved up one step, links made relative to this folder, the old "Assets" paragraph headed "Weapon models", a short "Running and publishing notes" section gathering four sentences from the README's start, and the out-of-date "replace pak0.pak" sentence dropped (see the README's Game data). Wording such as "owner visual acceptance is pending" is as it was.

Known inaccuracy carried over unchanged: [Newer Game options](#newer-game-options) says New Game has the original teleporters, but the softer teleporter launch (300 to 150 units/s) and the removed white particle burst apply in New Game too (`SV_SoftenTeleportLaunch` in `src/engine/server/sv_phys.js`, `src/engine/client/cl_tent.js`).

## Running and publishing notes

GitHub Pages publishes the repository root from `main`. `.nojekyll` keeps the game files as plain static assets; pushes to `main` trigger a new deployment. Only committed files are published.

While the game data downloads, the Quaked logo in the centre of the page fills from the bottom up in place of a loading bar. [Loading logo](loading-logo-2026-10-02.md).

The [upstream three-quake demo](https://mrdoob.github.io/three-quake/) is a separate build; it does not demonstrate the enhancements documented here.

Confirming **Quit** opens [this project's GitHub page](https://github.com/codemeasandwich/Quaked) in a new tab and returns the game to its main menu. Cancelling Quit stays in the game.

## Features

Newer Game's local [first-sighting bestiary](bestiary-2026-10-04.md) slows and pauses for a new enemy, frames it beside its folio, and resumes on a fresh key/shoot press. The menu book keeps discoveries across plays in this browser. Its [complete 47-creature artwork and dedication](bestiary-complete-2026-10-04.md) are installed: outer cover → dedication/inner illustration → Contents → individual creature pages with parchment backs. Complete Edition requires all 47 discoveries. Expansion/Dawn gameplay remains unverified.

Newer Game's local [persistent death remains](death-remains-2026-10-04.md) keep the player's body or actual gib pieces beside recoverable weapons. Axe-only stored ammo is held in one backpack; recovering the shotgun restores its exact remaining shells and selects it. Owner visual acceptance is pending.

The local [Gloom Hood layered face](gloom-hood-face-2026-10-04.md) composes head, gaze, expression, ten injury stages and independent powered eyes in Newer Game. Directional damage, sustained firing and occasional rewards drive its reactions; Classic keeps its original portraits. Owner visual acceptance is pending.

Newer Game's local [model lighting, persistent blood and water drying trial](model-lighting-blood-wet-2026-10-04.md) adds source-colored light and dynamic shadows to physical objects and held weapons. Player blood remains until water washes it away; the wet gun briefly shines as it dries. Verification and renderer limits are recorded in the feature document; owner visual acceptance is pending.

The local [water near-field correction](water-nearfield-2026-10-02.md) restores nearby Muddy transmission, strengthens transmitted caustics and checks individual reflected markers and shimmer. It remains pending owner visual acceptance.

### Live portals

Every teleporter surface (`*teleport`) that leads somewhere is a live camera onto its receiver. The world is rendered a second time from the destination, so the teleporter looks cut out of the wall with a slight shimmer, and what you see through it is the space you step into.

- Destinations come from the map's own entities (`trigger_teleport` → `info_teleport_destination`), so it works on any map.
- Up to 3 nearest visible portals are rendered per frame, at 75% resolution.
- `r_portals 0` in the console turns it off and restores the classic swirl.
- Teleporting is quieter: the sound stays, the white particle burst is gone, and the launch out of the teleporter is halved (300 to 150 units/s).
- In local single player, visibility includes the teleporter destination, so entities and secrets visible through its window are sent to the renderer. A remote server must also supply those entities.
- Limits: a portal seen through another portal shows the plain swirl; portals are off in WebXR. Camera portals are enabled for Newer Game and can be disabled in its feature options.

### Newer Game options

New Game is always the original game: original lighting, water, monsters and teleporters, with no camera portals. In Newer Game, **Options > Newer Game features** switches its parts on and off one at a time: lighting, normal maps and parallax (`r_newer_normals`), liquids (`r_newer_water`, independent of lighting), enemies (the custom upsampled skins), camera portals (the teleporter windows and the seamless level crossings; these apply from the next level) and textures (our own higher resolution wall textures, `r_newer_textures`; see `newer/textures`, made with `tools/texture_sheets`) the shadows of enemies and items (`r_newer_shadows`; fires standing in a brazier or cauldron also darken the floor under them, and torches and fires flicker) and the status bar (`r_newer_hud`, higher resolution status bar sprites from `newer/hud`). The console variables are `r_newer_lighting`, `r_newer_normals`, `r_newer_water`, `r_newer_enemies`, `r_newer_portals`, `r_newer_textures`, `r_newer_hud` and `r_newer_shadows`.

The startup title demo compares enhanced and classic rendering at the same scene resolution on both halves, including resizing and dynamic-resolution scaling. Classic uses its original art, skins, lighting, opaque liquids and HUD; enhanced effects are isolated to the left. [Resolution verification](demo-resolution-2026-10-01.md), [classic isolation and verification](classic-demo-isolation-2026-10-01.md).

Advanced lighting follows the scene's dynamic resolution too: its rays and bounce sampling run at the scene target size, then a cheap display pass converts colour and applies brightness/contrast. This removes the former full-display lighting bottleneck when the scene had already scaled down. [Lighting performance investigation and measured results](lighting-performance-2026-10-01.md).

Options now puts Newer Game features first, Performance profiler above Go to console, and FPS counter above Texture Filtering. Same-level camera portals retain approach angle, lateral position and momentum using their preview's transform. Flashlight shading retains unlit material colour separately from baked lighting, so genuinely unlit surfaces can stay black and recover their own texture colours under the beam. [Implementation and verification](options-portals-flashlight-2026-10-01.md).

### Getting the next level ready

When the player comes within about 900 units of an exit (a doorway, archway, pit or teleporter pad), the level behind it is prepared a few milliseconds per frame: its map is read, its own textures fetched and decoded, its monsters' and items' models loaded, and the relief maps of its textures made. The real level change then only has to put the level together. In a test the level build after a change took about 40% less work on the main thread. (Loading the files themselves is not the cost: the game's data is already in memory.)

### Frame rate

**FPS counter:** Options > FPS counter (`cl_showfps 1`) shows the frame rate, frame time and, when it is below full, the resolution scale in the top right corner.

**Performance profiler:** Options > Performance profiler (or `perfprofile`, or `perfprofile 200` for the first 200 frames of each demo) plays the three demos back to back as fast as the machine will run them and times every frame, cut into stages (game logic, scene build, windows onto other levels, world draw, sun shadow, light shafts, bloom, the final lighting pass, overlays, the 2D screen). Each stage waits for the graphics card, so it shows where the time goes rather than the exact frame rate of normal play. It runs at full resolution (the dynamic resolution is off while it runs). Profiling always uses the enhanced view once per main camera frame, preserving the selected enhancement options; the enhanced/classic split belongs only to the idle title loop. The prior mode, comparison and resolution/FPS settings are restored afterward, while reports retain the mode actually measured. [Render-mode correction and verification](profiler-demo-mode-2026-10-02.md). The report, with per-demo frame rates, 1% lows, the worst frames, draw calls and triangles, the share of each stage and the bottlenecks with what to do about them, goes to the console (`perfreport` prints it again) and is downloaded as a JSON file. Opening the menu (Esc) stops it early (`perfstop`); either way the report so far is printed and a JSON file is downloaded automatically, to send in for review.

Newer Game aims for 60 frames a second (`r_fps_target`). When frames take longer than that allows, the 3D picture is drawn at a lower resolution (down to half) and scaled up to fill the screen, and it creeps back up when there is room; the status bar and text stay sharp. `r_dynres 0` turns this off and always draws at full resolution.

### Lighting and muzzle flash

Newer lighting is lit by its sources: the baked light is curved (`r_newdark`, 2.8 by default; 1 is as baked) so areas with no clear source are dark, and lights (torches, pillar lamps, glowing surfaces) light the surfaces they can see, with things in the way casting shadows. Weapons have a muzzle flash that lights the room: a brief flash of warm light around the player (light only, nothing drawn at the barrel), reduced in already bright rooms. Added light retains the colour of the surface it hits. Sun shadows use geometry from the whole map, preventing unseen walls from leaking sunlight into closed rooms. Shots leave bullet holes on walls, rockets leave scorch marks, and blood (from gibs, hits and blood spray) lands and sticks to walls and floors (Options > Newer Game features > Marks and blood, `r_decals`). These marks follow the surface lighting rather than glowing in dark rooms. A shoulder-mounted flashlight (key F, `flashlight`, or Options > Newer Game features) throws a cone of light and a faint beam that trails your aim by a fraction of a second. Corners and edges where surfaces really meet at an angle get a slight accent (inside corners darken, outer edges catch light; `r_newedges`, 0 turns it off), and never on flat faces cut into several pieces. Edge accents are suppressed underwater and through pools. Monsters glide between the game's ten-a-second steps as well as blending between their poses, so they move smoothly.

### Explosions

In Newer Game every explosion (rockets, grenades, tar babies, colour-mapped blasts and exploding boxes) is the supplied "Fireball": a white flash, a rolling orange fireball that cools into smoke (semi-transparent, `r_fireballalpha`, default 0.7), falling sparks, a shock ring that always faces the camera, and a warm light that follows the same curve. [Boxes, the ring and the transparency](explosions-unified-2026-10-09.md). It replaces only the picture; sound, damage, timing and the scorch mark are unchanged. Classic Quake keeps its original particles, as does Newer Game with `r_fireball 0`. At most six fireballs are live at once (while the oldest is under 1.5 s old, a further explosion uses the original particles), and they clear on every level change. In the title demo's Newer | Classic split, the enhanced half shows the Fireball and the classic half the original explosion. See `docs/explosions-fireball-2026-10-08.md`.

Rocket and grenade trails use the supplied smoke too: a thin, soft wisp that follows the missile, spaced by distance so it looks the same at any frame rate, with a small exhaust glow behind a rocket (`r_smoketrails 0` brings back the original trail; Classic Quake always has it). See `docs/rocket-grenade-smoke-2026-10-08.md`.

Torches and fire pits get the supplied flame as well: a living, noise-eroded flame that stays upright and faces you, with rising embers and a wisp of smoke, sized from each torch's own model (small and large pit flames differ) and laid over the original flame model so its glow gives the fire a body. The braziers and brackets are untouched and the light is still the map's own. Classic Quake keeps the original flames, as does Newer Game with `r_torchfire 0` (`r_torchfire 2` replaces the original flame with the supplied one, keeping a wall torch's handle). See `docs/torch-fire-2026-10-08.md`.

Shotgun and super shotgun blasts (and the soldiers' shotguns) show the supplied pellets in single-player Newer Game: small glowing streaks, flying at twice the supplied speed from the gun's muzzle along the very rays the game traced, and the shot's damage, blood and puffs arrive when the pellets do, like a nail or a rocket landing (`sv_shotdelay 0` keeps the instant hitscan). In air each barrel also leaves a few tiny wisps of muzzle smoke that drift up a short way; under water the pellets instead slow, leave a wake of small rising bubbles, and a few bubbles escape the muzzle. Ammunition, spread and firing cadence are untouched; Classic Quake, demos, remote and multiplayer games are unchanged, and `r_shotgunfx 0` turns the picture off. See `docs/shotgun-pellets-2026-10-08.md`.

The held super nailgun's barrels no longer stop dead when you let go: they keep turning and slow smoothly to a stop, and start again from where they are. See `docs/super-nailgun-coast-2026-10-08.md`.

### Lens drops, lava glow and level changes

Coming out of water leaves the view beaded with clear drops that refract and slightly blur the picture, some running down before they dry; being close to a body bursting does the same with blood. Drops clear quickly and are suppressed underwater. Lava glows and breathes, and lights what is around it. In Newer Game, loading or changing level no longer automatically opens the console. Changing level keeps the last frame on screen; it is simply the new level when it is ready.

### Seamless levels

In Newer Game, every Episode 1 level exit that is an archway, a passageway, a walk-through portal or a pit (that includes the start hub's difficulty doors and E1M4's secret exit) is a live window onto the next level: you can see its first room through the opening, and stepping through is not a level load or a teleport. You keep your speed and heading, and the game switches levels under you. Archways are crossed at the arch itself: the tunnel behind it is not walked (the window sits where the arch is) and unlocked doors across it are removed, while a locked key door stays; pits keep their fall. Looking back, the level you came from shows through the doorway behind you, and you can walk back through it (a level you have left is kept exactly as it was: dead monsters where they fell, dropped weapons, picked-up items and opened doors; a key door across the exit you return by is removed). The windows render the destination's real sky and show the level's monsters, items, torches, doors and secret or false walls (a level you have been in as you left it). Looking down into water shows what lies under it, secrets included. A teleporter pad (any exit with a slipgate machine or the swirling teleporter surface at it, including the remaining episode slipgates and the exit of E1M1) stays a pad: stepping on it changes level at once, with no intermission or loading screen, the picture the player was seeing is copied, and that copy stretches upwards and splits into red, green and blue (animated by the browser, so it keeps moving while the next level loads behind it); when the new level is up the copy goes and the new level's colours come together at once. The way back through a doorway is only offered where the level you arrive in has a doorway, archway or portal there to come back through; otherwise there is none, and you go on. Console: `sv_seamless 0` off, `1` Newer Game only (default), `2` always. Single player only.

### New Game and Newer Game

An optional local owned `resources/id1/pak0.pak` now supplies missing native
content while bundled programs and startup worlds retain priority. The existing
Level Select exposes E2M1 when present in that archive. See the
[full-game loading trial, checks and limits](fullgame-pak-2026-10-05.md).

The single-player menu's added **Newer Game** and **Level Select** labels use the original game's letter sprites, composed once with measured spacing and baselines. The original New Game, Load and Save art and the five selection rows are preserved. [Menu lettering fix and verification](single-player-menu-2026-10-01.md).

The single player menu has two ways to start:

- **New Game** uses the classic lighting, exactly as before.
- **Newer Game** switches on the HDR lighting pipeline: emissive surfaces (lava, light panels, glowing runes, torch flames, sky) can be brighter than white and bloom, and nearby lights, emissive surfaces and dynamic lights scatter through the air as volumetric light with shafts carved out by pillars and grates.

The sky sets the mood. Its brightness, colour and pattern are read from the map's own sky textures: a bright clear sky gives a bright sunlit outdoors with little haze, a dark or stormy one gives dimmer light, faint shafts and a little more haze. Shafts follow the sky's pattern (the clouds are projected along the sun, so shafts and sunlit patches break up the way the sky does) and only build up where light is contrasted with shade, so open daylight stays clear.

**Options > Newer Game features** has separate **Newer lighting**, **Normal maps**, and **Newer liquids** switches. Each takes effect on the next rendered frame; switching lighting off leaves the other two choices intact. With lighting off, the original baked lighting is used, normal maps retain their parallax relief and response to native dynamic lights, and liquids retain transparency, absorption, caustics, reflections and heat haze. Advanced sun/torch relighting, glow boosts, bloom, light shafts, bounce lighting and colour grading follow the lighting switch. The flashlight and enhanced enemy/item shadows still need that lighting. New Game remains the original look. See [visual options implementation and verification](visual-options.md). The owner-supplied 2026-10-01 wizard texture update replaces twelve metal, stone and wood textures, with individually measured crops, alignment corrections and regenerated relief; [mapping and verification](wizard-textures-2026-10-01.md).

Every world texture gets a generated normal map and a height map (see `src/newer/render/gl_normals.js`), so bricks, cracks and grain have relief that reacts to the sun, torches and dynamic lights, with parallax that shifts the texture as you move. Matching crafted height assets are loaded when available; the fallback estimates height from Quake's texture brightness, which includes painted-in shading. It is normalised for contrast, blended across several scales so blocks read as blocks and not just noise, and made tileable. It is generated once per texture the first time Newer Game needs it (the cost depends on the map and hardware). Enemy bodies, heads and gibs have their own height-driven normal maps; the other item models, sprites, sky and water are not covered by the world normal-map generator.

Water and slime become see-through: the bottom of a pool shows through the surface, light is absorbed with depth (shallows stay clear, depths go dark and blue-green, slime green), and submerged floors get subdued animated caustics, strongly reduced on walls and near the surface. Visibility through water also includes entities and secrets, and looking out from inside a liquid remains clear. Lava stays opaque and glows. Water retains a moderate layer of its original colour and turbulent texture, lit by the local baked lighting, alongside animated, angle-dependent reflections and depth-guided refraction. The complete 152-frame RTX GIF was inspected as the motion reference; this renderer remains a raster approximation. [Implementation and verification](water-optics-2026-10-02.md). Flashlight-lit opaque surfaces now appear in screen-space water reflections, and the beam adds an angle-dependent ripple highlight. [Flashlight correction and checks](flashlight-water-2026-10-02.md). Options > Newer Game features > Water appearance selects Clear, Tinted, Muddy or Toxic; Map retains clear water and toxic slime. The looks vary transmission, sediment scattering, caustics and toxic glow/mist while preserving map contents. [Four-look authoring and verification](water-looks-2026-10-02.md). Grazing reflections now define the surface more strongly; still/Muddy ripples are calmer and caustics stronger. The underside has a Snell window/internal reflection and no duplicate contents tint in enhanced views. Captures use validated air points over real liquid polygons. [Surface-definition refinement](water-surface-definition-2026-10-02.md). Fast things that cross a pool's surface, and shots that hit a standing portal, leave rings ([impact ripples](impact-ripples-2026-10-09.md), `r_impactripples`).

Newer Game also:

- filters textures smoothly (linear and anisotropic), whatever `gl_texturemode` is set to; your own setting is left alone and comes back with the classic lighting;
- is graded 40% darker with 40% more contrast than its raw output (`r_newbright 0.6`, `r_newcontrast 1.4`; use 1 and 1 for the ungraded look);
- adds extra frames between model animation frames: Quake steps monsters and weapons through their poses ten times a second, and Newer Game blends between them so movement runs at your display's frame rate. `r_lerpmodels 0` turns it off, `1` (default) is Newer Game only, `2` forces it on in a normal classic game too; the demo comparison always disables enhancement interpolation on its classic half. It does not blend a model that has just come into view, teleported or changed model.

- uses the custom upsampled skins for the boss, demon, knight, ogre, shambler, soldier, wizard and zombie, fitted to the original models' skin layouts. Other enemy bodies and remaining head gibs keep their original Quake skins. The supplied Demon head, Dog head, Zombie gib and Shambler head now have fitted replacements with matching height maps; [mapping and verification](head-skins-2026-10-01.md). **Options > Newer Game features > Newer enemies** (`r_newer_enemies`) switches these replacements off; New Game always uses the originals. Replacement skins also work with Newer lighting disabled.

The third-party enemy skin pack, its leftover extracted source textures and shader, and its destructive rebuild importer have been removed. The game loads replacements only from the custom-skin manifest; no pack download link or pack loader is provided. The existing custom diffuse files retain their alignment; the Shambler uses the owner-supplied 2026-10-01 update fitted to its original UV layout. `newer/enemies/_unused/player_upscaled.webp` is preserved as an unused asset and is not loaded by the game.

`newer/enemies/index.json` is the skin manifest. To add a replacement, add its WebP file and a model entry with `dir`, `maps.diffuse`, and `flipGreen`; preserve the existing custom files and entries. Enemy variants also carry a grayscale `height` map, `heightStrength` and `heightCap`; runtime normals use the same skin UVs. Optional normal, luma and gloss maps remain supported by the existing loader. Missing entries, pending downloads and failed texture loads fall back to the original skin. The retained enemy models each have one replacement, so `r_newer_variety` has no visible effect. The owner-supplied Shambler update and height coverage are documented in [enemy skin and height verification](enemy-heights-2026-10-01.md). Heights cover original skins as well as replacements, including heads/gibs. `Normal maps` controls their relief independently of `Newer enemies`; visible relief shading uses Newer lighting. The custom Shambler now has reviewed blood-paint regions and separate wound/fold depth annotations; [height-authoring refinement and comparison](height-authoring-refinement.md).

To try the result, serve the repository, reload the game, start **Newer Game**, and compare a soldier or ogre with **Newer enemies** on and off. A dog keeps its original diffuse in both cases, with height relief available in Newer Game. No game data or model geometry is changed.

### Texture seams

The Newer Game wall textures no longer show dark lines where their repeats meet. The upscaler had left thin dark edges on many of them; each edge was compared with the original Quake texture and repaired in place, keeping every texture's size and alignment. Grooves the original texture has are kept. [What was found, what was left alone and how it was checked](texture-seams-2026-10-02.md); re-run with `python3 tools/texture_sheets/fix_seams.py` after regenerating replacements.

### Shambler footfalls

In Newer Game, each Shambler footstep shakes the floor: when its foot lands, the view gives one short shudder. The shudder is strongest beside it, fades with distance and is gone beyond 600 units. It is felt only while you are on the ground. The tremor follows the walk and run animation's heel strikes (measured from the model), not a timer. Several Shamblers together stay a small quake. `v_shamblersteps` (saved, default 1) scales it down; 0 turns it off. New Game and demos are unchanged. [Behaviour, design and verification](shambler-footfalls-2026-10-02.md).
## Rare crate pictures

In Newer Game one crate in 40 wears a different side picture (`src/newer/render/r_cratevariants.js`): a Dharma crate with a Half-Life graffiti crate on its other side, or an SCP crate with an SCP-and-graffiti one. Which crates change is chosen afresh each time the game starts (each page load), by the level and where the crate stands, and kept for the session, so a level looks the same on every visit. `r_newer_crates` sets the odds (40 = one in 40, 0 = never; applies from the next level). Ordinary crates also choose among three more common pictures (an eagle, a winged bolt and a winged skull) and their own, all four sides alike. Only the crate sides change: the tops do not. `r_newer_crates 0` switches all of this off.

## The Newer Game pack

Newer Game's art and data (`newer/textures`, `newer/enemies`, `newer/hud`, and their `index.json` manifests) can be packed into one ordinary Quake pak, `newer.pak`, next to `pak0.pak`:

    python3 tools/build_newer_pak.py

The game loads `newer.pak` when it is there and reads the art out of it; without it (a plain checkout) it reads the loose files in `newer/`, exactly as before. The pack is only visible while Newer Game is on, so New Game is still just `pak0.pak`. Files keep their names (`newer/textures/index.json`), so nothing else changes. Put the pack anywhere a web server serves it from; it is a single download that the browser can cache.

The pack can also carry per-map files, from `newer/maps/` (stored as `maps/<name>`), which the game finds like its own maps: `e1m1.lit` gives a level coloured lightmaps (RGB light from ericw-tools' `light -lit`, with bounce and sun if you like; used in Newer Game with the lighting pipeline) and `e1m1.ent` replaces the level's entity list (for example to add a `_sun_mangle` to the worldspawn, or lights; also used when working out which exits lead where). Neither exists yet for the shipped maps.

You can switch at any time from the console: `r_hdr 0` (classic) or `r_hdr 1` (newer). `r_bloom`, `r_volumetric` and `r_caustics` set the strength of each effect.

This is a rasterised approximation, not path tracing: light does not bounce, and point-light occlusion uses on-screen depth. Sun shadows and sun shafts use the full-map shadow geometry. It needs WebGL2 float render targets; without them the classic path is used automatically, and it is off in WebXR.

### Stability fixes

Walking into a wall corner no longer crashes when a collision trace has no plane. Lava keeps its colour and glow, and liquid rendering no longer blacks out the view when looking out from within a pool.

## Console wallpaper

The console (and the main menu backdrop shown when no game is running) uses `conback.webp` instead of the original stone `conback.lmp`. It is cropped to fill the screen without stretching. To go back to the original, delete `conback.webp`.

## Verification of the skin and Quit changes

Removal verification (2026-09-30): all 78 imported pack files, including its credits file, are absent; all six retained WebP images match the pre-removal Git version byte-for-byte and decode successfully. Independent review passed. The 14 skin/animation tests passed using a Node 24 compatibility harness because Deno was unavailable; a mocked texture loader also verified all five custom material paths, lighting independence, the enemy toggle, and New Game fallback. Browser/WebGL appearance has not been visually verified. With Deno installed, the focused suite is `deno test --allow-read tests/r_newerskins_test.js tests/r_anim_test.js`.

Seven public-menu scenarios also passed using Node with a mocked `window.open`: Escape, n and N cancel; y and Y confirm; touch supports both confirmation and cancellation. Confirmation opens this project's GitHub URL in a new tab and returns to the main menu. Actual browser navigation and popup policy were not exercised. These checks cover the menu's Quit action; console `quit` retains its existing shutdown behavior.
## Weapon models

Newer Game keeps the original axe mesh and texture, and uses the supplied 3D shotgun, super shotgun, super nailgun, grenade launcher, rocket launcher and thunderbolt for held weapons and their existing pickups. Each role is calibrated to the original weapon and retains native entity transforms and animation timing. The held super nailgun rotates only its four barrel assemblies about their shared axis; its body and common rear ring stay fixed, and interpolation preserves barrel shape. Owner refinements correct the rocket's forward direction and move its held model back slightly, fit the held grenade barrel's rings/profile, grade the supplied super-shotgun barrel textures, and give the lightning gun brown wires with its original body texture wrapped on a partly transparent chamber. Shotguns eject one casing per shot; the super shotgun ejects two (one when only one shell remains). Casings fall, bounce and remain without expiry, survive level return, and are included in browser saves. `r_newer_weapons 0` restores original weapon art and hides casings. [Implementation, fitting measurements, credits and verification](weapons-and-shells-2026-10-02.md). [Local gameplay trial](http://localhost:8013/tests/weapon_gameplay_trial.html) and [fit gallery](http://localhost:8013/tests/weapon_models_trial.html) remain pending owner visual acceptance.
## Newer Game ambience

Newer Game streams **Hallucinations (Lovecraftian Dark Ambient Hour)** by **Iron Cthulhu Apocalypse** quietly in the background. Safe movement away from living enemies produces occasional gentle volume swells; combat or nearby enemies keep it at the quiet background level. It picks randomized 20-minute sections and crossfades over 12 seconds, rather than playing the hour-long recording straight through. Classic games and title demos are silent.

Both the existing sound-volume slider (`volume`) and `bgmvolume` govern it; `bgmvolume 0` disables it. Menus, pause, death, intermission, hidden tabs and loading pause playback. Deploy `music/ambient.mp3` alongside the game, outside `newer.pak`. The artist appears on the Credits screen. [Implementation, controls and verification](ambient-music-2026-10-01.md).

## More Newer Game features

Newer Game gives the three artifact pickups distinct shader effects: the retained white flames with gently pulsing blue Quad Damage illumination, yellow flames and a view-relative dark shroud for invulnerability, and animated yellow flame projections around the invisibility ring. `r_powerups 0`/`1` compares the layer; Classic and pickup gameplay stay native. [Original flame implementation](powerup-flames-2026-10-04.md), [blue Quad port, verification and trials](quad-blue-effect-2026-10-05.md).

Newer Game adds a separate continuous procedural relief field to natural rock throughout cliffs, tunnels and caves, with gentle soil detail, preserving the original textures and collision geometry. `r_rockfield 0`/`1` compares the layer. [Implementation, limits and trial](continuous-rockfield-2026-10-02.md). [Continuity and lighting correction, current verification and remaining limits](rockfield-correction-2026-10-04.md).

Newer Game now activates the flashlight at the Easy/Normal corridor entrances and brings in E1M1’s exit-machine sound along its approach ramp. The welcome hall’s Episode 1 machine is replaced by a one-way passage into E1M1. Measured arch depth is preserved, with outgoing crossings at the far face and reachable return thresholds in front of hidden bars. Fatal quad axe hits split the enemy along the native blade’s swing plane; quad plus pentagram makes axe strikes gib damageable enemies. Saves and return views retain the cut remains. [Implementation, native verification and playable trials](welcome-travel-axe-2026-10-04.md).

Newer water uses restrained ripple/refraction distortion. Wall detail filters subpixel height shadows and replacement pigment grain, with bounded fallback normals. [Correction and verification](water-wall-restraint-2026-10-04.md).

Newer Game deaths scatter every carried ranged weapon with conserved ammunition, remove power-ups, and use a continuous clockwise fall/contact/respawn/rise. Respawn gives only an axe, and 100 health on Easy, Hard and Nightmare or, on Normal, [a falling amount (90 down to 60, topped up by new levels)](respawn-health-2026-10-09.md); living enemies learn the starting position, and a Fiend (Normal) or Shambler (Hard, Nightmare) is left at the death location ([guard monster](respawn-guard-2026-10-09.md), `sv_respawnguard`). The way back to the previous level shuts once the respawn lands ([return arch closed](respawn-return-closed-2026-10-09.md)). Uncollected drops persist through deaths, saves and level travel. [Implementation, coordinate interpretation, verification and native trial](clockwise-respawn-2026-10-04.md).

Welcome-level brown rock breaks up its painted horizontal repeats with a continuous shader sampling offset while preserving original texture pixels and geometry. [Implementation, native comparison and verification](rock-wall-bands-2026-10-04.md).

Normal Newer Game and Newer Level Select enable the full enhancement baseline before loading, including saved rock relief and power-up effects. Title comparison settings preserve player preferences across configuration saving. [Startup fix, native verification and controls](newer-game-startup-2026-10-04.md).

Fresh Newer welcome starts with flashlight and crosshair off. Easy corridor entry enables both, Normal enables only the flashlight, and Hard enables neither. Direct levels, load, respawn and travel retain current choices. [Policy, native trigger/save verification and playable comparison](welcome-aids-2026-10-04.md).

The [studio logo](studio-logo-2026-10-04.md) appears at the bottom-right of the initial black loading screen and active game menus, with responsive safe-area placement and a smaller footprint beside the Bestiary when needed.

The [progressive Bestiarium](bestiary-progress-2026-10-04.md) uses authored heading crops over blank locked-entry bodies, reveals five inner-cover pieces from their matching discoveries, and uses the revised dedication and menu sheet.

Bubbled stained-glass materials use donor or generated normal/height maps across the base game and installed resource expansions, with pane-scoped live-light highlights and native Classic rendering. [Coverage, source identities, verification and trial](glass-materials-2026-10-05.md).

The regular nailgun now uses the supplied Quake archive model in Newer Game, including all nine held firing poses and its matching pickup. Classic and the weapon-art switch retain native art. [Source fidelity, verification and trials](nailgun-source-2026-10-05.md).
