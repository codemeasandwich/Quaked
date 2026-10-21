# Quaked 0.133.0

The owner requested on 21 October 2026 that Prod move forward to the latest Dev
and that a new version be cut and published on GitHub.

This is a feature release: 34 `feat:` commits have landed on Dev since 0.132.5,
so the minor version moves on and the patch resets.

## What is new since 0.132.5

- Hexen II and Portal of Praevus run on the one shared host: one protocol and
  builtin table, native movement and traces, entities, hubs, saves, demos, HUD,
  menus drawn by Quake's HD vector menu system, the scrolling help, MIDI music
  through an original FM synthesiser, title demos like Quake, and the reviewed
  high-resolution textures in game.
- Controllers: gyro aiming in the Mac app and browser (Switch Pro included), and
  a 3D controller model in the menus for remapping and testing inputs.
- Quake: slipgate machines keep their own art while the start hub's difficulty
  doorways show their destinations; the HUD face fills with water under water
  and its blood fades between damage stages; the vertical QUAKE plaque shows on
  the top-level menu only.
- Box art: standardised, aligned box faces, continuous mission-pack wraps, the
  Immortal Lock artwork and local shelf overrides.
- Texture campaigns: reviewed Quake 4x/8x and Hexen II texture tiers and
  shared-master revisions. Both campaigns remain incomplete; this release does
  not declare full texture coverage.

## Release cut

The release commit changes only the four package/Cargo version records to
0.133.0 and adds this note. Tauri continues to derive its version from
package.json. It follows the [release procedure](prod-release-2026-10-18.md):
the commit passes the full staged gate and its own Dev Distribution push run,
then the installed, reviewed App controller atomically fast-forwards Prod and
creates `v0.133.0` at that same full SHA. The Prod push workflow tests and
publishes the downloadable app and GitHub Pages from that commit.

Acceptance requires the source, web, both Mac, release and Pages jobs to succeed
at the selected commit, and the public release `release.json` to match the Pages
copy. A ref update or running workflow alone is not accepted publication.
