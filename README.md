# Quaked

Quake in the browser, built on Three.js. Quaked is developed by [@codemeasandwich](https://github.com/codemeasandwich) and is based on [three-quake](https://github.com/mrdoob/three-quake) by [@mrdoob](https://github.com/mrdoob).

### Play

https://mrdoob.github.io/three-quake/ (upstream three-quake build)

### Features

#### Live portals

Every teleporter surface (`*teleport`) that leads somewhere is a live camera onto its receiver. The world is rendered a second time from the destination, so the teleporter looks cut out of the wall with a slight shimmer, and what you see through it is the space you step into.

- Destinations come from the map's own entities (`trigger_teleport` → `info_teleport_destination`), so it works on any map.
- Up to 3 nearest visible portals are rendered per frame, at 75% resolution.
- `r_portals 0` in the console turns it off and restores the classic swirl.
- Teleporting is quieter: the sound stays, the white particle burst is gone, and the launch out of the teleporter is halved (300 to 150 units/s).
- Limits: entities the server doesn't send near you (monsters, other players at the receiver) don't appear in the window; a portal seen through another portal shows the plain swirl; portals are off in WebXR.

#### Newer Game options

New Game is always the original game: original lighting, water, monsters and teleporters, with no camera portals. In Newer Game, **Options > Newer Game features** switches its parts on and off one at a time: lighting, water (needs the lighting), enemies (the Quake Reforged skins) and camera portals (the teleporter windows and the seamless level crossings; these apply from the next level). The console variables are `r_newer_lighting`, `r_newer_water`, `r_newer_enemies` and `r_newer_portals`.

#### Lighting and muzzle flash

Newer lighting is lit by its sources: the baked light is curved (`r_newdark`, 2.8 by default; 1 is as baked) so areas with no clear source are dark, and lights (torches, pillar lamps, glowing surfaces) light the surfaces they can see, with things in the way casting shadows. Weapons have a muzzle flash: a brief flash of warm light around the player (light only, nothing drawn at the barrel). Shots leave bullet holes on walls, rockets leave scorch marks, and blood (from gibs, hits and blood spray) lands and sticks to walls and floors (Options > Newer Game features > Marks and blood, `r_decals`). A shoulder-mounted flashlight (key F, `flashlight`, or Options > Newer Game features) throws a cone of light and a faint beam that trails your aim by a fraction of a second. Corners and edges where surfaces really meet at an angle get a slight accent (inside corners darken, outer edges catch light; `r_newedges`, 0 turns it off), and never on flat faces cut into several pieces. Monsters glide between the game's ten-a-second steps as well as blending between their poses, so they move smoothly.

#### Lens drops, lava glow and level changes

Coming out of water leaves the view beaded with drops that bend the picture, some running down before they dry; being close to a body bursting does the same with blood. Lava glows and breathes, and lights what is around it. Changing level keeps the last frame on screen and shows no console; it is simply the new level when it is ready.

#### Seamless levels

In Newer Game, every Episode 1 level exit that is an archway, a passageway, a walk-through portal or a pit (that includes the start hub's difficulty doors and E1M4's secret exit) is a live window onto the next level: you can see its first room through the opening, and stepping through is not a level load or a teleport. You keep your speed and heading, and the game switches levels under you. Archways are crossed at the arch itself: the tunnel behind it is not walked (the window sits where the arch is) and unlocked doors across it are removed, while a locked key door stays; pits keep their fall. Looking back, the level you came from shows through the doorway behind you, and you can walk back through it (a level you have left is kept exactly as it was: dead monsters where they fell, dropped weapons, picked-up items and opened doors; a key door across the exit you return by is removed). The windows show the level's monsters, items, torches, doors and secret or false walls (a level you have been in as you left it). Looking down into water shows what lies under it, secrets included. Teleporter pads are unaffected. Console: `sv_seamless 0` off, `1` Newer Game only (default), `2` always. Single player only.

#### New Game and Newer Game

The single player menu has two ways to start:

- **New Game** uses the classic lighting, exactly as before.
- **Newer Game** switches on the HDR lighting pipeline: emissive surfaces (lava, light panels, glowing runes, torch flames, sky) can be brighter than white and bloom, and nearby lights, emissive surfaces and dynamic lights scatter through the air as volumetric light with shafts carved out by pillars and grates.

The sky sets the mood. Its brightness, colour and pattern are read from the map's own sky textures: a bright clear sky gives a bright sunlit outdoors with little haze, a dark or stormy one gives dimmer light, faint shafts and a little more haze. Shafts follow the sky's pattern (the clouds are projected along the sun, so shafts and sunlit patches break up the way the sky does) and only build up where light is contrasted with shade, so open daylight stays clear.

Every world texture gets a generated normal map and a height map (see `src/gl_normals.js`), so bricks, cracks and grain have relief that reacts to the sun, torches and dynamic lights, with parallax that shifts the texture as you move. Nothing is shipped or painted by hand: Quake's textures are painted with their shading baked in, so brightness is used as height. It is normalised for contrast, blended across several scales so blocks read as blocks and not just noise, and made tileable. It is generated once per texture the first time Newer Game needs it (about 85 ms for a whole level). Monster and item models, sprites, sky and water are not normal mapped.

Water and slime become see-through: the bottom of a pool shows through the surface, light is absorbed with depth (shallows stay clear, depths go dark and blue-green, slime green), and the surfaces beneath get animated caustics. Lava stays opaque and glows.

Newer Game also:

- filters textures smoothly (linear and anisotropic), whatever `gl_texturemode` is set to; your own setting is left alone and comes back with the classic lighting;
- is graded 40% darker with 40% more contrast than its raw output (`r_newbright 0.6`, `r_newcontrast 1.4`; use 1 and 1 for the ungraded look);
- adds extra frames between model animation frames: Quake steps monsters and weapons through their poses ten times a second, and Newer Game blends between them so movement runs at your display's frame rate. `r_lerpmodels 0` turns it off, `1` (default) is Newer Game only, `2` forces it on in the classic lighting too. It does not blend a model that has just come into view, teleported or changed model.

- gives the monsters the **Quake Reforged** skins (see `newer/enemies/CREDITS.txt`): high resolution skins with normal maps (so the sun and torches light the scales and stitching), glow maps and a wet sheen. There are 33 skins for 26 models, including head gibs, and every monster picks one of its model's skins at random, once per monster per level, so a crowd of zombies is not a crowd of clones (`r_newer_variety 0` always uses the first). The classic lighting keeps the original skins. Models the shareware data does not include (Enforcer, Rotfish, Shub-Niggurath, Hell Knight, Fiend...) will use them when you run the full game.

To add or replace skins, put the extracted downloads in one folder and run `python3 tools/build_newer_assets.py THAT_FOLDER`. It converts them to WebP, generates normal maps for skins that lack one, and rewrites `newer/enemies/index.json`.

You can switch at any time from the console: `r_hdr 0` (classic) or `r_hdr 1` (newer). `r_bloom`, `r_volumetric` and `r_caustics` set the strength of each effect.

This is a rasterised approximation, not path tracing: light does not bounce, and shafts are occluded by what is on screen. It needs WebGL2 float render targets; without them the classic path is used automatically, and it is off in WebXR.

### Console wallpaper

The console (and the main menu backdrop shown when no game is running) uses `conback.webp` instead of the original stone `conback.lmp`. It is cropped to fill the screen without stretching. To go back to the original, delete `conback.webp`.

### Dev Log

https://x.com/mrdoob/status/2015076521531355583 (upstream three-quake)

### Assets

Shareware `pak0.pak` included (Episode 1).  
For the full game, replace with your own `pak0.pak` from a registered copy of Quake.

### License

Code: GPL v2

### Credits

- Quaked by [@codemeasandwich](https://github.com/codemeasandwich)
- Original game by id Software ([source](https://github.com/id-Software/Quake))
- Three.js port ([three-quake](https://github.com/mrdoob/three-quake)) by [@mrdoob](https://github.com/mrdoob) with [@claude](https://github.com/claude)
