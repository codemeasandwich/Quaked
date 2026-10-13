# Gremlin: photographic character at the 4x standard

The owner's correction calls for realistic, detailed, stylized characters that
retain the original colour and artistic intention without grainy surfaces.
The native Gremlin fixes layout, palette and design; the owner's enhanced
Shambler and selected Ogre supply material-quality references only. The new
art uses coherent flesh planes, purposeful folds and a compact expressive face.

## Source and native identity

Selected source: grem-character-face.png, 1692×929, SHA-256
9733ca0523d1edcd2ea5899335d09746b85a907153cdae938abe127c9ef35a31.
Exact prompts, rejected grainy art and earlier character art are retained beside
the pinned grem-character.json recipe. No native pigment enters the output.

Native progs/grem.mdl keeps SHA-256
bdc4443c3a0d0bb30b4302bb7b1d9759344690c6148bea08a747436191325763,
123 vertices, 245 triangles and all 179 poses. Only skin zero is replaced.
Four triangular inserts and both detached weapon surfaces remain assigned.

## Fitting and prepared normals

A whole-sheet resize failed the original fitting investigation. The optional
piecePlacements extension reuses crop/resize and bounded edge filling.
Eight isolated source components own ten native UV components, including two
one-pixel slivers. Weapons/inserts inside a body crop cannot donate body pigment.
Invalid bounds, seeds, repeated owners and incomplete native ownership fail
before publication; ordinary recipes retain their existing behavior.

The owner subsequently standardized runtime art at 4x native dimensions.
Reviewed destination boxes scale by 2/3 from the previous 6x trial; source boxes
and artwork stay unchanged. The final 1232×676 fit covers 412,197 surface pixels,
with 5,679 bounded edge pixels and none uncovered. The 24-pixel reach is unchanged.
Catalogue 51 invalidates old cached art.

Height is authored from the final fit. Its exact prepared normal key is
d850c3b15b9f8ae15af14c6ef84e2311ae1a8a01bde6f6e4195e2962178f2a2e.
The previous unreferenced Gremlin sample is replaced; native normals and every
other enemy remain unchanged. Registry, manifest and distribution snapshot agree.
Approved Dog/Ogre artwork and randomized Ogre faces remain untouched.

## Fresh verification

Evidence: ../fidelity-2026-10-13/evidence/grem/

- Four independent public-CLI tests verify landmarks, all ten components,
  adversarial donor isolation, five invalid-recipe cases and pixel-identical
  legacy 4x Rotfish diffuse/height output.
- Six runtime cases verify all native UVs/poses, weapon folding/extension data,
  exact source binding, Classic/failure/cancellation and prepared-normal input.
- Production rendering passes 194 checks over 197 draws and all 179 poses,
  with two shipped normal variants, no generated fallback and no runtime errors.
- Distribution policy passes with 2,268 runtime dependencies.
- The official body audit passes36cases: all50slots,34nativeidentities and102preparednormalinputs remain complete.

Views 18/19 are matched original/enhanced front, 20/21 back, 22/23 and 24/25
obliques. View 13 shows the firing pose. These are controlled actual-model
checks, not a claim of combat-AI verification or owner aesthetic acceptance.

The earlier 6x candidate and failed low-disk DMG commit remain preserved in the
original checkout and Git tree 7cd77f896c60e3dbbe602f1df44dad27c4bdada2.
They are historical evidence, not qualification of this 4x candidate. Integration
uses a separate worktree based on Devd436a653 (Quoth changes integrated without enemy/render changes), preserving shared root edits and
deleted records. The old generated recipe explicitly points to its successor.

## Reproduce and try

Run the existing fit_generated_skin.py CLI with grem-character.json and
--pack '/Users/bri/quaked/Scourge of Armagon/pak0.pak', using system Python.
The normal baker uses the same pack plus
--palette-pack '/Users/bri/quaked/shareware/pak0.pak',
--namespace hipnotic --skins --maps '^progs/grem\\.mdl$' --variant grem/custom.
Set the existing Three.js and canvas module environment paths. The optional
palette argument retains the legacy default when absent.

Serve with python3 tools/serve.py 8000 --game-root /Users/bri/quaked.
Open tests/rogue_skin_gpu_trial.html?model=grem&externalGames=1 and Run.
The opt-in external-game paths preserve legacy fixture URLs when absent.
