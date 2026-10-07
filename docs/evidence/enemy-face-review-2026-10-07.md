# Independent enemy face source review — 7 October 2026

Reviewer: Codex subagent `/root/face_review`, Bluey identity `38d50460-1bc6-4240-bde1-199581c2a777`. Work is read-only except this report. Card `task:f36adc7c-9673-404c-9723-cce8adf1cf12` remains assigned to the implementation owner. Source reviewed in `/Users/bri/SOURCE/Quaked`, branch `Prod`, HEAD `b536c9359a4ac37c4541a9debce76991fcd20ef1`, with uncommitted candidate changes. Preexisting ogre diffuse edits, unrelated deleted files and normal startup work are excluded.

## Initial required corrections

**P1: legacy saves have no server seed and flicker on updates.** Normal save restoration calls `ED_ParseEdict` rather than `PF_setmodel`. A legacy save without `_newer_face_seed`, or invalid face metadata, therefore leaves the server edict seed null. Each local `CL_ParseUpdate` copies null back to the client; each following face draw assigns a fresh client random seed. Assign a missing target server seed once after parsed model fields are complete, preserving valid parsed metadata, or assign it once on the server before the native client transfer. Verify repeated updates after loading a legacy/invalid-metadata save.

**P1: delayed seamless follower previews discard individual identity.** `SV_TakeFollowers` serializes the server edict correctly, but its separate runner metadata and `SV_QueueFollowers` → `R_AddLevelRunner` → `R_AttachRunner` → `createGhost` omit `faceSeed`. A following enemy therefore gets a random preview face in transit and restores its original face on arrival. Rebuilding the view also creates another preview seed. The smallest correction is to carry the validated seed in follower metadata, add an optional final seed argument to `R_AddLevelRunner`, store it on the runner and supply it to `createGhost`. Verify the seed across transfer, runner view rebuild and restored edict before closing this finding.

## Source findings

- `PF_setmodel` assigns one unsigned 32-bit seed to each target server edict. Repeated setmodel calls retain it; `clearFields` clears it before `ED_Alloc` can reuse the slot. Selection is `seed % 12`, independent of the map salt and entity index.
- `_newer_face_seed` save metadata preserves zero and the full unsigned range; invalid metadata is rejected. `ED_Write` is reused by normal saves, level snapshots and serialized followers. `CL_ParseUpdate` transfers the actual local server identity across PVS gaps and same-model slot reuse.
- Snapshot ghosts and axe cut records carry identity; optional record validation retains compatibility with old saves. The follower runner gap above is the missing path.
- Face families reuse the selected model diffuse and its relief/uniform objects. They cache at most twelve families per target variant rather than creating a texture per enemy. Shared shader program keys are safe because material uniforms remain separate.
- Overlay application precedes baked vertex color and albedo capture. Coverage suppresses stale underlying face normal and micro height shadows while preserving body relief. Convex polygon winding matches the shader's positive inward half-plane distances.
- Face texture uses the same top-row-first UV convention as existing alias skins, `flipY=false`, sRGB color space and clamped boundaries. This matches the existing diffuse color contract. Shader/GPU color execution remains a runtime verification requirement.
- Face-sheet loads use the existing terminal load helper, readiness status and startup texture enumeration. Failure/timeout keeps `uHasFace=0`; shutdown cancels pending work, disposes face materials and sheet, and rejects/disposes late textures. Families share the sheet binding, so a late successful load reaches prepared materials without reallocation.
- Classic material selection returns before face families are used. Turning variety off deliberately displays face zero while keeping the identity seed; this should be described as an explicit visual override.

## Asset evidence

A read-only Node check independently decoded PNG IHDR dimensions and SHA-256, compared each sheet byte-for-byte with its supplied original, inspected all rectangle bounds and mask orientation, and checked the one-time assignment helper with injected random input. All checks passed.

| Model | Faces | Sheet pixels | Atlas pixels | Original byte identity and SHA | Rectangles and destination bounds | Convex positive winding |
| --- | ---: | --- | --- | --- | --- | --- |
| soldier/grunt | 12 | 1448 × 1086 | 1200 × 776 | pass | pass | pass |
| ogre | 12 | 1536 × 1024 | 1056 × 776 | pass | pass | pass |
| knight | 12 | 1145 × 1374 | 1072 × 776 | pass | pass | pass |

The supplied sheets and actual custom atlas images were visually inspected. The metadata maps only the front face island, retaining body, equipment and rear-head art. All 36 crops are present. This is source/asset inspection, not visual owner acceptance of the rendered models.

## Verification boundaries

The separate browser trial initially disables Newer lighting and normal detail. It proves the displayed model/material path only after it is actually executed; it does not by itself prove relit/MRT normal and height suppression. Require the independent public spawn/save/load/follower checks and normal-enabled GPU run for those claims.

Local native games receive the server lifetime seed. Remote servers and stock demos do not transmit this cosmetic metadata, so they use a client-side lifetime fallback; the unchanged stock protocol cannot reliably identify same-model remote slot generations. Do not claim server-authored persistence for that mode without new evidence and an agreed protocol approach.

The initial `Face_Assign` drew from global `Math.random`, also used by QuakeC `PF_random`, including during Classic spawns. The implementer corrected supported-environment cosmetic entropy to use `crypto.getRandomValues`; a fallback remains for environments without crypto. A read-only Node check with a counting `Math.random` stub confirmed zero gameplay random calls while assigning and retaining an ogre seed in the crypto-enabled runtime.

## Correction rereview

Independently reread the implementer's corrections at 10:04 UTC:

- `ED_ParseEdict` now calls `Face_Assign` after the complete nonempty entity has been parsed. This preserves valid metadata and gives legacy/invalid-metadata target models one server-owned identity. The repeated-update null-reset mechanism is removed. The initial legacy-save finding is **closed in source**; public restoration/update checks remain the independent test owner's responsibility.
- Both door and pad follower records now capture the existing server seed. `SV_QueueFollowers` passes it to the optional final argument of `R_AddLevelRunner`, which stores it on the runner. `R_AttachRunner` supplies it to `createGhost`; view rebuilding retains the runner object and therefore the same identity. The initial delayed-runner finding is **closed in source**; public transfer/rebuild execution remains the independent test owner's responsibility.
- Cosmetic crypto entropy corrects the observed gameplay random-stream coupling in supported browser/Node environments.

No remaining actionable source defect was identified in the scoped implementation after these corrections. This conclusion does not replace the separate public-interface and GPU checks or visual owner acceptance. Earlier hashes below deliberately retain the reviewed failed candidate; correction hashes follow them.

This report is independent source review only. It records no commit, dev landing, release, owner acceptance, or qualified delivery.

## Reviewed source SHA-256 (initial review)

```text
ccdc1208d5324d174b4d7de5fe62ebac937bb81cedbf57881b6fe5503b1f90f6  src/enemy_face.js
3a421c4d2a1a332b47ad26f7f3f2a32f059c5669c3da6a38d11c7571d3be2b9b  src/r_newerskins.js
fa2239ac0659c9750c51d77736492fc0d3a2178f27bfc9c23d4cd728da95337d  src/progs.js
b3cb4e8bf1b476f2f79edcccb6f0153ea796e49e8992a95611e2b764058a4a94  src/pr_cmds.js
d8ec573ef9d0358b8a2598c7505da2ab44b936c7c54a246dfeb0f643cb8f56a2  src/pr_edict.js
4b92a0d021ec7b43457260723481a815590f51f809679c398ce541af3ce46de2  src/cl_parse.js
e2cb21dea54b0c8e78029ee1c9f01b06de500a3942e964141a415e2d4f82f316  src/r_levelents.js
56db1421cfa2a2c7d593722562e8b79cad03213553f744f54dd4bd07c347e9df  src/r_levelview.js
a1c2fe49433c2a251d366067f9726ce7461839b52591b6a779f048acee595b75  src/axe_record.js
063f1c031a22a043be5cf465f276dcf2f2892fc0ae1f21a17aa19dd90f64fb7c  src/sv_axecut.js
ffad0cc262babdac242eb30f2b34546e842021e969e3e93a1137685c8a0ef0f4  src/r_axecorpses.js
79893d7b6c80c2952c0ddbef4bac0e524040c9f4e866f1d51bd5f4cc54e44e5e  src/sv_seamless.js
79b7be15187abb0ea77263efce6809eb443f680ff4a5c8b95c78daec0350112d  newer/enemies/index.json
```

Correction rereview SHA-256; other scoped implementation hashes above are unchanged:

```text
5252d9e289746bf4cb0f81c2601a302429665ace22bbc58f7d433ff497990f57  src/enemy_face.js
a484e110688453e419b28cf775589df3df7e1ddc8492e592c3670d9986118a87  src/pr_edict.js
946dcbf825d9222201cf8db50cfb3bf4bf0604879877bcfe9eee61061feeeb8b  src/r_levelview.js
27c1b2077196adefd0e4359f8e3814060781b18d00eea40e69637ffca8b04571  src/sv_seamless.js
```

## Owner ogre color-match delta rereview

At 10:11 UTC, independently reread the bounded color-match change requested through Bluey message `6047af70-5de2-4900-85ce-805adac3f5c3`:

- Ogre metadata alone supplies the linear RGB gain `[0.9101815, 1.15067627, 1.05761025]`. The uniform constructor defaults soldier and knight to `[1, 1, 1]`. A read-only check confirmed all three bindings are finite, positive triples and all original face-sheet SHA-256 values remain unchanged.
- The shader multiplies the sampled face RGB by this uniform before the existing coverage mix. Face sampling uses an sRGB texture, whose GPU sample is linear under the renderer's existing texture contract. Applying the authored gain there is the correct stage; the skin/body sample and areas outside the mask are untouched.
- Color gain does not participate in seed assignment, source rectangle selection, pose or material-family indexing. Each cached face family receives its variant's gain; the identity defaults leave the other two models' colors unchanged.
- Manifest version `21-faces2` creates distinct custom-set cache identities for revised metadata. It does not require another shader program per individual because the gain is a uniform.

No source defect found in this delta. The implementer reports boundary/source median measurements; exact sample boxes, pixel filtering, medians and sRGB-to-linear derivation were requested for durable feature evidence so that the gain can be independently reproduced. This rereview verifies wiring, scope and color stage, not those missing measurement inputs or rendered visual match. Updated material-test receipts are implementer execution evidence, not reviewer execution. GPU visual comparison and owner acceptance remain separate.

```text
509b2740cbf1fcf089372c8948eb3ab9941700a5515c36b23dc848c04e9f1b74  src/enemy_face.js
a524739ff7879aa1d27bb051e615ccc07ddded2456c16c8240dc612fc581a07e  src/r_newerskins.js
3afd7b3afd23dcb70de4841b33a07ac1e8f65a2bb4605580bc2828d95ef25e41  newer/enemies/index.json
355d82fdd351f67796719588d0936274d0e77b0a33ac09a2652360dbcbe45279  newer/enemies/faces/ogre.png
af5290302ed3251cbabd0641c8a00dfdb437a0078583c078516b541720c7c933  newer/enemies/ogre/custom/diffuse.webp
```

The diffuse hash identifies the preexisting owner-edited atlas used for the color target; this review did not edit it or imply custody of that edit.

## Real-runtime QW identity transfer rereview

At 10:16 UTC, independently reread the wiring correction requested through Bluey message `db106025-4b81-4889-a701-092864dfc4d2`. The implementer's full-engine browser run had exposed a real seed mismatch: local native rendering selected `CL_LinkPacketEntities` when a valid QW packet sequence was present, bypassing the initial seed transfer in NQ `CL_ParseUpdate`. The earlier source review did not establish this active runtime selector. Preserve the failed browser evidence; passing NQ transport checks alone cannot close this runtime gap.

The correction copies `sv.edicts[s1.number]._faceSeed` onto the exact cached `cl_entities[s1.number]` object after it is selected in `CL_LinkPacketEntities`, before model, frame and material selection. The guard `sv.active && !cls.demoplayback` matches the NQ bridge. The server edict remains identity owner; repeated links retain its seed, while a reused slot gets the newly assigned server seed. Zero is retained by nullish coalescing. Remote/demo entities do not acquire unrelated local server identity. No packet layout, spawn behavior or renderer architecture changes.

Source correction is sound; no additional defect found in the bounded delta. The public QW relink regression test and full-engine browser rerun remain independent execution evidence, separate from this rereview. Completion, landing, release and owner acceptance remain unclaimed here.

```text
f453e1c8887c0b451207c5410fe5a6dbc7e46bb6c1fc11de30e841bf91e08737  src/cl_main.js
```

## Color derivation evidence follow-up

Read `docs/evidence/enemy-face-ogre-color-2026-10-07.json`, which now preserves the three head boundary boxes, all twelve source rectangles, normalized sRGB skin-pixel filter, target/source/per-face medians, transfer formula, exact/rounded gains and original-source/owner-atlas hashes. The previously requested derivation inputs are retained.

A read-only Node calculation independently recomputed the linear ratio from its recorded medians as `[0.9101814955941775, 1.1506762749056165, 1.0576102450135088]`, matching the authored shader gain within `1e-8`. Source-image hashes match current bytes, and its twelve source sample rectangles exactly match runtime face metadata. This verifies the recorded arithmetic/provenance; the reviewer did not independently re-extract pixel medians or claim rendered visual acceptance.

```text
cc45f264dbd0793d8606ddfc7be8a8d31ab754046cccd49f574476678f1fc3c0  docs/evidence/enemy-face-ogre-color-2026-10-07.json
```

## Bounded runnable inspection harness review

Independently read the updated `tests/enemy_face_gameplay_trial.html` and `.js`, and the inspection before/after-load receipts. This final review launches nothing, runs no tests, edits no implementation and makes no new board calls; the parent records the owner's explicit bespoke-task exemption from mandatory Bluey tracking.

The default inspection profile selects public `r_newer_textures 0`, while enabling HDR and enemy replacements. It does not modify production readiness logic, deadlines, asset checks or checksum gates. Existing enhanced-lighting/normal/water defaults remain unchanged. The HTML visibly explains the original-wall choice, and the full-enhancements button explicitly starts the same map with `r_newer_textures 1`. This is a runnable face inspection profile, not evidence that the all-enabled decorative-displacement startup failure has been fixed.

Both retained receipt snapshots show `face-inspection-original-walls`, E1M2/native signon 4, loading phase `done`, three settled frames, empty pending/fallback arrays, settled skin readiness with 43 ready/0 pending/0 fallback, 26 completed normal preparations, GL error 0 and an empty browser-error list. Reading the lists confirms all 23 `(entity index, model, server face seed)` records are identical across the save/load snapshots. Every entry marked drawn has a matching client seed. These are implementer browser receipts, not reviewer execution. Target is index 14 before and index 93 afterward, so these two receipts prove catalogue persistence but do **not** independently prove the newly added same-target reselection behavior.

Two small harness findings were returned to the parent:

- **P2: pending reload inspection is not cancelled by a new generation.** The initial load polling timer lacks the generation token check used by `start`. A model/profile restart or another Load can leave the old callback setting `ready=true` and selecting a target before the new operation's own readiness completes. Use the same captured/incremented generation token and terminate superseded callbacks.
- **P2: absent reload target makes the cursor negative.** The initial `findIndex(...) - 1` gives `-2` when no target slot is found. `inspect` then computes `-1 % count` and dereferences an undefined enemy. Use a first-individual fallback cursor `-1` when the target is absent.

The Dismiss folio action reuses `R_BestiaryCancel`; hull-safe positioning, original enemy seed selection, dedicated save name and actual save/load console path remain within the test harness. No core feature or production source changes were requested by this review. The two initial harness issues remain open here until source corrections are reread.

Initial harness/receipt SHA-256:

```text
17735d339c5dc3495edbe724727c0d2f5f1814fdcbb9dea5bf60c545f367bb98  tests/enemy_face_gameplay_trial.html
07aa4f620f3e6c10f79090159ca14aaa66eef80c83615a8ecea36ca2aa578901  tests/enemy_face_gameplay_trial.js
b16f5b0bd0abdbf0c79eb45f62d168124406e66b9b542d69cf0498830d72c313  docs/evidence/enemy-face-inspection-before-load-2026-10-07.json
259b3450e6b02d680dd349781d7a0c77959098ecf30fafcb60d768301ba47f61  docs/evidence/enemy-face-inspection-after-load-2026-10-07.json
```

### Harness correction rereview

Independently reread the corrected controls. Load now captures `token = ++generation`; its timer clears and returns on a generation mismatch before changing readiness or selecting an enemy. Model/profile restarts and repeated Load therefore cancel superseded callbacks through the same generation mechanism. The first P2 finding is **closed in source**.

Reload selection now stores the result of `findIndex` and uses `selected >= 0 ? selected - 1 : -1`. A missing target selects the first eligible enemy through `inspect`, rather than using a negative array index; an empty enemy list retains the existing visible inspection status. The second P2 finding is **closed in source**.

The HTML references `enemy_face_gameplay_trial.js?v=face-inspection4`, ensuring the revised control module has a new URL for the browser trial. No additional source defect found in this bounded rereview. This is read-only source closure without test/launch execution. The retained two receipt snapshots still prove the 23-entry identity catalogue and visible client identity matching; they do not prove same-target reselection. The implementer is collecting a separate matching-target receipt.

```text
c34c496ed0122273b1ece7ad16f6c249d9668596cbcf74ae1fda2d7dfbfde404  tests/enemy_face_gameplay_trial.html
69015e71043d46e05f9440efc2964472b3d97e753177db5d36f01d9bc38c8659  tests/enemy_face_gameplay_trial.js
```

### Capture-only correction review

Read the capture-only `face-inspection5` delta. The parent discovered that the older button called `toDataURL` between frames on the game's non-preserved WebGL backbuffer and exported blank PNGs. Those retained older PNGs are **not visual evidence**; their separate JSON metadata receipts still support their stated identity/readiness claims.

The new wrapper binds and calls the original `renderer.render` with unchanged arguments, preserves its return value, and only when capture is pending after a render to the default framebuffer queues one microtask. This places the export after the frame's synchronous draw calls while the freshly rendered buffer is available. It changes neither production render code nor the actual draw path. New `enemy-face-frame-*` filenames distinguish corrected exports; a new `face-inspection5` module URL loads the wrapper.

The buffer-timing correction is sound in source. Actual nonblank pixel/visual verification remains the implementer's current browser check, and is not inferred from this rereview. One bounded P2 capture metadata finding was returned: the queued JSON export still serializes the last 500 ms polling receipt. A quick Next-and-Capture can therefore pair new-target pixels with previous-target metadata. Refresh the receipt in the same capture microtask through a reused snapshot function, or explicitly label it as an earlier polling snapshot. This finding remains open pending source reread.

Read the new same-target JSON receipts and their summary: both target records identify native ogre index `14`, seed `2533651390`, model `progs/ogre.mdl`, drawn with matching client seed. Both show the ready original-walls inspection profile, phase done, three settled frames, empty readiness pending/fallback arrays and GL 0/errors empty. Their 23 enemy index/model/seed records agree. This adds separate matching-target metadata evidence beyond the earlier 23-entry catalogue pair; it does not make the blank historical PNGs valid.

```text
0d271ffa30f08608519e5ec1bfe00b6b9d93ab96b20174276c25d078c139268e  tests/enemy_face_gameplay_trial.html
9c99ddd4b3b275c6297e42d2ece668df3c743208f188a21be70da6376a8a727b  tests/enemy_face_gameplay_trial.js
4f78b7c236157720a05f42b96ec2b8e693e1390fda5c602621e0cc679a2c2ad8  docs/evidence/enemy-face-same-target-before-load-2026-10-07.json
3cc8f4bca6525ab58f4bb9ad336414bef5643f1037650c0cb7d9409613e392b0  docs/evidence/enemy-face-same-target-after-load-2026-10-07.json
88eab1e124663d3743cee4fea5b556a4bdb21e5108a1f7394272646d2841de37  docs/evidence/enemy-face-live-save-verification-2026-10-07.json
```

This bounded rereview changes only this report. No tests, launches or Bluey calls were performed.

### Capture metadata freshness closure

Independently reread the `face-inspection6` correction. The existing snapshot body is now one `updateReceipt()` function, reused by the 500 ms display interval. The post-render capture microtask calls that same function immediately before serializing the PNG and JSON. Neither a timer task nor another user action can interleave those synchronous export operations, so the frame export now receives current target/profile/identity metadata instead of the previous polling snapshot. The capture metadata P2 finding is **closed in source**; no duplicate builder or alternate render path was introduced.

The HTML references the new `face-inspection6` module URL. No further source defect found in this bounded capture delta. Actual nonblank PNG verification remains the implementer's pending browser action; prior blank PNGs remain retained and excluded from visual proof, and the separately read same-target/23-identity JSON evidence remains valid. This closure runs no tests and launches no browser or process beyond read-only file inspection.

```text
3b8f8e926dcc084ffe3ab3dbf5a455993b64b1e7e6c993754e613136351b7301  tests/enemy_face_gameplay_trial.html
8a073894b5ff35cc33ec7cb1779c90e5a99d4cf31f3ff440425f4656320b384e  tests/enemy_face_gameplay_trial.js
```

## Ogre slight-lightening data review

Independently read the owner-requested manifest-only adjustment and `enemy-face-ogre-lightening-2026-10-07.json`. Each new gain component is exactly the prior authored component multiplied by `1.10` (floating representation yields `[1.1, 1.0999999999999999, 1.1]`). The resulting gain is `[1.00119965, 1.265743897, 1.163371275]`, increasing linear overlay brightness uniformly while retaining the authored linear channel ratios. This does not claim a particular perceptual percentage after HDR/tone mapping.

Restoring only the prior gain vector and manifest version `21-faces2` in a read-only reconstructed JSON reproduces SHA-256 `3afd7b3afd23dcb70de4841b33a07ac1e8f65a2bb4605580bc2828d95ef25e41`, exactly matching the final-source inventory before this adjustment. Therefore the manifest delta is only ogre `colorBalance` and version `21-faces3`: masks, atlas/source rectangles, other models and catalogue ordering are unchanged. All thirteen production JavaScript files, all three source PNGs, and the preserved owner-edited ogre body diffuse still match that inventory's hashes.

No defect found in this bounded data delta. The inventory manifest entry inspected during this review still identifies the prior vector; the implementer should refresh it with the current candidate after the new visual verification. Existing material-test success is implementer execution evidence; the reviewer ran no tests or application launches and made no Bluey calls. Actual appearance of the twelve lightened faces and owner acceptance remain separate.

```text
7754a6a741304c7f7c3c249f64236b06e826a6369b5b4a948a04aae02d665d36  newer/enemies/index.json
f688ffd88262cc4c27b850bbc1e2f37563a6f9c91372ec3513c853ce36a6c972  docs/evidence/enemy-face-ogre-lightening-2026-10-07.json
```

## Ogre rotation/alignment source review

Independently read the shader/uniform/manifest delta and manual alignment evidence. The twelve source-roll entries are `[0,0,0,0,0,3,-3,0,-5,6,0,-16]` degrees, clockwise in top-row-first/y-down pixels. Positive-angle matrix sampling moves source pixel deltas clockwise, so displayed art receives the opposite correction. This is the correct inverse-sampling sign.

Rotation converts normalized face deltas into the actual crop's pixel width/height before applying the matrix, then divides back into normalized coordinates. This avoids treating the rectangular 188 × 247 ogre crops as square UVs. All five nonidentity source pivots exactly equal the annotated eye-pair midpoints relative to their crop; the target pivot horizontally recenters them at 0.5 while preserving their source-relative eye height. Scale 0.98 (0.85 for DYING) samples a smaller source span, protecting silhouette margins by zooming the displayed source around its pivot.

Default roll 0, scale 1, source pivot 0.5/0.5 and identical target pivot reduce algebraically to the original sample coordinates. Upright ogre faces, grunt and knight therefore retain the original sampling. Coverage is still computed from the fixed model-UV mask before source alignment, and the same coverage suppresses underlying relief/height shadows. The face seed, catalogue count/order, body skin, pose and lifetime metadata are unchanged.

`faces-v2` updates the shared shader-program identity for its new uniforms; `21-faces4` supplies revised manifest/set identity. Different individual face alignments remain uniforms in the existing bounded material-family cache. Removing only ogre alignment metadata and restoring manifest version `21-faces3` reproduces prior lightened-manifest SHA-256 `7754a6a741304c7f7c3c249f64236b06e826a6369b5b4a948a04aae02d665d36`, proving other manifest fields and the 1.10 lightening remain intact.

No actionable source defect found. Visibility remains an explicit GPU check: transformed mask vertices can extend beyond the declared source crop (DYING normalized minimum x approximately -0.0995), while staying within the same original portrait cell/sheet. The smaller source-span scales do not mathematically guarantee exclusion of every backdrop/silhouette pixel. The implementer was asked to inspect those exposed edges on all twelve actual GPU faces. Manual roll annotations have approximately ±3 pixel uncertainty and intentionally retain expression asymmetry; this review does not claim anatomical or visual owner acceptance.

```text
7578dbc185a31376642d20bd71aea35d8c7649e2bcc124ce7adc01d3cb110ebb  src/enemy_face.js
73c2a19330dbc7befd272fc77bb57019dae69772a8d84ad6bae2fd26fd9c6e62  src/r_newerskins.js
5e694f93ed1b83fecf21f0bb5cc40f673b78bd784606cb39613e69aa43fb7acf  newer/enemies/index.json
adc56db4a91230cf6c6f104316ca3c63aaa0bb7fa76fe730374db38f9ffdcc0f  docs/evidence/enemy-face-ogre-alignment-2026-10-07.json
```

This bounded review edited only this report. No application launches, repository tests or Bluey calls were performed.
