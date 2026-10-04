# Rock visibility, lighting and corner sampling — working increment

Owner reports: grain/doubled texture lighting in dim rooms; distance-dependent
cliff popping and eventual flat walls; excessive white daylight highlights but
unreadable dark relief; projected texture artifacts at geometry joins. Original
level geometry, collision, albedo assets, continuous fields and saved presets
must remain intact. Earlier features and owner texture edits remain local.

## Resulting implementation

The macro amplitude no longer fades between 900 and 1600 units. The scheduler
includes the full bounds of visible faces and their existing shadow halos, plus
nearby faces within 512 units of their world bounds while looking away. It no longer
drops a visible face because its center is more than 1800 units away. Visible
interior pages have priority over halos and nearby offscreen faces; the entire
selected working set is protected from LRU eviction before installation.

The game atlas grows from 96 pages to its current demand, bounded by the actual
GPU array-layer limit and 2048 pages (approximately 18.6 MiB of HALF heights at
maximum). The hash table has 4096 entries. Growth preserves existing bytes and
page indices, updates the uniform and disposes the previous GPU texture. Prepared
uploads batch their table rebuild. Direct standalone caches retain their 96-page
default. Diagnostics expose desired/missing/overflow counts; constrained hardware
or unusually large custom working sets can still exceed the bounded capacity.
GPU page lookup loops over the actual collision-depth uniform, avoiding a large
constant loop that could encourage shader unrolling. No generator/preset/map
changes require rebaking the prepared data.

The previous pixel-random eight-direction bounce rotation is replaced by sixteen
fixed directions. Normal/distance packets use nearest filtering rather than
blending unrelated receivers into a second apparent surface at an edge. These
changes target low-light speckle and camera crawl without disabling bounced light
or adding source-free illumination. Pixel-footprint filtering of the height
gradient suppresses subpixel normal aliasing; it does not fade field amplitude.

Rock walls use 80% of their displaced normal for direct source lighting rather
than the generic 30% bump mix. Their macro normal starts from the face normal and
height derivatives; 20% of the authored micro-normal deviation remains. Ordinary
materials keep the generic normal response. Macro cavity shading samples a .30
tile neighbourhood, rather than the .03 tile grain neighbourhood, so broad
recesses receive an appropriate depth cue while peaks remain unattenuated. The
AO multiplier bottoms out at .18 to preserve readable pigment in deep recesses;
it attenuates existing light and does not add a source-free brightness floor.

The class-10 rock-wall response keeps strong half-brightness relief shadows.
Exposed daylight stays at factor 1; exposed surfaces reached only by a dim source
can reach factor 2. A receiver whose original HDR lighting is already bright
suppresses that additional gain, including grazing daylight. This restores readability without doubling daylight into
white. No reached source means factor 1; other receivers are excluded. Actual
point, sun and shoulder-light occlusion and local self-shadows still determine
the visibility ratio. Material color assets are unchanged.

View projection is checked for Jacobian conditioning and bounded to .75 native
texture tile. Up to six convex native face-edge planes constrain texture travel.
A smooth taper approaches an edge without pinning many pixels to a single edge
texel. Unsupported/degenerate UV faces keep neutral view projection; full height
shading remains active. The accepted pigment displacement also determines the
macro height/normal/shadow hit, avoiding a second unconstrained image around a
fold. Native position/UV buffers and connected chart identities are unchanged.

## Rejected trials and verification limits

The owner rejected the first lighting revision as having no visible detail. Its
neutral shadow gain and overly tight .12 tile view limit weakened the appearance.
Those settings are superseded by restored strong shadows, substantial bounded
projection, stronger macro-normal response and broader cavity shading. An early
hard edge clamp created stretched texel bands in the actual preview; that rejected
image is retained, and smooth edge taper replaces it.

`rock-lighting-depth-final-current-tests-2026-10-03.txt` records the current targeted
regressions. They include the actual helper response at dim/daylight/source-free
levels, convex face/winding/degenerate constraints and immutable native data, a
whole distant cliff kept beyond the old cutoff while walking backward, near-region
retention, old default-cache behavior, all prepared maps, fresh main entry, demo
and ordinary lighting contracts. `rock-relief-final-response-gpu-2026-10-03.txt`
records 559 passing actual GPU material/mask/decoder/highlight checks with no
shader errors. This fixture tests the response separately from a full map.

The ordinary E1M1 trial also exercises the real macro shader. Its completed
near/far states have no missing/overflow pages, no generation jobs and no page
errors on the available GPU. Keep final live receipts and images alongside this
record; historical passing receipts do not qualify a later shader revision.

Independent planning/testing agents supplied initial diagnoses, then their turns
failed due to service usage/authentication limits. Final changes and verification
were performed by root; independent final review has not been completed for this
increment. Owner appearance acceptance and sustained performance are also not
claimed. This is a local working trial, not a commit, push or qualified release.
No durable background follow-up job has been submitted; root owns continuation
and the next appearance check with the owner.

Try `http://localhost:8013/tests/rockfield_gameplay_trial.html`, refreshing to load
the latest shader. “Cliff close-up” and “Step back from cliff” compare two valid
native player positions. “Relief on/off” preserves the original map and textures.

## Final evidence

- Targeted gate: 49/49 in eight suites, `rock-lighting-depth-final-current-tests-2026-10-03.txt`.
- A three-case follow-up in `rock-lighting-cavity-contract-tests-2026-10-03.txt` additionally executes the final cavity expression: peaks remain unattenuated, deepest recesses preserve pigment and amplitude increases occlusion. Its initial expression-selection harness error is retained separately.
- Actual GPU material/response gate: 559 checks pass, zero failures/shader errors in `rock-relief-final-response-gpu-2026-10-03.txt`.
- Full E1M1 shader: `rock-relief-depth-final-live-2026-10-03.txt` records 510 resident pages, zero missing/overflow/generated pages, no page or GL errors. Earlier retreat receipt records the valid moved player position and retained working set; shader changes after that receipt do not claim another traversal qualification.
- `rock-relief-readable-final-2026-10-03.jpg` shows the final owner-facing view; `rock-lighting-stability-final-identity-2026-10-03.json` records source/test/receipt hashes and local checkout identity.

The owner explicitly rejected the earlier neutral-shadow appearance. The latest strong-shadow/readable-cavity revision is a new working trial; owner acceptance remains outstanding. No commit or push has been performed.
