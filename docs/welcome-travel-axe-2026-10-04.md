# Welcome, travel and axe increments

Publication authority update: the owner requested **commit and push** on
2026-10-04. This supersedes the earlier local-only authority statements below;
those statements and receipts describe their original verification stage.
See [combined commit verification](enhancements-commit-2026-10-04.md).

Owner request: after power-up fire, deliver in increasing complexity: early
START corridor flashlight; E1M1 exit-machine approach sound; replace START's E1
machine with a one-way passage into E1M1; recess level windows through arch
thickness and conceal return blockers; quad axe fatal bisection and quad plus
pentagram axe lethal gib damage for projectile-damageable enemies.

## First playable increment

`world.js` uses the native START entrance `trigger_multiple` messages to invoke
the existing once-per-choice flashlight policy. The original difficulty cvar
and late skill triggers are unchanged. Easy and Normal start the light at the
corridor entrance; Hard chooses off. Local living single-player, active enhanced
run and exact native map/class/message gates prevent unrelated triggers from
changing it. Repeated touches and later same-skill selection preserve manual off.

The existing E1M1 `ambience/drone6.wav` emitter at (1314,450,-200) gets a smooth
950-unit falloff, capped at 60% of its original near-source level. The original
loop, channel, stereo panner and effects-volume bus remain in use. At the native
ramp bottom (1312,1248,-344 floor), its stereo gains are 5/127; at the top they
are 19/127, increasing on further approach. Other sources and Classic retain
their exact original attenuation. E1 was interpreted as E1M1, pending the
owner's clarification/acceptance.

Try `tests/welcome_ramp_trial.html`. This is a real game trial, with a protected
test player and buttons that position or move it through native collision. The
trial deliberately mutes music so the machine can be judged separately.

Verification: [28/28 focused tests](evidence/welcome-ramp-tests-2026-10-04.txt),
including independently authored real-QC movement tests and actual E1M1 signon
sound parsing. Test Web Audio endpoints are silent doubles; browser evidence
also confirms the real looping channel. Owner listening acceptance is pending.

Browser cache initially supplied the old `world.js` despite page reload. The
trial exposed its loaded-function identity, then repeated at
`http://127.0.0.1:8013/tests/welcome_ramp_trial.html` with fresh modules. Actual
native entry now activates the light; no production workaround for that cache
was introduced. Earlier unsuccessful observations are not delivery evidence.

## Passage and arch implementation

The enhanced welcome map is built from the original START source. Its eleven
machine brushes are removed. Six convex pieces retain the surrounding wall and
its sixteen-unit thickness around a bevelled 144-by-96 opening. A sealed stub
continues the floor behind the cut. The corresponding drone is removed and the
instruction text describes the corridor. Other episode gates remain intact.

`tools/build_start_corridor.py` consumes the original archive and the owner's
native textures from `pak0.pak`; it does not modify either original pack or the
art bundle. Run it with the archive path, ericw-tools v0.18.1 binary directory,
and a temporary output directory. The generated `maps.pak` is installed as
`newer/maps.pak`; `tools/maps/start-corridor.map` retains the authored result.
The compiler runs full visibility and lighting after a required leak check.
[Build provenance](evidence/start-corridor-build-2026-10-04.json) and
[compiler output](evidence/start-corridor-build-2026-10-04.txt) are retained.
The original source's existing self-targeting registration-trigger warning is
retained; it is unrelated to the edited passage.

The small geometry pack is preloaded through the existing PAK reader (from the
art bundle when embedded there, otherwise its loose file), admitted
only for `maps/*.bsp`, and selected only for supported local single-player Newer travel. Multiplayer,
dedicated, remote and demo contexts retain original geometry. Client signon
requires a live paired loopback socket and the server’s recorded map choice.
Server loading synchronizes
that mode before reading model bytes. Link-cache entries retain actual source
buffer identity, so switching modes cannot reuse the wrong map metadata. A
fresh Classic game still loads byte-identical original START. The compiled
enhanced map has rebuilt lightmaps; no claim of pixel-identical lighting
elsewhere in that enhanced map is made.

The authored exit's `_seamless_oneway` tag uses the existing seamless transfer
and suppresses its inverse link. Real movement reaches E1M1 at `(480,-388,88)`;
native collision stops a backward move at approximately Y=-399.97. The backing
wall already exists, so no extra gameplay blocker appears in front of the player.

`r_archframe.js` measures the actual frame extrusion from BSP polygons adjoining
its front face. Opposite sides and the roof must agree on the far endpoint.
This works even when bars split inner throat faces. The complete coplanar frame
continuations are protected before any contained bar/plate faces are hidden.
There is no guessed 32-unit fallback: unidentified geometry retains its original
window position. E1M2 and E1M3 both measure 32 units; scaled fixtures measure 16
and 48. The visible plane sits 0.25 units before the far face to avoid z-fighting.
Outgoing gameplay crossing moves to that same far plane; a forward threshold
is never pulled backwards in front of a key gate. Return crossing stays near.
The receiver's oblique clipping plane is the rigid transform of that same plane.

Return collision and the reachable near crossing are retained. Native E1M2→3,
E1M3→4 and E1M4→5 forward arches all measure 32 units; their offered return
frames measure 32, 24 and 24 respectively. All six directions pass actual
player-hull movement without fixture unlocks; this does not claim a full
playthrough of the preceding key puzzles. E1M3 hides
exactly fourteen interior static bar/plate faces and keeps its structural
bevels. Matched inline brush blockers are likewise hidden only in presentation, keyed by
the actual BSP surfaces identity so reused inline model names cannot affect
another map.
These faces are excluded from enhanced shadow capture. Classic's scene scope
explicitly restores batch-instance and brush visibility, then rolls it back;
world collision arrays are untouched. Native movement, not proximity alone,
triggers return travel before the hull is stopped by the retained bars.

Try `tests/travel_trial.html`: Welcome passage, Inspect opening, Walk across,
Look back; or E1M2 exit arch, Walk across, Look back, Walk across to return.
The fixture protects and positions its player; production uses ordinary input.
The first passage has also been traversed in the live browser with no recorded
runtime errors. See [arrival evidence](evidence/start-passage-arrival-2026-10-04.json).

## Powered axe implementation and bounds

The native QuakeC chain remains `W_FireAxe -> T_Damage -> Killed -> th_die`.
Hooks require native program identity, local single-player Enhanced mode, an
actual axe damage call and an active quad timer. Extended power-up timer fields
are read through the QuakeC field accessor, not JavaScript expando properties.
Misses, ordinary axes, nonfatal hits and expired power-ups retain native behavior.

The original axe blade edge is MDL vertices 82–83. The cut normal is the cross
product of its impact-frame edge and its midpoint movement from frame 2 to 3
or 6 to 7, transformed by the player's attack view. The native file identity is
checked before using those indices. This is an animation-derived plane, not a
new physical blade collision system. Its location is the captured posed body's
center so the result bisects the body rather than clipping a hull-contact sliver.

The captured original enemy pose is split into positive and negative halves.
Skin attributes are interpolated, contour loops are closed and hole-aware cap
triangulation preserves genuine holes. Numerically collinear cap slivers are
filtered at Float32 relative precision. Native source buffers are immutable.
Original single-sided decorative sheets can create dangling intersection
branches or interior chords. A planar half-edge traversal extracts the enclosing
volume contours without changing those original skin triangles. Concave nesting
tests entire contour edges, including intervals separated by outer-boundary
intersections; testing only vertices is insufficient.
The original enemy index and captured level salt retain enhanced skin selection,
including after a save/load or a return to the level. Both pieces participate
in the existing sun and flashlight shadow paths; borrowed shadow proxies are
released with their owned geometry.

Native death callbacks still run before the visual substitution. Thus scores,
targets, drops and special deaths keep their native semantics. A private cosmetic
edict owns the two pieces for thirty seconds (updated by card [18], 9 Oct 2026: they now stay, as any corpse does, unless entities are running out; see `docs/axe-halves-2026-10-09.md`); they separate, tilt and settle on
floor probes. This is bounded cosmetic motion, not general rigid-body physics.
The native body/gibs become hidden in Enhanced only after valid replacement
geometry is built. A construction failure leaves the native death visible and
reports its error through `R_AxeCorpseStatus`. Classic retains the native draw.

The existing power-up travel policy now reads and restores real extended
QuakeC timer fields. Its former JavaScript property reads could not see native
pickups. Quad and pentagram retain their remaining duration, expiry warning
fields and item bits; restore consumes the capture once. Fresh map commands
discard stale captures, and Classic cannot inherit these enhanced carry rules.

With active quad and pentagram, only axe damage is raised enough to overcome the
victim's health and armor. QuakeC still decides immunity and whether the enemy is
damageable. If a confirmed native death has no conventional gib branch, six
ordinary precached gib entities supply the presentation while the native death
callback continues. No monster-model allowlist limits that damage rule.

Validated underscore-key metadata retains the cut pose, floor probes, skin salt
and native suppression through save/load and existing seamless snapshots.
A stable `index@creation-time` key retains the relationship to the native corpse
and gibs after successful suppression is latched. Edict clearing removes stale
metadata. Failure and expiry clear pending suppression links before slot reuse;
successful substitution remains latched after the cosmetic pieces expire.
Interpreter failure and program reload reset the active attack context.

The view through a return arch uses the same cut geometry and cosmetic pose at the
saved level time. Preview construction copies its inputs, uses that level's light
and never changes active-server suppression. It retains native fallback entries
until the associated replacement succeeds. Invalid or unavailable replacements
report `cutFailures` and display the native death; an expired successful effect
does not resurrect the original. Owned preview resources are released with the
existing level-view lifecycle.

Try `tests/axe_trial.html`: select Soldier or Ogre, Quad axe or Quad + pent axe,
then Swing axe. It drives ordinary attack input and the native animation/QC path.
The trial pauses shortly after death for inspection and refreshes its test
power-up timers at each swing; those conveniences do not change production play.

## Verification status and ownership

Responsible coordinator: this Quaked chat. Implementation is uncommitted. Current
verification is frozen at **125/125 passing regression tests** in the
[final receipt](evidence/travel-axe-final-2026-10-04.txt), plus the independent
**47/47 passing public-interface gate** in its
[receipt](evidence/travel-axe-independent-2026-10-04.txt). The gates overlap;
these are not 172 distinct tests. Final read-only independent review found no
remaining concrete correctness blocker. The source and asset hashes are in the
[verification manifest](evidence/travel-axe-source-2026-10-04.json).
The independent combat checks cover all eight available native enemy model types,
normal/nonfatal/expired/immunity boundaries, both swing families, real native death
callbacks and save/lifetime ownership. Fish and tarbaby fallback tests exercise
their native callbacks with explicitly labelled stand-in art because their full
models are not in this checkout's shareware `pak0.pak`.

Geometry evidence distinguishes construction from full closure: 1,718 cuts across
859 native frames construct two finite, nonempty halves; representative poses have
independent cut-seam, cap-normal, attribute and volume checks. The 62 initially
failing cases additionally audit 6,922 original intersection segments and 6,746
cap boundaries, with zero unexplained gaps. Thirty-four independently proven
original open-sheet segments are distinguished from volume boundaries. Original
nonmanifold art is retained; generated caps are never deduplicated to hide errors.
The nested torus and concave U-plus-triangle controls protect genuine holes and
reject false containment. [Detailed provenance receipt](evidence/axe-cut-provenance-2026-10-04.txt).

Live GPU checks exercised the actual quad-only soldier kill, combined-power-up
ogre gib, one-way START arrival, and E1M2 → E1M3 → E1M2 round trip. Captures report
no runtime errors and zero GL error where recorded:

- [Quad cut](evidence/axe-quad-gpu-2026-10-04.json) and [image](evidence/axe-quad-preview-2026-10-04.jpg).
- [Combined-power-up gib](evidence/axe-combo-gpu-2026-10-04.json) and [image](evidence/axe-combo-preview-2026-10-04.jpg).
- [Recessed return arch](evidence/arch-return-gpu-2026-10-04.json), [image](evidence/arch-return-preview-2026-10-04.jpg), and [completed round trip](evidence/arch-roundtrip-gpu-2026-10-04.json).

Playable local previews are served at `http://127.0.0.1:8015/tests/travel_trial.html`,
`http://127.0.0.1:8015/tests/axe_trial.html`, and
`http://127.0.0.1:8015/tests/welcome_ramp_trial.html`. The trials position and
protect a player for inspection; they do not replace normal game input.
Owner appearance/listening acceptance remains pending; implementation and the
required independent checks are complete. No release is claimed.
The original requested acceptance criteria are:

1. START E1 passage: use original map source, remove real machine geometry and
   cut the back wall to E1M1's entry dimensions. Reuse existing seamless crossing
   and omit its return link so the native backing wall prevents return.
2. Arch depth: move visible source and transformed receiver clipping planes
   together. Keep a reachable near threshold in front of hidden return blockers.
   Prove real player-hull contact, misses, reverse motion and destination fit.
3. Combat: retain native `W_FireAxe -> T_Damage -> Killed -> th_die`, including
   immunity, death targets, drops and counts. Capture the victim before a native
   death can replace it with a head. Native hit poses are weapon frames 3 and 7;
   use actual blade motion from 2->3 or 6->7 to derive the cut. Full mesh clipping
   must retain texture attributes and close disconnected/concave cut contours.
   Quad plus pent must handle all killable projectile-damageable enemies,
   including those without a conventional native gib branch.

Independent planning and first-increment public tests were performed by the
existing `surface_plan` and `surface_public_tests` helpers. Their completion is
not owner acceptance or release. No commit or release is authorized here.

The maintained followup v1.7 contract was inspected: its executable file profile
admits one existing UTF-8 file, fixed assertions, and no build/multifile/create
operations. It could not execute this map/renderer/gameplay campaign, which was
completed under this live coordinator. No durable execution job is claimed.
The remaining obligation is owner visual/listening acceptance, owned by this chat;
the next action is to try the linked previews and record the owner’s feedback.

Map research: John Romero's [original map-source release](https://rome.ro/news/2016/2/14/quake-map-sources-released)
provides START.MAP; the official [ericw-tools releases](https://github.com/ericwa/ericw-tools/releases)
provide the compiler. Compiler binaries remain in task-owned temporary
directories; the generated enhanced map pack is now installed in this checkout.
