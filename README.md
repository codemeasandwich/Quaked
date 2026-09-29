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

#### New Game and Newer Game

The single player menu has two ways to start:

- **New Game** uses the classic lighting, exactly as before.
- **Newer Game** switches on the HDR lighting pipeline: emissive surfaces (lava, light panels, glowing runes, torch flames, sky) can be brighter than white and bloom, and nearby lights, emissive surfaces and dynamic lights scatter through the air as volumetric light with shafts carved out by pillars and grates.

The sky sets the mood. Its brightness, colour and pattern are read from the map's own sky textures: a bright clear sky gives a bright sunlit outdoors with little haze, a dark or stormy one gives dimmer light, faint shafts and a little more haze. Shafts follow the sky's pattern (the clouds are projected along the sun, so shafts and sunlit patches break up the way the sky does) and only build up where light is contrasted with shade, so open daylight stays clear.

Every world texture gets a generated normal map and a height map (see `src/gl_normals.js`), so bricks, cracks and grain have relief that reacts to the sun, torches and dynamic lights, with parallax that shifts the texture as you move. Nothing is shipped or painted by hand: Quake's textures are painted with their shading baked in, so brightness is used as height. It is normalised for contrast, blended across several scales so blocks read as blocks and not just noise, and made tileable. It is generated once per texture the first time Newer Game needs it (about 85 ms for a whole level). Monster and item models, sprites, sky and water are not normal mapped.

Water and slime become see-through: the bottom of a pool shows through the surface, light is absorbed with depth (shallows stay clear, depths go dark and blue-green, slime green), and the surfaces beneath get animated caustics. Lava stays opaque and glows.

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
