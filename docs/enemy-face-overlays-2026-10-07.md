# Individual enemy face overlays — local working trial

The grunt (`soldier`), ogre and knight now choose independently from twelve supplied faces each. An individual receives one cosmetic identity at native generation, retains it during movement, animation, damage and normal death, and saves it with its entity. New enemies can randomly choose the same face. There is no shared face roll for a level.

The owner requested this feature on 7 October 2026 and separately clarified individual assignment and the ogre head color match. Bluey card: `T-f36adc7c`, `task:f36adc7c-9673-404c-9723-cce8adf1cf12`. Workspace `/Users/bri/SOURCE/Quaked`, existing branch `Prod`, base HEAD `b536c9359a4ac37c4541a9debce76991fcd20ef1`. This is a working local trial. The owner subsequently authorized committing and pushing this feature on the current `Prod` branch. Owner visual acceptance, delivery to the saved `dev` completion branch and public release remain separate; pushing `Prod` does not claim those outcomes.

## Try it

Serve this checkout with `python3 -m http.server 8000 --bind 127.0.0.1`. The supervised server started by this chat serves the same checkout at port8000.

- `http://localhost:8000/tests/enemy_face_trial.html`: actual native MDL geometry and production skin/material loader. Choose Grunt, Ogre or Knight to inspect all twelve choices; Generate twelve new individuals rolls independently. Front/side/back, animation, Classic and lighting/relief controls retain each choice. The receipt exposes identities and real asset/GPU errors. Download gallery exports the actual canvas.
- `http://localhost:8000/tests/enemy_face_gameplay_trial.html`: actual local QuakeC/server/client and full game renderer on E1M2. The default face-inspection profile uses the ordinary `r_newer_textures 0` world-texture option; enemy skins, lighting, normals and water remain enabled. This profile completes normal readiness with no pending or fallback state. Try full enhancements selects the original all-enabled profile; its decorative-displacement loading hold remains separately recorded. Inspect a class or another individual; the test page holds that enemy and moves the player to a hull-safe inspection spot. Save/load use the dedicated `enemy-face-trial-20261007` name. The harness alone changes camera/inspection state; ordinary gameplay code is preserved.
- Ordinary `index.html` → Newer Game uses the same installed face system. Classic and disabled Newer enemies retain original presentation. Existing `r_newer_variety 0` shows face zero but retains the individual identity for when variety is re-enabled.

## Reuse and contracts

`r_newerskins.js` already provided native/custom skin variants, shared body textures, lit/unlit materials, shader patching, preparation, status, uploads, timeout/late callback handling and disposal. No second skin renderer or per-enemy texture cache was created. Each target model adds one source sheet and at most twelve material families, sharing its existing diffuse/height/normal maps and shader program. The face blend precedes vertex lighting and G-buffer albedo capture.

`enemy_face.js` owns bounded cosmetic metadata and shader mask code. Native `PF_setmodel` calls `Face_Assign` for the three target model names. The seed is an unsigned32-bit integer, chosen only if missing; selection is seed modulo the stable12-entry source catalogue. Failed downloads never shrink that catalogue or reroll an individual. Crypto entropy is separate from QuakeC `Math.random` in supported browsers and Node; environments without `crypto.getRandomValues` fall back to `Math.random`.

`edict_t.clearFields` clears identity on allocation/reuse. `ED_Write`/`ED_ParseEdict` save `_newer_face_seed`, including zero. Parsing rejects malformed/out-of-range metadata and assigns one replacement identity to a restored target model whose metadata is missing or invalid. This also supports legacy saves. Stock Quake ignores underscore metadata, and no gameplay/protocol field is changed.

Local NQ `CL_ParseUpdate` and QW `CL_LinkPacketEntities` copy the authoritative native seed onto the cached drawable. Snapshot descriptors, portal ghosts and delayed follower capture/runner/rebuild paths carry the same seed. Axe cuts capture it before native death changes the model; validated optional corpse metadata and fake drawables preserve it. Ordinary corpse poses retain the original model/identity. Detached stock head/gib assets remain their established art; this increment replaces only the three requested body model face islands.

An unvisited level preview precedes actual native enemy generation and has a provisional drawable identity. Saved/previously visited level and travelling follower previews retain native identity. Remote servers and stock demos do not transmit the optional metadata: they use a stable client object choice, but stock protocol cannot establish same-model remote slot generations. Server-authored lifetime/save guarantees are for local gameplay; no new network extension was authorized.

## Art and face masks

The three installed PNG sheets under `newer/enemies/faces/` preserve every byte of the owner-supplied images. The first clipboard sheet is knight; `dcf5b0a4-63f6-4434-8906-c3d77573c350.png` is grunt; `cf6055f5-1c65-42a2-a7ef-533bd23d19e5.png` is ogre. The manifest records source SHA-256, source dimensions, all12 crop rectangles, native skin destination rectangle, convex polygon mask and optional color balance. The ogre sheet's chest-symbol/captions and all source backdrops are outside the sampled/masked regions.

Native skin dimensions are soldier300×194, ogre264×194, knight268×194; existing custom skins are4× those dimensions. Only the front face island is overlaid. Armor, helmet exterior, back, limbs, weapons and model/UV/animation data remain unchanged. The auxiliary eye/head tiles visible in some atlases have no native triangle vertex hits in the reviewed rectangles, so were not repainted. Mask coverage has an inset feather; it moves with the native face UVs and poses. Base mouth normals and height shadows are suppressed within coverage to avoid showing a previous expression's relief through a new mouth. This increment uses the original model's geometry; open-mouth art cannot make a geometrically open jaw.

The original measured ogre-only color balance was the linear RGB gain `[0.9101815,1.15067627,1.05761025]`, applied only to sampled face color before coverage blending. It reduces the red cast and moves the tones toward existing head skin. Grunt and knight use identity gain. `docs/evidence/enemy-face-ogre-color-2026-10-07.json` retains exact head/source boxes, skin filter, medians, sRGB-to-linear formula, gain and base/source hashes. The existing owner-edited ogre diffuse was sampled and preserved. Original images are intact, so future tuning can change the gain without rerendering or recompressing art. Add `?sourceTone=1` to the gallery to compare original ogre source tones.

## Failure and ownership

Face-sheet loading participates in existing30-second terminal requests. Until ready, or after failure, the same chosen family displays its body/base face; late callbacks cannot revive a failed/retired request. Status exposes failure; identity stays fixed. Shutdown disposes shared sheet/body/height textures once and each owned material; model-owned native diffuse textures remain with the model loader. Texture uploads and preparation getters return the actual draw bindings, including face sheets.

Preexisting dirty ogre diffuse, unrelated asset deletions, untracked reference images, normal bundles and other source work remain untouched. No branch switch, stash, broad cleanup or merge was performed. The owner authorized the subsequent feature-only commit and push; unrelated work remains outside that commit. The dedicated test save and generated download images are test artifacts, not replacement owner saves.

## Verification and remaining acceptance

Independent planning and source review are recorded on the Bluey card. Review report: `docs/evidence/enemy-face-review-2026-10-07.md`. It retains original findings and corrections, including legacy-save rerolls, delayed follower identity and the live QW packet path. Public native tests and source-bound historical/current receipts: `tests/enemy_face_native_test.js`, `docs/evidence/enemy-face-native-tests-2026-10-07.txt`. Loader/material/failure tests: `tests/enemy_face_material_test.js`, `docs/evidence/enemy-face-material-tests-2026-10-07.txt`.

The maintained test runner uses the game's pinned real Three.js0.183.0 through `QUAKED_THREE_MODULE`. Current independent native11/11 covers actual QuakeC spawn for36 simultaneous individuals/all12 choices, native recycling/animation, save metadata,144 NQ packet updates, crypto/gameplay RNG separation, actual native delayed runner ghosts and QW public relinking/PVS/zero-seed same-slot reuse. Those fixtures do not by themselves prove the full socket/browser path or owner visual quality. Existing23 skin/axe/edict/seamless regressions and3 new material tests also pass. Final combined count and actual browser evidence are recorded after the last runtime correction.

The gallery renders actual source sheets/native geometry with lighting/relief enabled; all36 appearances, Classic/animation and view toggles are visually checked. Fresh-origin full-engine receipt `docs/evidence/enemy-face-native-browser-2026-10-07.json` proves11 visible native/client seeds match and43 skin assets ready/0 pending/0 fallback with GL0/errors[]. Full browser entry/save/load is not qualified: the normal intro remains warming on sculpted surfaces and water reflections, with8 prepared-displacement timeout fallback strings. The initial mismatch receipt is preserved as `enemy-face-native-browser-before-qw-fix-2026-10-07.json`; same-origin module caching required a fresh localhost origin to execute the corrected QW code. Public native save/update coverage remains independent evidence. Final combined37/37 and source hashes are retained with the final receipts. Actual seamless follower crossing is not claimed by the direct public runner fixture; source wiring and existing seamless corpse regression are constituent evidence. Owner acceptance should inspect seams, expression fit and ogre skin color in real lighting. No qualified dev landing or release is inferred from these local checks.

## Accountable retained finding

The full-engine readiness hold remains visible on the same Bluey card. Shared followup accepted a bounded read-only source diagnostic as job `c695bd56-41ed-4f41-ac4a-b05f57cf0175`, acknowledged service owner `followup:2d417270-a815-41d2-a21f-de7f7291ddb0`. Profile Codex/gpt-6.1-sol/medium analysis_task; cumulative3invocations/240seconds/90-second steps,1automatic interruption retry. It may trace the preserved browser receipt and readiness/displacement source and name a next public diagnostic/owner; it cannot edit, build, launch browsers/workers, alter processes, clean files, commit, integrate, release or claim runtime recovery. Source pinned outside-scope diagnostic only; acknowledgement is not worker execution or completion. The responsible next implementation owner remains this Quaked feature coordinator after receiving the report. Service controls/events/results use the same job ID. Current durable state is checked before this handoff and recorded on the card.

Final gallery receipts: `docs/evidence/enemy-face-gallery-verification-2026-10-07.json` plus the three model PNG/JSON pairs. They verify all36 real GPU faces with lighting/relief, expected color bindings, no fallback or GL error. Source inventory: `docs/evidence/enemy-face-final-source-2026-10-07.json`. Followup status confirmed `ACCEPTED`, version1, service owner above, attempts0/invocations0/execution null; no worker execution or verified diagnostic is claimed. The normal loading hold remains visible.

Retained resources are explicit on Bluey: test dependency folder `/private/tmp/quaked-face-runtime` (resource3919b56f-9ff7-480f-a3f7-1e2b8f032340) for localtrial reproduction, and service-pinned private authority/prerequisite records `/private/tmp/quaked-face-followup` (resourcea3c0ff16-eff5-4a0e-a74e-24a74987994d). They remain needed; cleanup is pending and the card is not Ready/Done. The heavy game trial tabs were closed after retaining proof; the lightweight corrected-ogre gallery remains open. The supervised localhost server session75496 serves this checkout for the owner trial.

## Runnable inspection and browser save/load follow-through

The owner clarified on7October that this bespoke task does not require Bluey tracking; functionality and a version they can check take priority. Existing records remain optional provenance. The face inspection now runs the real E1M2 game using original wall textures (`r_newer_textures 0`) through the public console option. It preserves enhanced enemy skins/lighting/normals/water, and the same normal intro readiness checks complete after three stable frames with zero pending/fallback entries. No timeout, loader, checksum or gate was changed. The all-enabled profile is still available through Try full enhancements and retains its failure evidence. Source tracing shows water capture waits on sculpted-surface readiness; a displacement error continues to count as pending.

`enemy-face-inspection-before-load-2026-10-07.json` and `enemy-face-inspection-after-load-2026-10-07.json` prove all23 enemy indices/model names/seeds were preserved through an actual browser save/load, and all visible client seeds match afterward; readiness is done, GL0/errors[]. `enemy-face-gameplay-ogre-ready-2026-10-07.png/json` records the ready ogre inspection. Inspect Grunt/Ogre/Knight and Next individual expose the actual native enemies. Dismiss folio closes a first-sighting book that might obscure the selected enemy. The dedicated test save remains separate from owner saves. The updated reload control waits for the actual replacement player entity before inspection and reselects the saved individual.

Final inspection controls were independently reviewed. Superseded Load timers cancel through the existing generation token, missing targets safely select the first eligible enemy, and script versionface-inspection4 prevents stale controls. `enemy-face-live-save-verification-2026-10-07.json` and the matching-target PNG/JSON pair now prove the same selected ogre index14/seed2533651390 remains selected after actual save/load, with all23 native identities unchanged, matching visible client seeds and completed normal readiness without fallback/GL error. Native grunt, ogre and knight ready snapshots are retained in `enemy-face-gameplay-*-ready-2026-10-07.png/json`. The live inspection remains open for owner checks; the all-enabled world-texture profile is still a separate unresolved displacement load.

Historical game-canvas PNG exports taken between frames were blank because the game does not preserve its backbuffer; they are retained but excluded from visual proof. Their JSON identity/readiness evidence remains valid. The inspection export now uses the existing renderer unchanged and captures in one microtask after an actual onscreen render; one shared `updateReceipt()` refreshes metadata at that same time. Script versionface-inspection6 loads these corrected controls. `enemy-face-live-rendered-ogre-2026-10-07.png/json` is visually and numerically verified as nonblank actual game output, ready/no pending/no fallback/GL0. Independent review closed the capture/receipt freshness findings.

## Ogre lightening and upright alignment

The owner requested a slight brightness lift and correct rotation for all ogre faces. Manifest revision21-faces4 uses the measured color ratio multiplied equally by1.10, yielding `[1.00119965,1.265743897,1.163371275]`. This is a modest linear-light increase; it preserves temperature/channel ratios rather than promising a10percent perceptual increase after HDR. The body, original sheets and other models keep their prior data.

Independent visual planning inspected all12 source heads using eye/ear/scalp landmarks. Seven are already upright. Pain, wounded, laugh, taunt and dying have source rolls +3,-3,-5,+6,-16degrees respectively in top-row-first/y-down coordinates. The inverse sampler applies those source angles in actual source pixels, avoiding aspect skew in the188x247 crop. Tilted faces are horizontally centred about their eye midpoint while retaining original eye height; this avoids sampling above the open-mouth Roar's forehead. Sampling is slightly inset to protect silhouette edges (.98 for minor tilts, .85 for Dying). The destination UV mask and normal suppression remain fixed on the model; face choice/lifetime is untouched. The shader family cache is faces-v2.

Landmarks are manual annotations, approximately +/-3pixels; intentional gaze, squint and asymmetry remain. `enemy-face-ogre-alignment-2026-10-07.json` preserves annotations, conventions and transforms. Independent public material tests6/6 verify affine direction/conformality, pivot/caching/identity boundaries and all12 head-axis residuals within1.537degrees; full combined checks40/40 passed. Real GPU rendering in `enemy-face-ogre-aligned-lighter-2026-10-07.png/json` shows all12 current faces with lighting/relief, correct bindings and GL0/errors[]. Silhouette corners were visually checked; rotated samples may leave a crop rectangle but remain within the same source portrait, which is intentional. Original images are never repainted or recompressed.

The two local trial import maps version the changed face modules to avoid stale browser code while reviewing these adjustments. The normal game entry/lifetime/save contracts remain the same. Owner visual acceptance is still separate.

The updated native inspection (`enemy-face-ogre-aligned-live-2026-10-07.png/json`) also completes normal readiness with matching visible native/client identities and GL0/no errors. Both gallery and game trial have been refreshed to the versioned alignment modules for owner review.

## Authorized commit and push

The owner explicitly requested committing and pushing these changes. The existing `Prod` branch tracks `origin/Prod` at `git@github.com:codemeasandwich/Quaked.git`; remote and local predecessor were both `b536c9359a4ac37c4541a9debce76991fcd20ef1` when checked. The feature commit includes its implementation, three supplied face sheets, manifest, tests, runnable inspection pages and preserved verification/review evidence. Preexisting ogre diffuse edits, unrelated deletions, root reference images and unfinished normal-bundle work are excluded and preserved. The source inventory is a precommit content snapshot, not a self-referential commit identifier; Git records the resulting commit. The retained color measurements used the owner-edited ogre diffuse recorded in their evidence; that unrelated diffuse edit is intentionally not included in this feature commit.

## Landed on Dev (10 October 2026)

The feature above was committed to `Prod` (907d5cd) by the Codex session that built it. With that session no longer
running, it was landed on `Dev` by Claude: the same code, adapted to what `Dev` had gained since.

* **How it was merged.** Each file that conflicted took `Dev`'s version, and 907d5cd's lines were applied to it: the
  Rend the Veil records (`pr_edict`, `r_levelents`, `r_levelview`), the axe halves' ground slope (`axe_record`), the
  cheat powers cleared with an edict (`progs`), and the vision-aware skin program key (`r_newerskins`). The face blocks
  were copied into `Dev`'s `newer/enemies/index.json` by variant. Its revision stays 26, not Prod's "21-faces4": the face
  sheets are new URLs, no existing skin changed, and the index itself is fetched without a cache.
* **Tests changed by the landing.**
  * The four bound-skin suites (Shub, Enforcer, Spawn, Death Knight) check that every other enemy entry is unchanged by a
    digest. That digest now leaves out the grunt's, ogre's and knight's face blocks, and checks that no other variant
    has faces. `enemy_face_material_test` pins those three blocks' own digest, so a changed face rectangle is still
    caught.
  * `startup_skins_test`: E1M3's prefetch now also starts the ogre's face sheet (20 requests: 19 maps and the sheet),
    and still none for knights or grunts, which E1M3 does not have.
* **Architecture.** `pr_cmds.js` and `pr_edict.js` (the QuakeC VM, `engine/progs`) now import `enemy_face.js`: two more
  engine → Newer imports (debt D1b of the [architecture baseline](architecture-baseline-2026-10-10.md)), from modules
  that already had some. `enemy_face.js` imports nothing, so no cycle grows. The classifier places it with the skins
  (`newer/render`, [44d]).
* **Checked on Dev.**
  * The face suites (material 7/7, native 11/11), the bound-skin suites and `startup_skins` pass. The full suite on the
    landing passes but for suites lacking inputs not on this machine (donor zips, a Quake install in `~/Downloads`).
  * In Chrome on E1M2 (`tests/enemy_face_gameplay_trial.html`), ogres, grunts and knights were drawn with their faces:
    23 individuals seeded, the client's copy matching for each one in view, 23 seeds unchanged through save and load, no
    GL or page errors ([receipt](evidence/enemy-face-dev-landing-2026-10-10.json),
    [frames: ogre, grunts, knight](evidence/enemy-face-dev-landing-2026-10-10.jpg)).
* Owner visual acceptance remains open.
