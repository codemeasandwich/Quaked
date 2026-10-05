Later increment: [progressive inner illustration, locked folios and menu](bestiary-progress-2026-10-04.md) replaces the unconditional inner illustration with five earned pieces and revises the dedication. Historical originals remain local, outside the scoped runtime commit.

# Complete artwork and cover dedication — 4 October 2026

All **47 creature illustrations** listed in the owner's Contents are installed. The previous inventory batch contributed 18 new creature pages and a revised Egyptian Guardian; the latest batch supplied Grunt, Enforcer, ordinary Ogre, Spike Mine and the dedication. There are no remaining artwork gaps.

The canonical asset folder contains 53 PNGs: 47 creatures plus the outer cover, ordinary inner illustration, Complete Edition inner illustration, Contents, parchment reverse and dedication. The earlier Egyptian Guardian is retained unchanged in `newer/bestiary/alternates/egyptian-guardian-original.png`; the latest staff revision is the canonical page. All **54 retained files** are byte-identical to their supplied sources. `SOURCE.json` records every source and SHA-256 hash; no lettering, folios or pixels were edited.

## Opening and collection behavior

Opening the outer cover reveals **dedication on the left, illustrated inner cover on the right**. The dedication is the cover's reverse, rather than a separately numbered creature page. Subsequent leaves retain the supplied parchment on the left/reverse: Contents, then one creature illustration per right-hand leaf. Shared page indexing is used for static spreads and both directions of the existing 320ms turn animation, so returning to the first opening also restores the dedication.

The dedication is always available and grants no discoveries. Its loader uses the same cached decode, 30-second deadline and terminal failure guard as other unconditional front matter. A failed dedication image leaves neutral paper without interrupting navigation or changing progress.

Complete Edition still requires **all 47 distinct collection IDs**. It replaces only the right-hand inner illustration; the dedication, outer cover and Contents remain unchanged. Forty-six entries, repeat discoveries, unrelated IDs and downloaded artwork cannot complete the collection. The ordinary inner cover remains during completed-art loading/failure. Tests retain every missing-one case and full-collection persistence.

The existing 28 catalog IDs and their relative order remain unchanged; the remaining 19 append in collection order. Grunt, Enforcer and ordinary Ogre receive their supplied art without changing their IDs. `quaked.bestiary.v1` remains version 1; discoveries are retained across plays/maps/tabs in the same browser origin/profile. Existing Egyptian discoveries are preserved, rather than retroactively removed when its native ownership distinction is refined. Printed folios are left as authored, and their numbering still differs from the supplied Contents ordering.

## Native discovery mappings

The 19 appended entries now have researched classifier mappings. Exact files, line ranges, source hashes and authored Guardian captions are retained in the [research receipt](evidence/bestiary-complete-native-research-2026-10-04.json), using the [official id Software Quake rerelease QuakeC source](https://github.com/id-Software/quake-rerelease-qc).

- Infected Grunt uses the ordinary `monster_army` classname with soldier model, `infected === 1` and `army_infected_die`; ordinary Grunts retain their own page.
- Demo Dog uses rewritten `monster_dog`, explosive dog model and `demodog_die`. Rocket Ogre uses rewritten `monster_ogre` with its rocket model. Base variants do not inherit these pages.
- Statue Knight/Death Knight require their ordinary classname/model, resolved flag 2 and skin 1, plus both loaded Rogue pause routines. Infection classification takes precedence. Awake statues retain their flag and skin; classification does not depend on present animation or health.
- Hell Spawn requires actual tarbaby model, resolved skin 1 or 2 and loaded `tbaby_mitosis`. The initializer may choose it randomly without a flag. The original temporarily clears its pain callback during division and offspring keep the skin without further division, so a transient pain callback is deliberately not the identity gate. Splitting Spawn's positive slime discriminator takes precedence.
- Spike Mine uses the real live `trap_spike_mine`, `spikmine.mdl` and `spikemine_Touch` callback. The nonworking `monster_spikemine` placeholder is excluded. Armagon uses the health-owning `monster_armagon`/`armalegs.mdl`, excluding its classless cosmetic torso entity.
- Ranged Death Knight, Mummy, Gremlin, Blood Shambler, Wrath, Orb and Hephaestus require their verified class/model pairs. Dead Dragon aliases and unrelated models remain excluded by prior rules.
- Chthon — Vengeance requires boss model, killable flag 2 and native `boss_death1`, separately from Sleeper's `boss_final_death1` and ordinary Chthon. “Vengeance” is the author's page association with the source's killable branch, rather than a literal QC classname.
- Guardians share `monster_morph`. A positive native `owner` and any of the three resolved Guardian models identifies a summoned ordinary Guardian. World-owned originals map Greek → Quake's Guardian, Egyptian → Egyptian Guardian, Aztec → Quake's High Priest. These associations match the supplied page captions. Current health, effects, changing skin and overlapping map flags are not used as identity substitutes.

The adapter reads built-in `owner` as the engine's integer entity reference. Extended `infected`/`slime` use the existing float field accessor; extended `th_die` uses its integer function index and the current program's function name. QC capabilities refresh when the function array changes, and program loading clears extended field caches. Discovery reads introduce no native field writes.

## Verification and evidence

Independent planning, public-interface testing and source review completed. The final gate passed **69/69, exit 0**, on its first run: state 14, real-canvas book presentation 9, immutable assets/loader 8, native integration/adapter 6, plus 32 retained menu/startup/lighting controls. **208 source/test/art hashes** stayed unchanged throughout the gate and were checked again afterward.

The native adapter witness uses real base-game edicts, typed field access, posed alias meshes, sightlines and local transport. Controlled metadata/function names verify Guardian ownership, both statue capabilities, Hell Spawn capability and program-cache restoration; no expansion AI is executed. A runtime-only mutation replacing native owner with zero fails only the new bridge test (5/6); workspace source remains unchanged. This demonstrates that the adapter proof detects a broken owner read, separately from pure classifier tests.

- [69/69 gate log](evidence/bestiary-complete-tests-2026-10-04.txt)
- [Public receipt, exact command and limits](evidence/bestiary-complete-public-receipt-2026-10-04.json)
- [Qualified source hashes](evidence/bestiary-complete-source-2026-10-04.sha256.json)
- [All 54 original-byte comparisons](evidence/bestiary-complete-art-proof-2026-10-04.json)
- [Expected owner-read mutation failure](evidence/bestiary-complete-owner-mutation-2026-10-04.txt)
- [Opening-spread browser diagnostics](evidence/bestiary-dedication-native-2026-10-04.json)
- [Dedication facing the illustrated inner cover](evidence/bestiary-dedication-native-2026-10-04.jpg)

The actual Newer E1M2 browser trial displayed the dedication on the left and original inner cover on the right. Existing discoveries remained `grunt, knight, zombie, ogre, fiend`, completion stayed false and GL error was zero. Its Chromium input/pointer-lock UnknownError remains recorded; this is not a zero-browser-error claim. No artificial discoveries were written to the user's profile.

## Try and delivery boundary

In the [game trial](http://127.0.0.1:8015/tests/bestiary_trial.html), choose **Open bestiary**, then **Next page** once. If controls are hidden, F2 restores them. The normal game's Bestiary menu uses the same presentation. Further turns reach Contents and all 47 creature titles; each illustration remains gated by its own discovery.

Artwork completeness and the requested dedication placement are delivered as an uncommitted working trial. Installed base-game behavior, classifier inputs and native adapter transport are verified. Actual mission-pack/Dimension/Dawn gameplay, engine compatibility and physically earning every expansion discovery remain unverified because those packs are not installed. Armagon's generic first-sighting bounds inspect its live legs mesh, rather than claiming an untested composite portrait with its separate torso.

No commit, push, release or content installation was requested or performed. Owner presentation acceptance remains separate. Explanatory README/trial copy and these notes were updated after the gate; qualified runtime/tests/assets remained unchanged. Earlier increment documents and their receipts remain historical evidence.
