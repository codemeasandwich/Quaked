# Classic enemy and object frame boundary

The owner requested verification that Classic does not show Enhanced enemy or
object intermediate frames. The trace is `R_PostBegin` -> animation mode gate
-> `gl_rmain` movement smoothing and `gl_mesh.R_DrawAliasModel` pose blending.
The native MDL pose selector remains unchanged.

## Finding and minimal correction

The title demo's Classic pass already disables interpolation, including the
legacy `r_lerpmodels 2` override. `R_ClassicOn` enters the Classic scope before
redrawing entities and weapons. Ordinary Classic disabled blending by default,
but the old value-2 'always' branch could explicitly enable both pose blending
and monster movement smoothing in that mode.

`R_AnimEnabled` now requires Newer mode, no Classic scope, and a setting of 1
or above. The stored setting is not rewritten: value 2 still enables Enhanced
smoothing but cannot opt Classic into it. Values below 1 retain their previous
disabled behavior. Original client network interpolation and native grouped
MDL frame timing remain intact; this change concerns the added Enhanced layer.

The existing renderer correctly rebinds native pose position and normal
attributes when `_aliasBlended` was true, even if the target pose number has
not changed. No mesh-cache changes are needed. Split rendering saves Enhanced
attribute identities, pose bookkeeping and displayed/raw movement state;
Classic does not advance the Enhanced interpolation state, and rollback
restores the Enhanced scene afterward.

## Independent verification

Independent planning/review traced the production callers and ran an actual
native `ogre.mdl` half-pose draw: Enhanced uses blended attributes, while a
same-frame/time Classic redraw uses `GL_DrawAliasFrame`'s exact stored pose.
Independent public-interface tests cover native enemies and animated objects,
ordinary Classic, forced legacy settings, the Classic scope, and restoration.
Source/native-geometry receipts are distinguished from screenshot or GPU
appearance verification; no new browser/game instance is required for them.

The pre-existing axe regression fixture initially had two failures: its
Enhanced draw did not enter the renderer's Newer mode, and its source assertion
expected the donor file the owner explicitly removed in commit `8a927815`.
The fixture now sets the proper draw mode and checks the retained original Git
blob without restoring a deleted loose input. No assertion is removed or skipped.
Initial failure evidence is retained alongside the final receipt.

## Final receipts

The regression gate passes **57/57** in
`evidence/classic-alias-boundary-regression-tests-2026-10-03.txt`.
The independent native-draw suite passes **4/4** in
`evidence/classic-alias-frames-tests-2026-10-03.txt`.
It uses original Soldier/Shambler models, grouped flame models and one-pose armor:
232 stored poses in total. Immutable native position and normal witnesses are
captured directly from decoded native MDL vertices before any Enhanced draw.
Classic output is checked against those witnesses, not a potentially modified
cache, at the same client tick and pose ID after a real intermediate blend.
The object check also drives `R_DrawEntitiesOnList` and confirms raw Classic
movement versus the Enhanced midpoint, with exact split restoration.

The verified correction remains local and uncommitted. The existing preview
server was restarted with a fresh module revision; reload the game to try it.
This is CPU/public-renderer verification, not a new GPU screenshot receipt.
