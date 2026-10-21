# Minimal owner-art repair: independent tool and implementation plan

21 October 2026. This lane audited existing tools and retained bytes. It authored no corrected texture, new tool, runtime binding, relief, provider request, Git mutation or build. Root owns the concrete candidate and final review. The owner prioritised the screenshot's tech family during this audit; the earlier city5_8 findings below remain diagnostics only.

## Immediate first increment

Prepare one **colour-only diagnostic group for tech08_1, tech09_3 and tech10_1**, using the unchanged `finish_official_texture.py` CLI. Preserve the existing geometry until the actual scene's directional contacts have been reviewed. Use the pinned retained **512×512 lossless authoring PNG** for tech08_1 and tech09_3, rather than another decode/encode of their installed Q92 colour. Their earlier retained owner source is 768×768 against native 128×128: this supports the existing legacy 4× repair but does not qualify 8×. For tech10_1 the owner/root explicitly selected the best surviving compressed artwork, `assets/game/textures/tech10_1.webp`, 256² against native 64². Its no-op control is channel-exact; the half-native RGB mean drift is (+24.765,+15.407,+5.465). Retain that exact input, including its lossy limitations. Do not enlarge any of these sources.

The independently proposed first settings are `factor=4`, `method=photographic`, `comparison_divisor=2`, `color_strength=0.35`, `field_sigma=1.5`, no landmarks and no edge anchor. This is one restrained trial, not a parameter sweep or accepted-art recipe. The correction enters only through a smoothed half-native colour field. Sigma 1.5 corresponds to three native texels of field smoothing. It preserves the retained material detail rather than replacing it with native pixel structure. The reduced strength deliberately limits the first change; residual mismatch is not an automatic reason to increase it.

Concrete existing public interface, substituting a NEW candidate path for each output:

```sh
PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 tools/texture_sheets/finish_official_texture.py \
  --original docs/quake/textures/owner-art-repair-2026-10-21/screenshot-scene-intake/base-native-tech08_1.png \
  --generated assets/authoring/texture_sheets/sources/official-world-2026-10-17/legacy-tech-q92-masters/tech08_1-4x-diffuse.png \
  --output NEW_CANDIDATE_DIRECTORY/tech08_1-colour.png \
  --factor 4 --method photographic --comparison-divisor 2 \
  --color-strength 0.35 --field-sigma 1.5
```

Repeat the same invocation for `tech09_3`, changing only the material-specific original/generated/output paths. For `tech10_1`, use `base-native-tech10_1.png` and `assets/game/textures/tech10_1.webp` as the original/generated inputs with the same controls. The CLI requires a PNG suffix and refuses an existing PNG or sibling JSON receipt. It emits an exact input/output/tool-hash receipt. Root should capture the actual public invocation and read back both files. The paths and hashes of the tech08/09 retained sources, authoring PNGs and installed outputs are bound in [screenshot-source-audit.json](screenshot-source-audit.json). All six source/current pins match the historical producer manifest, and both installed-texture no-op controls are channel-exact. [tech10_1-extension-audit.json](tech10_1-extension-audit.json) binds the third material, its exact no-op result and the surviving-source limitation.

Keep the initial height bytes and descriptor unchanged for this colour-only trial. Do not derive geometry from corrected brightness: paint, pale louvers and gold/olive substrate colour are not depth labels. A later spatial correction must transform the associated physical maps coherently. An 8× master, full precision relief and fresh modern tiers remain separate work; the trial must be labelled legacy 4×.

## Actual neighboring surfaces are the acceptance reference

The scene lane corrected its first edition inference: the second screenshot matches **base remastered e1m1**, not shareware e1m1. Its [scene-proof.json](../screenshot-scene-intake/scene-proof.json), base-native planar render and [wall-joins.json](../screenshot-scene-intake/wall-joins.json) are authoritative. Do not use the earlier shareware four-whole-edge summary as screenshot acceptance. Base door face 2818 has partial/interior-cut contacts, including these exact shared edges at wall Y=2816. All coordinates below are unwrapped native texels; sample modulo each material's actual dimensions with the correct side of the face boundary.

| Base face pair | Door tech09_3 endpoints | Neighbor endpoints |
|---|---|---|
| 2818 / 2824 | (−272,96)→(−272,100) | tech08_1 (−320,252)→(−320,256) |
| 2818 / 2828 | (−272,100)→(−272,128) | tech10_1 (−320,4)→(−320,32) |
| 2818 / 2830 | (−272,128)→(−368,128) | tech08_1 (−272,128)→(−368,128) |
| 2818 / 2823 | (−368,128)→(−368,100) | tech10_1 (−416,0)→(−416,−28) |
| 2818 / 2827 | (−368,100)→(−368,96) | tech08_1 (−416,128)→(−416,124) |
| 2818 / 2821 | (−368,64)→(−368,0) | tech08_1 (448,0)→(448,−64) |

The first screenshot's tech08_1/tech11_2 contact uses **tech08 U=112**, an interior cut, meeting tech11 U=0. It is not evidence for making their entire outside edges equal.

Self-repeat error alone is insufficient, and minimizing a neighbor edge difference would also be wrong. Native joins can contain intentional contrast. An earlier shareware-only whole-edge diagnostic found native/current bottom contrast MAE 30.646/16.497: the smaller current difference was **not** better, because signed native RGB delta (−45.66,−32.09,−14.19) was flattened to (−6.74,−5.83,−8.22). This is a diagnostic example of why edge equality is wrong, not a base screenshot gate. Compare signed colour and spatial relationships to the actual base native surface reconstruction, including partial contacts and neighboring tech04_3/tech10_3 surfaces recorded by the scene lane. Do not infer exhaustive neighbor coverage from exact-shared-edge enumeration alone.

Before selecting this group, root/independent reviewer must inspect actual 512² tech08/09 and 256² tech10 material, both native and decoded candidate at native/2 and native/4 with the same BOX filter, self repeats/corners, and the actual base scene joins at close and reduced scales. Preserve louvers, rounded rivets, paint wear, central labels and intended gold/olive value differences. Look for ghost bands, darkened ornament, changed substrate finish, clipping and softened detail. Quantitative improvement cannot clear a visual failure. Show the owner's actual scene with the candidate through the existing renderer before claiming it fixes the screenshot; a contact sheet is a working trial, not runtime or owner acceptance.

## Reuse boundaries established by source review

| Existing mechanism | Relevant implementation | Appropriate use here |
|---|---|---|
| `finish_official_texture.py` | Lines 54–122: photographic correction; 74–83: explicit measured Y warp; 93–106: optional four-edge mean anchors; 158–192: no-clobber PNG/receipt CLI | Reuse unchanged for the colour-only trial. It cannot prove neighbor compatibility or repair invented/missing geometry. |
| `update_level_sheets.py` | Lines 83–104: pinned atlas, exact crop, Lanczos resize and `phaseNative` roll; 105–125: writes colour, reauthors height and writes a catalogue | Its crop/phase transform is the existing phase policy. Do not invoke its default installer for this trial: that would affect height/catalogue and use a legacy fixed output/encoding contract. |
| `realign_sheets.py` | Lines 44–86: black-gutter detection, row/column grouping, proportional split, brightness-based crop trimming and resize | A recovery aid for displaced atlas cuts, not a local UV/landmark repair. Current manifest/source bindings are known, so heuristic recutting is unnecessary and risks changing chosen art. |
| `fix_seams.py` | Lines 88–122: brightness-only edge detector; 128–163: brighten dim pixels or stretch interior rows over near-black rows; 215–267: global scan and in-place catalogue-target writes | Not the answer to this family mismatch. It cannot measure neighbor phase or palette and may stretch hardware. Do not run its default mutation path. |
| `prepare_texture_master.py` | Lines 24–34: measured x/y landmarks; 70–83: ≥8× source guard and x-axis transpose; 88–112: fresh float relief and generationCount=1 package | Existing axis adaptation is useful precedent, but the current guarded CLI correctly refuses 6× legacy sources. Do not bypass its guard, invent a generation prompt/count, or create another master pipeline. |

The finisher's photograph mode does not use `--strength` to tune its retained detail; its relevant controls are `--color-strength` and `--field-sigma`. Do not switch to historical `strict` mode to improve a score. Strict replaces large forms with a native reconstruction and is incompatible with preserving this artwork.

The optional edge anchor changes four edge **mean colours** in a one-native-texel band. It is neither a directional neighbor solver nor a tiler. The default first trial therefore leaves it off. A periodic boundary-intensity repair likewise cannot fix a misplaced rail or rivet; do not invoke it before a demonstrated source-specific defect.

## Spatial correction only after scene-specific measurement

For a uniform registration error, reuse the existing `phaseNative` convention: positive x/y rolls pixels right/down by native offset×output scale, with no map-UV change. Preserve RGB and physical map alignment. A roll is a permutation at integral output texels and retains art, but it changes which authored features meet a world surface boundary. Choose its value from actual native/source landmarks and the scene's interior-cut positions, not a self-repeat aggregate.

For nonuniform band spacing, the unchanged finisher accepts strictly increasing `[native-coordinate, donor-coordinate]` pairs with pinned `[0,0]` and `[height,height]` endpoints. It evaluates at output texel centres and linearly samples the donor with wrapped indices. The public flag is `--vertical-landmarks`; the newer master wrapper's x support is implemented by transposing both inputs and output. This audit does not propose a new x adapter, library or automatic landmark detector. The observed screenshot family has no independently accepted spatial recipe yet. Do not copy city5_8's points onto tech textures.

## Retained city5_8 finding; superseded as first priority

[source-audit.json](source-audit.json) independently reproduces the earlier city5_8 no-op receipt: `finish(native,current,factor=4,color_strength=0)` changes no channel. This proves that the existing finisher can preserve that legacy baseline exactly before an explicit change.

The old city atlas crop/resize/phase replay is **not** byte-equivalent to installed city5_8: 9,963 of 65,536 pixels differ, MAE 3.302 channel units. `seam_fixes.json` records a bottom repair touching eight rows and a left repair touching 32 rows. city5_3 has 231 differing pixels/MAE .072; wizmet1_3 replays exactly. Do not silently replace installed baseline with a raw-crop replay.

Actual row-profile/visual inspection shows city5_8's Y error varies with height: native/donor dark groove centres are 8.5/10.625, 32.5/31.375 and 55.5/52.375 in native pixel-edge coordinates. Thus a single roll cannot fix all three. The recorded candidate landmark proposal is diagnostic only; pinning the additional lower rail end (62.5→58.625) to the required 64→64 endpoint would compress the last donor band steeply. Review the lower assembly literally rather than hiding a form defect with colour. No city candidate or accepted landmark recipe was produced by this lane.

## Verification and coordination boundary

This audit executed read-only source/hash/dimension/pixel diagnostics and independent in-memory exact no-op controls. It did not change a maintained tool, so it did not add mirror tests or run unrelated build/test suites. Actual corrected public-CLI output, encoded candidate review, physical-map alignment if changed, runtime scene proof, owner acceptance and landing remain root's next work.

Root's current Bluey identity failure `c10dc` has unknown outcome and `autoRetry=false`; this lane did not invent an identity or retry it. Root remains responsible for keeping this work and its next action visible in the existing ledger and reconciling the board when supported access returns. These documents are a supervised independent plan, not a durable follow-up job or a completion claim.
