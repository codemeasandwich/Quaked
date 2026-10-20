# TR: Hexen II model skin alpha

20 October 2026. Local implementation trial; uncommitted. Integration, independent review, GPU qualification and
owner acceptance remain open. Worktree `/Users/bri/worktrees/Quaked/hexen2-unified/tr`, base
`f023ded97c183e3bbd42f2a58710536fc51234bd`. Authority is the owner's TR brief. The normative architecture was read
from `/Users/bri/worktrees/Quaked/Dev/hexen2-unified/docs/hexen2/unified-host.md`, rather than this checkout's older copy.

## Defect and change

`Mod_ForName` → `Mod_LoadAliasModel` → `Mod_LoadAllSkins` → `GL_LoadTexture` passed `skinMode` as argument **7**.
That argument is `splitFullbright`; `skinMode` is argument **8** and defaulted to the opaque Quake conversion.
Consequently the native skin textures had alpha 255 even though their materials enabled blending. This happens
before the Classic/Enhanced paths diverge; adding shader discard alone would not repair these opaque textures.

Both single skins and animated skin groups now pass `false` for fullbright splitting and the skin mode in its proper
slot. The existing conversion and material architecture are reused. No shader, palette conversion, material state,
profile or sprite behaviour is changed. Quake passes mode 0: its former seventh argument 0 and the new `false` both
fail the existing strict `splitFullbright === true` check, and its eighth argument remains 0.

Native references: uHexen2 `engine/h2shared/gl_model.c:2253-2259` selects the mode from the model flags;
`engine/h2shared/gl_draw.c:1741-1774` implements index-zero holes, odd-index fractional alpha and the special table;
`engine/hexen2/gl_rmain.c:890-919` enables the alias blend modes. Source comment points to the native mode selection.

The installed retail packs have **32** flagged models, rather than the brief's unverified 21. `models/star.mdl`
is EF_HOLEY. `models/fambeam.mdl` and `models/stlghtng.mdl` have flags 0 and remain on the native opaque-skin path;
they must not be made index-zero transparent merely by filename. The rider gamecode also uses
`models/boss/shaft.mdl` and `models/boss/circle.mdl` (EF_SPECIAL_TRANS). The exact horse attack the owner saw has
not been identified visually. Special-mode texel zero has table alpha 25, not zero; it is not an ordinary hole.

## Verification contract

`tests/hexen2_skin_alpha_test.js` tests public pack construction/loading, `Mod_ForName`, `R_DrawAliasModel`, the
actual `R_ClassicMaterial` + `R_ClassicTexture` split-demo path, and sprite drawing through `R_DrawEntitiesOnList`.
`tests/helpers/skin_model.js` provides a valid tiny MDL with single or grouped skins, with no licensed content.

- Six synthetic Hexen cases cover EF_HOLEY, EF_TRANSPARENT and EF_SPECIAL_TRANS, single and grouped.
- Two Quake controls keep all skin texels opaque and the material's normal state.
- The optional installed-data case checks all 32 flagged retail models: 2,057,432 decoded texels, of which
  1,046,723 are alpha zero; all actual material paths keep the decoded skin and blending. Checks use retained
  post-flood-fill indices, since native flood filling can legitimately change background indices before conversion.
- The sprite control checks index 255 clear and index 0 opaque under both game profiles, in Classic, Enhanced
  and the split Classic texture/material path. It preserves the existing sprite behaviour.
- Owned-data checks return with an explicit SKIP message if the two retail packs are absent. No game data is
  copied into this repository. These CPU checks do not measure final framebuffer output.

RED: temporarily restoring only the loader from the exact base commit while retaining the final regression suite
produced **3/10 pass, 7 fail**: all six synthetic Hexen modes and the real `star.mdl` failed on incorrect alpha;
both Quake controls and the sprite control passed. The candidate loader was restored in `finally`, without any
Git index/ref operation. Log: `dist/verification/tr/red-tests.txt`.

Decoded-alpha measurement (not framebuffer pixels):

| Measure across 32 installed flagged models | Base loader | Candidate |
| --- | ---: | ---: |
| Expected zero-alpha texels | 1,046,723 | 1,046,723 |
| Actual zero-alpha texels | 0 | 1,046,723 |
| Incorrect alpha values, including fractional modes | 1,200,580 | 0 |

GREEN: the final focused suite passes **10/10**, log `dist/verification/tr/green-tests.txt`.

Exact focused command (run once with the base loader for RED, then with the restored candidate for GREEN):

```sh
QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/hexen2_skin_alpha_test.js
```

The broad command was:

```sh
QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/hexen2_*_test.js tests/newer_*_test.js tests/r_post_gbuffer_test.js tests/r_newerskins_test.js tests/hexen2_render_semantics_test.js tests/r_classicstate_test.js
```

It completed **291/291** test executions (84 suite executions, 83 distinct suites, no skips), including all
74 `hexen2_*_test.js` suites (**238/238**) and all seven `newer_*_test.js` suites (**29/29**), G-buffer **2/2** and
Newer skins **8/8**. The Hexen render-semantics suite was redundantly named after the glob (**14/14**, twice).
The command itself exited **1** because I supplied a nonexistent final file `tests/r_classicstate_test.js`.
That is an invocation error, not a passed suite or a pre-existing product failure. The actual split-demo suites
are `classic_alias_frames_test.js` and `classic_demo_isolation_test.js`; their separate results are recorded below.
Full original receipt, including the error: `dist/verification/tr/hexen-newer-tests.txt`.

The copied maintained list exactly matches all 35 core suites in `tools/distribution/engine-tests.mjs`:

```sh
node dist/verification/tr/run-engine-list.mjs
```

Result: **211/212 executed tests pass**, exit **1**; `serve_py_test.js` fails its one test because the server
cannot bind. `game_catalogue_test.js` aborts on `listen EPERM` before any result (its eight cases are unexecuted).
All other 33 suites pass. Log: `dist/verification/tr/engine-tests.txt`. No optional LAN/mission-pack suite was
added. This runs the copied test array directly, without the distribution hook or an app build.

Additional render command:

```sh
QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/gl_model_test.js tests/gl_model_common_test.js tests/gl_model_loaders_test.js tests/alias_mesh_cache_test.js tests/alias_mesh_limit_test.js tests/alias_mesh_native_test.js tests/classic_alias_frames_test.js tests/classic_demo_isolation_test.js
```

Result: **21/26 pass**, exit **1**. Four `alias_mesh_cache` cases and the `alias_mesh_limit` case throw
`TypeError: Cannot read properties of undefined (reading '0')` in `gl_mesh.js:170` (`FanLength`). The model
loaders (7 tests), native Quake corpus (1), Classic alias frames (5) and split isolation (8) all pass. The native
corpus covers all 61 installed Quake shareware MDLs and their retained topology/pose signatures.
Log: `dist/verification/tr/render-tests.txt`.

To prove the failures predate TR, the only changed product source (`gl_model_alias.js`) was restored from
`git show f023ded97c183e3bbd42f2a58710536fc51234bd:src/engine/render/gl_model_alias.js` during this exact command,
then the candidate was restored in `finally`:

```sh
QUAKED_THREE_MODULE=$PWD/node_modules/three/build/three.module.js node tools/run_tests.mjs tests/game_catalogue_test.js tests/serve_py_test.js tests/alias_mesh_cache_test.js tests/alias_mesh_limit_test.js
```

Base result: **0/6 pass**, plus the same pre-result catalogue abort; the six failure names/messages match the
candidate exactly. Log: `dist/verification/tr/base-failures.txt`. These failures remain visible; no tests were
weakened or reclassified as skips. `git diff --check` passes. Final source is the candidate, not the base.

Changed/added files:

- `src/engine/render/gl_model_alias.js`: the two corrected upload calls and native-reference comment.
- `tests/hexen2_skin_alpha_test.js`: regression/material/installed-data/sprite cases.
- `tests/helpers/skin_model.js`: synthetic MDL fixture.
- `docs/hexen2/tr-skin-alpha.md`: this feature/evidence/follow-up record.
- `docs/hexen2/unified-host.md`: local project-ledger pointer to this report.

Ignored evidence is confined to `dist/verification/tr/` (small text logs, receipt, copied engine-list runner and
unqualified offline browser-trial script; no licensed data, screenshots or large builds).

## Browser boundary and next action

`python3 tools/serve.py 4839 --game-root /Users/bri/quaked` was refused by the environment at the localhost bind:
`PermissionError: [Errno 1] Operation not permitted`; a direct Node listener likewise returned `listen EPERM`.
A Playwright Chrome trial with every module/data request fulfilled directly from read-only local files removed the
need for a listener, but Chrome exited with SIGABRT before a page existed. That attempt's command was
`node tools/distribution/hexen2-skin-alpha-trial.mjs dist/verification/tr/before`; its log is
`dist/verification/tr/before-pixels.txt`. No permission escalation or browser-control fallback was attempted.

There are **no framebuffer before/after measurements and no screenshots**. The 1,046,723 figure is decoded skin
alpha coverage, not displayed pixels. Enhanced deferred composition, the actual `r_hdr` switches and both split
halves still need GPU measurement. No claim is made that the G-buffer/compositor preserves every clear pixel.
No shader change is justified from the available CPU evidence alone.

The unqualified offline UV-quad/MRT harness is retained only as an ignored trial artefact at
`dist/verification/tr/skin-alpha-trial.mjs`; it is not a maintained test or a product addition. It exercises loaded
skins with the engine's material shaders, not the complete post chain. The integration orchestrator should first
review/run it in a browser-capable environment, then run the full game against a bright wall with `star.mdl`,
the actual horse attack and a sprite: `r_hdr 0`, `r_hdr 1`, and the title demo's Enhanced/Classic halves. Measure
zero-alpha locations against the background with the entity hidden, retain before/after screenshots and pixel
counts, and make any additional shader fix only with a failing public/GPU regression.

A source-review observation to preserve for that review: `R_ClassicMaterial` copies a spread Material object;
Three's `alphaTest` accessor is not an enumerable own property, so the resulting clone's alphaTest is undefined.
Sprite alpha blending still survives, as the retained control demonstrates; its final visual effect was not
measured. This predates TR and is unchanged. Investigate without changing Quake's alpha-tested output blindly.

## Coordination and gates

Bluey identity and checkpoint reads failed with `storage_error`, `mutationOutcome: unknown`: correlations
`b13c07a382bb4b3a974cd4a46b6453f7` and `e464b463cd4a4d01bbf9409aefe8e75d`. No card, owner, revision or card mutation
was confirmed. This report is the local TR ledger. TR implementer owns the candidate and test evidence;
the integration orchestrator owns reconciliation to the existing card, independent review, browser-capable
qualification and presentation to the owner. No new card or competing assignment was created.

Independent planning/review has not been obtained within this session; the integration orchestrator must arrange
that required gate. No durable job is claimed: the followup v1.7 contract provides bounded file/analysis jobs, not
browser execution, and this session has no pinned private authority/prerequisite records outside the mutable
workspace to admit one. The outstanding GPU/review obligations remain here with the integration orchestrator,
who must supply the authorised durable handoff when appropriate. No commit, staging, push, distribution hook,
packaged build, release or owner acceptance was performed.

No texture/skin authoring files or their registration changed. No authoring-file suite has a changed expectation;
full distribution and skin-identity qualification remain the integration orchestrator's checks in the full checkout.
