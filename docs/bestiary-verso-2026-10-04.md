Later increment: [complete artwork and dedication](bestiary-complete-2026-10-04.md) installs all 47 creature folios and the dedication on the cover reverse. This document retains the earlier 28-entry verification.

# Nine folios and parchment page backs — 4 October 2026

The owner's nine additional creature illustrations and blank bordered parchment are installed byte-identically. The book now has **28 creature entries, 25 illustrated**, following outer cover → inner illustration → Contents. Every open leaf has a creature/front-matter illustration on the right and the supplied parchment reverse on the left. Turning pages use that same parchment on the reverse; the book no longer puts a second creature illustration on a leaf's back. Existing keyboard/touch controls and the 320ms hinge animation are reused.

## Installed assets and identity

| Stable ID | Supplied file | Printed folio |
|---|---|---:|
| `chthon_sleeper` | `chthon-sleeper.png` | XLVI / 46 |
| `shub_awakened` | `shub-awakened.png` | XLVII / 47 |
| `splitting_spawn` | `splitting-spawn.png` | XLV / 45 |
| `infected_death_knight` | `infected-death-knight.png` | XLIV / 44 |
| `overlord` | `overlord.png` | XXIX / 29 |
| `infected_enforcer` | `infected-enforcer.png` | XLIII / 43 |
| `egyptian_guardian` | `egyptian-guardian.png` | XXXII / 32 |
| `dragon` | `dragon.png` | XXXIV / 34 |
| `infected_knight` | `infected-knight.png` | XLII / 42 |

`verso.png` is the unconditional parchment page-back asset. It uses the existing lazy cached loader, bounded 30-second deadline and terminal failure protection. If unavailable, the neutral paper fallback remains. No supplied PNG was cropped, mirrored, recolored or rewritten. All 20 previous PNGs remain identical; `SOURCE.json` records all 30 sources and SHA-256 hashes.

The nine entries append to the earlier 19, preserving prior IDs and relative order. The earlier `chthon` / `chthon.png` and new `chthon_sleeper` / `chthon-sleeper.png` remain separate pages. The owner's reply requested separate indices for the two versions; the final Chthon callback distinguishes the newly supplied Sleeper illustration. No earlier page is replaced. Printed folios remain as supplied, even where their numbers differ from the Contents numbering.

## Discovery adapter

Mappings were checked against the [official id Software Quake rerelease QuakeC source](https://github.com/id-Software/quake-rerelease-qc), including Rogue and Dawn of the Machine (`quakec_mg3`). The [research receipt](evidence/bestiary-nine-folios-research-2026-10-04.json) preserves the exact archive/source hashes and line ranges. The source identifies a distinct final Chthon but does not itself contain the authored Sleeper label; the owner-directed separate-page association is recorded above.

| Page | Actual runtime discriminator |
|---|---|
| Overlord | `monster_super_wrath` + `progs/s_wrath.mdl` |
| Egyptian Guardian | `monster_morph` + resolved `progs/morph_eg.mdl`; flags alone are insufficient because Aztec overrides Egypt when both flags are set |
| Dragon | `monster_dragon` + `progs/dragon.mdl`; `monster_dragon_dead` excluded |
| Infected Knight | `monster_knight`, `progs/knight.mdl`, `infected === 1`, callback `knight_infected_die` |
| Infected Enforcer | `monster_enforcer`, `progs/enforcer.mdl`, `infected === 1`, callback `enforcer_infected_die` |
| Infected Death Knight | `monster_hell_knight`, `progs/hknight.mdl`, `infected === 1`, callback `hknight_infected_die` |
| Splitting Spawn | `monster_tarbaby`, `progs/tarbaby.mdl`, positive `slime`, loaded `SlimeMissile` and `SlimeMissileTouch` capabilities |
| Chthon — The Sleeper | `monster_boss`, `progs/boss.mdl`, callback `boss_final_death1` |
| Shub-Niggurath — Awakened | `monster_oldone_new` + `progs/oldone.mdl` |

The infected/slime/final-boss spawn routines rewrite their initializer classnames, so classification runs these cases before ordinary base fallbacks. Missing/wrong variant state retains the ordinary page. Splitting Spawn descendants with zero slime cannot split and therefore use ordinary Spawn classification. No invented initializer aliases were used as runtime identities.

The adapter reads `infected` and `slime` through `GetEdictFieldValue(...).accessor.getFloat(...)`. Crucially, `th_die` is an extended QC function field, read with `getInt32` and resolved through the loaded function table; it is not a built-in `native.v` property. Program reload replaces the function table and clears native field caches. The adapter performs no gameplay field writes.

The `quaked.bestiary.v1` storage key/version, existing discoveries, and **all-47-ID completion gate** remain unchanged. Rendering a reverse or visiting these catalog titles grants no discoveries. Neither ordinary base creatures nor their earlier discoveries unlock the new variants. Snapshot ordering deduplicates the display catalog separately from collection-only identities.

## Verification

Independent planning, source review and public-interface testing completed. Final corrected source: **63/63 checks passed, exit 0**, across state (12), book (8), assets (6), native (5), and retained menu/startup/lighting controls. All 184 source/test/art hashes stayed unchanged through the gate and were rechecked after it.

Review caught an initial callback adapter bug (`native.v.th_die` was undefined). That read was corrected before final qualification. The new native witness uses a real visible native edict, mesh, sightline, loaded `th_die` offset and actual typed accessor through `R_BestiaryObserve`; controlled callback names and an explicitly staged infected QC scalar prove adapter transport without pretending that a mission pack was executed. Map reload checks prevent fixture state from leaking. A runtime-only mutation restoring the old callback read fails exactly this new witness, while workspace source stays untouched. The earlier 62-case gate is retained as a pre-fix constituent rather than final qualification.

- [Final 63/63 log](evidence/bestiary-verso-tests-2026-10-04.txt)
- [Public receipt, command and qualification limits](evidence/bestiary-verso-public-receipt-2026-10-04.json)
- [Qualified 184 source hashes](evidence/bestiary-verso-source-2026-10-04.sha256.json)
- [Original-byte comparison of all 30 PNGs](evidence/bestiary-verso-art-proof-2026-10-04.json)
- [Expected old-bug mutation failure](evidence/bestiary-verso-callback-mutation-2026-10-04.txt)
- [Native browser diagnostics](evidence/bestiary-verso-native-2026-10-04.json)
- [Displayed parchment/Contents spread](evidence/bestiary-verso-native-2026-10-04.jpg)

The real browser trial displayed the supplied parchment beside Contents. Profile discoveries stayed `grunt, knight, zombie, ogre, fiend`, completion stayed false, and GL error was zero. Its retained Chromium input/pointer-lock UnknownError is not relabeled as a clean browser run. The user's profile was never artificially filled to preview locked illustrations.

## Try and remaining limits

Open [the game trial](http://127.0.0.1:8015/tests/bestiary_trial.html), choose **Open bestiary**, then advance through the inner illustration and Contents. Each further turn advances one creature. If the controls are hidden, F2 restores them. The normal game's Bestiary menu uses the same presentation. All 28 catalog titles can be browsed; creature artwork remains gated by its own discovery.

The added mappings have researched classifier and adapter evidence. Mission-pack/Dawn gameplay and engine compatibility remain unverified because that content is not installed. The remaining 19 collection identities still need their own verified native mappings; Grunt, Enforcer and ordinary Ogre artwork is also pending. Thus the full 47-page Complete Edition cannot yet be earned through the installed game. This request did not authorize installing mission packs or a separate future implementation campaign.

Changes remain uncommitted and awaiting owner presentation acceptance. No release or push was performed. Explanatory trial/README copy and these notes were updated after the gate; the qualified runtime, tests and assets remained unchanged.
