/**
 * @module newer/assets/rockfield_presets
 *
 * Rock relief presets, from the owner's rockfield-v1.6.0.html catalogue.
 *
 * Types: plain values and functions; no exported classes.
 *
 * State: no mutable exports.
 *
 * Errors: none raised here (no `Sys_Error`, `throw`, `Host_Error` or `PR_RunError`).
 */
// Numeric presets extracted from the owner's rockfield-v1.6.0.html texture catalog.
// uwall1_2 updated by owner screenshot 2026-10-03 at 16.11.16.
// Albedo is not copied or modified. Role overrides live in r_rocksurfaces.js.
export const ROCK_PRESET_SOURCE = 'rockfield-v1.6.0.html';
export const ROCK_PRESETS = Object.freeze( Object.fromEntries( Object.entries( {
 "uwall1_2": {
  "profile": "wall",
  "featureSize": 2.5,
  "warp": 0.65,
  "fracture": 0.0,
  "detail": 1.5,
  "cells": 64,
  "amplitude": 0.8
 },
 "bricka2_2": {
  "profile": "wall",
  "featureSize": 1.05,
  "warp": 0.7,
  "fracture": 0.65,
  "detail": 0.45,
  "cells": 64,
  "amplitude": 0.38
 },
 "rock1_2": {
  "profile": "wall",
  "featureSize": 0.9,
  "warp": 0.45,
  "fracture": 0.0,
  "detail": 1.45,
  "cells": 64,
  "amplitude": 0.35
 },
 "rock4_1": {
  "profile": "ground",
  "featureSize": 0.3,
  "warp": 0.7,
  "fracture": 0.0,
  "detail": 1.5,
  "cells": 64,
  "amplitude": 0.1
 },
 "wgrnd1_6": {
  "profile": "ground",
  "featureSize": 0.3,
  "warp": 0.7,
  "fracture": 0.0,
  "detail": 1.5,
  "cells": 64,
  "amplitude": 0.1
 },
 "wgrnd1_5": {
  "profile": "ground",
  "featureSize": 0.3,
  "warp": 0.7,
  "fracture": 0.0,
  "detail": 1.5,
  "cells": 64,
  "amplitude": 0.1
 }
} ).map( ( [ name, preset ] ) => [ name, Object.freeze( preset ) ] ) ) );
export function R_RockPreset( name, profile ) {
 const preset = ROCK_PRESETS[ name ];
 return preset ? { ...preset, profile } : profile === 'wall'
  ? { profile, featureSize: 3, warp: .18, fracture: 1.1, detail: .1, blockiness: 1, cells: 64, amplitude: .8 }
  : { profile, featureSize: 2, cells: 64, amplitude: .009 };
}
