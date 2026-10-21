---
name: quaked-texture-authoring
description: Author source-faithful photorealistic Quake and Hexen II textures, shared-master 4x/8x tiers and matching relief, including official expansions. Use for texture inventory, generation, repair, validation or handoff in Quaked; not general engine coding or unrelated image generation.
---

# Quaked texture authoring

Create a recognisable real-world material while preserving the native texture's colour, intended forms, style, feature scale and edge relationships. Use this skill from the Quaked repository root. Read its `AGENTS.md` and the owner's standing instructions first; this skill grants no additional provider, spending, publication or cross-project authority.

## Non-negotiable output contract

| Tier | Width and height | Authoring source |
|---|---|---|
| Low | Unchanged native | Original game data |
| Mid, default | 4× native | Direct reduction of the canonical master |
| High | 8× native | Direct reduction of that same master |

Retain one final shared source adequate for at least 8× native dimensions and one active registered RGB/full-precision scalar-relief master per distinct material. The owner permits GPT image-editing revisions of that shared source: “one master” does not mean one model call total. Preserve the original and every issued revision's prompt, parent, actual return and truthful call counts; select only one final source for both tiers. Read [tracked source edits](references/source-edits.md) before editing. Never generate or author Mid and High separately, upscale an inadequate source or transcode another compressed tier. Exact-content aliases may share a package only after complete native proof; preserve their individual Low identities.

Author physical relief at master resolution. Derive each tier's height and correctly scaled normals from uncompressed scalar data. Every enhanced map, including diffuse, height, XYZ normal and any qualified mask role, uses **lossy WebP quality 92, method 6**. Lossless PNG/float NPY are retained authoring data. The normative contract is [the shared standard](../../docs/texture-tier-standard.md).

When the owner explicitly requests artwork variations, retain one final shared master **per named art variant**, each feeding its own 4×/8× tiers against the same unchanged Low. This is not separate tier authoring. Keep native identity, art-variant identity and physical file counts distinct: three paintings for one window do not cover three native textures. Preserve a common frame/UV layout and qualify each scene. Relief may be shared only through exact geometry/semantic proof; a painted scene must not become embossed terrain. See the current window-variation record before assuming that variation or runtime work is authorized for another family.

## Material recognition is a primary gate

Resolution, sharpness, discernible pixels and a low comparison error do not establish photorealism. A viewer must recognise a plausible real material without relying on its label: for example stone fracture and pores, coherent wood fibres, metal and oxide wear, matte plaster aggregate or fabric weave. Choose cues and their scale to suit the native forms; do not add knots, bricks, hardware or ornament just to signal a material.

Name the concrete material interpretation and finish in the brief. If the native is ambiguous, record the uncertainty separately and choose a plausible interpretation for independent review; do not let “neutral surface” become abstract high-resolution mottling. Inspect the actual generated image at 1:1 and both final tiers. Put an image that reads as noise, painted abstraction, oversharpened pixels or indeterminate synthetic grain on HOLD, even if its colour and distance checks pass. Do not manufacture realism with a noise overlay, sharpening or added bevels.

## Execute the pipeline

Read [the operational workflow](references/workflow.md) for exact commands, journal schema, artifact layout and recovery. Use the built-in image generation path and the applicable imagegen skill; the CLI/API fallback still needs the explicit authorization and local credential required by that skill.

1. **Recover current state.** Inspect Git, the current goal/progress/catalog/queue and tracked task. Resolve owned unfinished work first. Historical receipts describe their recorded state, not current coverage.
2. **Prove the native source.** Preserve unchanged originals, palette/indexed/RGBA identity, dimensions and provenance. For BSP aliases compare all four native mips and material flags, not names or base-level appearance. Respect frame, UV, tint and transparency semantics in other families.
3. **Plan the actual material.** Inspect each native image. Record material cues, layout landmarks, intended repeat axes and relief semantics. Obtain the independent planning required by the owner before generation.
4. **Generate and retain the shared source.** Record issuance before the call and retain the exact returned file afterwards. Reconcile unresolved requests rather than issuing a duplicate. Check actual dimensions/aspect and material readability before master preparation. For a demonstrated defect, a tracked edit may revise that source; preserve the failed attempt and recheck unaffected material as well as the intended repair. A rejected source is not rescued by relaxing the material gate.
5. **Prepare one master, then derive both tiers.** Reuse the existing CLIs. Validate physical depth before encoding: pale mortar may be recessed; pigment need not be embossed. Never use brightness alone as semantic proof.
6. **Verify independently.** Reconstruct source/codec/math, inspect full-resolution material, compare BOTH native and decoded replacement at native/2 and native/4 using the same BOX filter, and review repeats/corners plus height/XYZ/opposed lights at both tiers. Similarity means representative colour, forms and scale, not pixel equality. Numerical PASS cannot overrule an art finding.
7. **Register, preserve, checkpoint.** Register only per-material passes or proven accepted-art aliases. Keep holds visible. Preserve decisive failure evidence and all active inputs before retiring superseded owned binaries. Commit only owned paths through maintained gates; distinguish local checks, CI, runtime/owner acceptance and release.

## Repair routing

Read [repair and verification contracts](references/repairs-and-verification.md) only when needed. Reuse current mechanisms rather than adding another pipeline:

- Coarse colour/landmark fit: `prepare_texture_master.py` and its existing finishing controls.
- Confirmed unqualified Y boundary defect: `register_texture_boundary.py`; review both axes/corners afterwards.
- Known facing/substrate hierarchy: `prepare_layered_texture_master.py`, with source-measured masks and a qualifying source/master proof.
- Source-measured rounded hardware on a near-flat plate: `prepare_rounded_cap_texture_master.py`; continuous cap geometry, unchanged RGB and actual physical review, not a binary raised mask.
- Confirmed X/Y seam in an already layered candidate: `register_layered_texture_boundary.py`; retain its parent RGB/float inputs and requalify both decoded tiers. Read the conditional repair contract first.
- Missing flat chromatic mark inside accepted geometry: `prepare_motif_texture_master.py`; bounded source guide, canonical outside RGB and initial float height unchanged.

None of these commands qualifies a source merely by running. Do not copy another texture's coordinates, depth planes or smoothing values without source-specific review. The current tier CLI covers opaque RGB surfaces; special alpha/glass, emission, liquids, skies, animation, models, sprites and UI require their own native semantics and qualification. Their incomplete coverage must remain in the campaign ledger.
