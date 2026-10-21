# ground1_7 r1 actual-source independent ART review

**HOLD — actual returned source only.** Reviewer `/root/quake_ground_r1_art` independently opened the actual unchanged native64, new r1 PNG1254 at original resolution, full-size detail crops, both-input BOX32/16, literal X/Y joins, four-corner roll and 2×2 repeat. The parent1254 was viewed only to check unaffected edit invariants. The acceptance baseline is the native, never the held parent or its old master/tiers.

The actual return is `revisions/r1/returned-source.png`, SHA-256 `bb9671b182127aed4fb94bfd6aa8df42ebd8c9fee7ea251aed69909ed1e91f0d`, RGB PNG1254×1254. The native SHA-256 is `0aa62042b9f5d02db409eecef8315098da85cfc5061ceeb7f49376dfae867d5a`. Exact input, prompt, plan, issuance, retention and diagnostic hashes are in [inspection-provenance.json](inspection-provenance.json). The retained issuance is `33725cd88527f8fe9fefca17144c4edb04bd3ac0bde89ed0dbdb5a4d64af1c23`, retention `2e4145e430a8d788bf463bfef2a9f048a0488a1adb4f28a5620db8e26b9bbc7e`.

## Material finding

The edit materially reduces the long longitudinal bark fibres. It has kept the principal cool-grey angular stone islands, their positions, relative size and diagonal brown-network arrangement. Grey fracture and mineral faces remain recognisable. No dominant island deletion, new paving grid or broad soil blanket was observed. These are bounded positive observations, not acceptance of the parent.

The dominant brown surface still does not clearly meet the chosen **compact dark-ochre earth/mineral matrix** interpretation. The centre crop `(350,350)-(862,862)`, lower diagonal crop `(0,650)-(512,1162)` and upper network crop `(600,0)-(1112,512)` show crowded little curled ridges, hollow loops and plate-like chips repeated over nearly every brown mass. The lower crossing in particular reads as a rough tubular network coated with etched/cellular chaff. The marks are sharp, but they do not establish coherent matte compact earth, restrained erosion or sparse embedded grit. Remaining rounded rails, dark troughs and small shiny inclusions reinforce the sculpted/synthetic read. I would not accept this surface by renaming those marks mineral detail. This is a direct actual-image judgement, not a claim inferred from the prompt's forbidden-word list.

See [centre 1:1](r1-detail-centre.png), [lower diagonal 1:1](r1-detail-lower-diagonal.png) and [upper network 1:1](r1-detail-upper-network.png). These are literal512px crops with no sharpening, colour correction or resampling. The prior bark failure is improved; the revised source retains a concrete primary material failure.

## Native distance and edit invariants

Both inputs were independently reduced with the same Pillow `Image.Resampling.BOX` to32×32 and16×16. [BOX32](native-r1-box32-comparison.png) and [BOX16](native-r1-box16-comparison.png) show native at left and r1 at right, enlarged by nearest-neighbour for display only. The small direct reductions are also retained.

Principal grey-island locations and the coarse diagonal brown/grey rhythm remain recognisable. The new raw is visibly brighter and warmer/browner across both reduced views than the native's very dark brown-black, muted dirty-olive and restrained cool-grey balance. This current raw therefore does not receive a palette PASS. The observation is not a claim that an eventual registered master or decoded tier has this defect: neither has been made from r1. Future ordinary source-specific registration cannot erase the current close-range material HOLD, and it requires its own review rather than borrowing the held parent's receipts.

Comparing the actual parent only for the promised edit invariants, the large grey islands and brown footprints survive; the change is mostly concentrated in brown surface structure, with considerable general microdetail/brightness change. No byte-identical grey-region preservation was promised or established.

## Literal boundaries and corners

The retained [X join](r1-x-join.png) is the actual last160 columns followed by first160; its join is x160. The [Y join](r1-y-join.png) is last160 rows followed by first160; its join is y160. [Four corners](r1-four-corners.png) rolls each axis627px, placing both actual boundaries at x627/y627. The [2×2 repeat](r1-repeat2.png) has boundaries at x1254/y1254. None of these views blends, repairs or resamples the source.

The boundary cuts remain detectable as straight changes in local grain/facet continuity, clearest on the vertical centre of the four-corner view and the horizontal centre across the adjoining grey/brown areas. Small facets and crust marks terminate at the join rather than all continuing naturally. No deliberately blurred seam strip or invented border was observed, and the broad diagonal field is largely retained, but I do not grant a natural-contact/wrap PASS for these raw bytes. Native repeated/corner views are retained separately; matching a broad layout or inheriting a weakness from the held parent does not qualify these contacts. The primary close-range material HOLD is sufficient to stop this revision even if a later reviewer judges these boundary findings less significant.

## Provenance, limitations and next owner

[inspection-verification.json](inspection-verification.json) records57 passing pixel/hash checks, including independently reconstructed direct BOX images, comparison panels, literal crops/repeats/joins/corners, and current bound input/diagnostic hashes. Replay the inspection with `/usr/bin/python3 .../build-inspection.py` and `/usr/bin/python3 .../verify-inspection.py` from this repository. These checks prove the inspected pixels, not material acceptance or full issuance/custody qualification.

The first diagnostic helper was initially named `inspect.py` and shadowed Python's standard `inspect` import while NumPy loaded, producing `AttributeError: module 'inspect' has no attribute 'cleandoc'`. It was renamed `build-inspection.py`; the corrected generation and separate verification then exited0. This local diagnostic failure did not affect an authoring input or consume a model call.

Only this new review folder was authored. No image-generation/provider call, source selection, active pointer, master, scalar relief, tier, catalog, browser, Git or build action occurred here. Known authoring history remains one original call plus one edit, total2; this review makes no independent transcript-completeness claim. It neither imposes a universal stone-above-earth relief hierarchy nor proposes an inversion: relief semantics need a separate actual-source plan after material qualification.

Responsible next owner: coordinator. Retain the r1 source, exact prompt, issued/retained records, original source and both ART failures. Keep this candidate on HOLD and its failed gates visible. There is no automatic further-call authority in this review. Source selection, new master/both tiers, actual custody/math/codec/relief qualification, hardware/POM, owner acceptance, Dev/CI landing and release are separate and unaccepted. The coordinator retains the reported Bluey fallback/unknown-mutation reconciliation obligation; this supervised helper is not a durable service handoff or acknowledged board update.
