# Water caustics against the dungeon reference: what was found

Card [42]. An investigation only: no game code changed here. The owner answered the first question on 10 October 2026:
the Muddy look stays on every `*04water1` pool, and it should be a little murkier. That is done in
[muddy-water-2026-10-10.md](muddy-water-2026-10-10.md). The second question (the reference's scene) is still open.

## The reference

`Quake Dungeon Water Reflections.png` (sha256 `acbf371aa73464aa836418f0511740e7c1b15ca667397a0ded7c5c48e0a0cefd`) is a
screenshot of Quaked itself, served locally, captured on 2 October 2026 at 07:21. That is before commit 8e4fefc (15:26
the same day) and before the full-game pak was supported (5 October), so the scene is in a shareware map. It shows warm
broken reflections on the surface and a bright green-gold caustic network on a stone pool floor.

## What changed since

* The caustic pattern (`caustic()` in `src/gl_post.js`) and how it lights Clear and Tinted water are unchanged; its
  strength rose from 0.6 to 0.75.
* Commit 8e4fefc made `liquidMapLook()` give the texture `*04water1` the Muddy look, as "E1M3's brown sediment".
  But `*04water1` is the water of eleven maps: E1M2, E1M3, E1M4, E2M2, E2M4 to E2M6, E4M5, E4M6, the end map and dm7.
  Muddy water scatters a brown haze and puts the caustics only on the light that gets through it.
* Measured on E1M2's pool at (672, 368) with the default (map) look: the picture with `r_caustics 6` and with
  `r_caustics 0` differ by 0.6 of 255 in mean brightness, the level of frame-to-frame noise. There is no visible caustic
  network ([captures: normal, x6, off](evidence/caustics-e1m2-muddy-2026-10-10.jpg)). With `r_water_look 1` (Clear) the
  stone floor shows through.

## Not found

The reference room itself: pools on E1M1, E1M2, E1M4 and the start map were photographed from many positions, and none
is the torch-lit room with the wooden floor.

## For the owner

1. Should the Muddy look stay on every `*04water1` pool, or be limited to E1M3 (with Episode 3's murky water), so that
   the other ten maps' water is Clear again, as it was when the reference was captured? The recommendation is to limit
   it: it matches the reference era and keeps the looks distinct.
2. Which map and place does the reference show? It is needed for the side-by-side comparison the card asks for.
