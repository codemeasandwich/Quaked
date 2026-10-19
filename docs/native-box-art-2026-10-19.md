# Local native box art — 19 October 2026

Owner scope: recheck the six gameplay requirements and correctly name, detect and
display the new game/expansion box art under `~/quaked` in the Tauri game shelf.
The owner's clarification requires importing usable art as shipped defaults for
every downloader, with user-folder images overriding those defaults per face.
Baseline Dev `c00ca59a`. Concurrent Hexen texture authoring remains outside this
change; stage only the shelf/library sources, their tests and this evidence.

## Existing behavior and smallest increment

The native scanner returned packs and discovered names, but no artwork. The
desktop adapter supplied catalogue entries without images, so the shelf always
used bundled `GAME_BOXES` faces. New local images therefore could not appear.
The browser folder reader also ignored `cover.*`.

The native scanner now returns a separate artwork map. It reads only the chosen
game folder's top level: `front` (then `cover`), `back`, and `spine` (then `side`),
case-insensitively. PNG, JPG, JPEG, WebP, GIF and AVIF have a deterministic priority
within each stem. Files must be nonempty, at most 16 MiB, canonical regular files
inside the selected library. Optional invalid files are skipped. If two known
folder aliases exist, only the folder selected for that game's packs supplies its
artwork. No art enters game PAK or loose-game mount lists.

The existing exact-file Tauri asset scope admits/retires these image paths just
as it does pack paths. The existing `convertFileSrc` and `AssetURL` paths carry
them to the shelf. No recursive directory permission, new IPC or alternate image
service is introduced. Fourteen supplied faces are copied into `assets/boxes` and
registered in existing `GAME_BOXES`; desktop packaging already includes that
folder. [Bundled import identities](evidence/native-box-art-2026-10-19/bundled-import.json)
bind every unchanged image. The shelf overlays each available local
face onto its bundled fallback; decode/deletion failure tries the bundled face
once, then prints the existing placeholder. Placeholder gradients and fitted
spine titles remain available after asynchronous failures.

`Quake shareware` is now a native alias for the actual shareware game. Unknown
immediate folders with recognized artwork reuse existing discovered-title
metadata even without game files. Three explicit display-only folder names also
allow the shipped Hexen II/Portal/Quaked defaults when no local artwork exists;
unrelated empty directories stay absent. Their catalogue validation still cannot find
packs, so they remain unplayable. This displays Quaked and the Hexen II artwork
without implementing Hexen II or probing its nested `data1` archives.

## Local file identities and outstanding art

[Naming receipt](evidence/native-box-art-2026-10-19/local-names.json) records twelve
byte-identical canonical copies, with every source retained. No image pixels,
resolution or colors were changed. Shareware has front/back/spine; Quoth has its
own back/spine; q30a1024 has its supplied cover; Quaked has its front; Hexen II has
front/spine, and Portal of Praevus has front/back/spine. Two mission-pack spines
arrived during the audit and also received canonical copies.

Quoth's old `front.png` was byte-identical to Quaked's “Cry of the Abyss” cover.
It is retained as `unassigned-quaked-front.png`, so it cannot label the wrong
game. The owner confirms that accidental replacement and will provide a new
Quoth front. The unnamed Quake JPG is its launch-promotion poster: the owner
explicitly leaves it untouched for possible future poster support. Both images
remain recoverable. Quaked's `back-side.png` is a combined back/spine authoring image,
and Hexen II's `Hexen2_3.webp` is a bottom flap; neither is mislabeled as a back.

At the initial inventory no new local art was present in Scourge of Armagon or
Dissolution of Eternity; their spines arrived and were detected during the work.
Front/back replacements for those titles, and new local art for Dimension of the
Past, Dimension of the Machine, Arcane Dimensions, Malice,
X-Men, Abyss of Pandemonium or several other add-ons were not supplied locally.
Their existing project defaults are retained. The owner confirms the two sources
(project and local add-on folders) should be merged, with remaining absent faces
using printed placeholders until matching art is provided. No new image is
invented or borrowed from a different game.

## Verification and continuation

Independent planning traced native scan → exact-file scope → desktop catalogue
→ shelf. Public native filesystem regressions cover name/extension precedence,
case, alias selection, direct-root scans, symlink escapes, invalid/oversize files,
art-only display metadata and absence of art in mount tokens. Public shelf tests
cover overrides/fallbacks, folder aliases, priorities and playability boundaries.
The read-only `library_inventory` example calls the exact production scanner:

```sh
cargo run --locked --manifest-path src-tauri/Cargo.toml --example library_inventory -- "$HOME/quaked"
```

Independent recheck of the six prior gameplay requirements passed 104/104 checks.
Their retained 17-check DoF/sky GPU and 11-check real-water PCM receipts still
match current source/audio hashes; these are previous controlled trials, not new
physical-listening claims. Default DoF remains 0.05, depth-clear sky is excluded,
cloud opacity is 0.035 with panorama exposure 0.72/contrast 1.2, human-only
generated footsteps remain, and underwater ambience unmutes a prewarmed loop.
Original cues are suppressed only when their enhanced producer admits a custom
cue. Hell Knight fire has no custom attack/impact audio producer yet: the supplied
long fire track is placed ambience, so no unrelated clip is substituted.

Initial sandboxed native test invocation failed on sccache permissions; normal
compiler access reran the maintained test unchanged. Browser trial development
retains a wrong IPC mock shape and a visually rejected transparent-placeholder
result as failures; final checks must use the real binary response shape and
assert placeholder gradients as well as image presence.

Bluey identity fails with `storage_error`, correlation
`2a89256162fe4c6cb3bb67d038370f6a`, mutation outcome unknown and automatic retry
false. No card mutation is claimed. This chat owns implementation, verification
and the pending missing-art response; reconcile this record to the existing card
when storage recovers.

Public filesystem checks pass 15/15, shelf checks 12/12, desktop packaging checks
2/2, existing catalogue checks 3/3 and the fresh-browser adapter/UI trial 29/29.
That final two-phase trial supersedes the initial local-only 14-check trial:
shipped defaults work with zero local artwork, then a local back overrides only
that face while front/spine retain their shipped defaults. The real adapter,
catalogue, decoded owner art, turnover, corrupt-art fallbacks, gradients, neutral
unavailable labels and art-only disabled Play were exercised; Tauri endpoints
were doubled in that browser trial. The two packaging checks verify all fourteen
import hashes and every live default in the real desktop collector without
bundling original game archives. [Evidence inventory](evidence/native-box-art-2026-10-19/manifest.json)
binds source and receipts. Packaged native transport and the full gate remain
separate pending checks; no owner acceptance or missing-art completion is claimed.

The first full gate passed 109 distribution and 44 Rust checks, then stopped at
242/243 engine checks. An older `game_selection` invariant searched the whole
Rust file for tuple syntax and mistook the artwork's `front/back/spine` tuples
for game IDs. The repair scopes that parser to the actual `GAMES` declaration,
requires that declaration to exist, and retains the exact game/add-on membership
assertions. No product behavior or gate was weakened. The failed tree, snapshot
identity, raw output and unchanged-production repair are retained in evidence;
the repaired selection+shelf recheck passed 29/29 before retrying the full gate.
