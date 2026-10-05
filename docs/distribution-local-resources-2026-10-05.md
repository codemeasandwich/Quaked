# Distribution classification: local developer resources

The first working increment for task `[9a]` adds one exact root ignore rule:

```gitignore
/Gemini_Generated_Image_ea7a33a03-2346-46b.jpeg
```

The original skin sheet remains readable and unchanged locally for `[31c]` native UV fitting. That card explicitly requires the development JPEG to stay local/ignored after classification; reviewed runtime derivatives have a separate enhancement-asset path. This change uses Git's existing ignore policy. It does not add an asset loader, packager or audit subsystem.

Try the rule on branch `bluey-distribution9a`, from the checkout root:

```sh
git check-ignore -v --no-index Gemini_Generated_Image_ea7a33a03-2346-46b.jpeg
```

Expected: exit 0 and the literal `.gitignore` rule above. `--no-index` also checks a tracked-name control without changing tracking. Normal `git check-ignore` ignores tracked files; an ignore rule does not untrack existing content or remove it from an archive or GitHub Pages. No files are deleted, moved, untracked or restored by this increment.

The effective classification is conservative:

| Material | Effective handling |
| --- | --- |
| Original `[31c]` JPEG named above | Local developer source; only newly approved exclusion. Preserve its bytes for fitting. |
| Other 27 original candidate paths | Retain with an exclusion hold. No ignore rule is approved for them; donor/provenance and owner-requested work need review. |
| Engine/server source, runtime assets and manifests | Retain. Existing packed/loose transport, gameplay, Classic presentation, save data and source/program paths are unchanged. |
| Import/test tools, donor ZIPs, source recipes and notices | Retain for reproduction and provenance. Runtime non-use does not make source disposable. |
| Technical documentation and `Procedural Surface Enhancement Infographic.png` | Retain as public project documentation under `[32a]`/`[32b]`; this rule cannot match them. |
| Existing `resources/`, desktop and Python caches | Existing local-only policy remains. Private native installations are not approved public assets. |

The 27 retained candidates include the other seven Gemini sheets; the water-reference PNGs, cover and deleted JPEG; UUID and other root artwork; `arc-weapons-wall-canvas-shotgun.html`, `demon-vision.html`, `fieldlab-fx-3d-updated.html`, both root menu HTMLs, `font.zip` and the supplied shield GLB. The machine-readable evidence records each exact path, its effective retain/hold action, provenance references and owner-task links where established. Missing filename references alone authorize neither exclusion nor disposal. Assigned feature work keeps access to its source materials.

## Corrected path evidence

The initial audit incorrectly treated `logo.png` as a substring of the loaded studio-logo path. On baseline `b536c9359a4ac37c4541a9debce76991fcd20ef1`, `index.html:71` loads **`newer/ui/studio-logo.png`**. `src/studio_logo.js:18` resolves **`../newer/ui/studio-logo.png`** relative to that module, producing the same runtime path. Neither call loads root `logo.png`. [The existing studio document](studio-logo-2026-10-04.md) records the installed runtime asset and preservation of the root owner file.

Root `logo.png` is conservatively retained owner material, with no exclusion approved and no runtime-consumer claim. The runtime studio logo remains retained. Original failed report/manifest/hash receipts remain unchanged in the lane's private Bluey outbox; corrected effective classifications and caller-resolved references are separate receipts. Bulk private machine/resource inventories are not part of this source commit.

## Checks and remaining boundaries

Public Git checks compare the baseline ignore policy with the one-rule candidate using `git check-ignore --no-index`: the exact JPEG gains an exclusion; all 27 held candidates, both logo paths, the public infographic/docs, source/runtime paths and required ZIPs gain none. Normal tracked/untracked behavior is checked separately. Canonical input bytes, owner Ogre, the developer JPEG and owner-deleted JPEG/rockfield HTML absence are compared before/after. No game, browser, server, build, rebake or suite is needed for this Git-policy change.

Baseline reproduction limits remain: the owner-deleted `rockfield-v1.0.0.html`/`rockfield-v1.6.0.html` and several historical donor ZIPs are absent locally; `deno.json` refers to absent root `game_server.js`. Preserve those failures and existing tests; this change does not resolve them. `shotgun.zip` and `dem4_4_maps.zip` remain retained import/test inputs. Existing generated runtime assets under `newer/` remain retained even when regenerable.

Existing GPL code notices, third-party weapon licenses, shell attribution and music/HUD/texture provenance remain required. Asset possession and functional classification do not establish redistribution rights. `font.zip` had no license/README/credit-named member in the bounded archive-directory inventory; it stays held. Private MDLs/owned-game archives are not copied into public source. Legal notices `[10]`, enhancement packaging `[9b]`, independent review and landing remain separate work. This increment is a source-only Git-policy handoff, not qualified public distribution or full-card completion.

The change adds one literal rule and maintained documentation, so it scales with Git's existing policy, preserves runtime performance and avoids a competing mechanism. Narrow scope and explicit holds keep maintenance and security boundaries reviewable.
