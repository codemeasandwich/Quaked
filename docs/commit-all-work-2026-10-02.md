# Combined work checkpoint

The owner requested a commit of all new work and a push on 2026-10-02. The local snapshot includes supplied held/pickup weapon models, barrel-only super nailgun rotation, permanent saved shotgun casings, the original axe restoration, revised credits, enhanced liquid optics/vapour/probes and demo/profiler refinements. Source inputs, runtime assets, tests, references, documentation and historical evidence are retained together.

The entire local `resources/` tree is excluded at the owner's explicit request. The app's credits artwork is copied unchanged into `assets/credits`, while the original local copy is preserved. It contains approximately 2.3 GB of unrelated native executables, full game/mod PAKs and music, including files beyond GitHub's normal 100 MB limit. Those files remain on disk. `.DS_Store` and Python bytecode caches also remain local. All included individual files are below 100 MB.

## Combined verification

All **69 JavaScript test files** completed: **241/241 checks passed**, using Node 24 and real pinned Three.js 0.183.0. The separate Python authoring suite passed **10/10**. [Final JavaScript results](evidence/commit-all-tests-2026-10-02.txt), [Python results](evidence/commit-all-python-tests-2026-10-02.txt).

The first full Node run passed 233 executed checks but six suites failed during module initialization. The focused runner had previously relied on individual renderer tests bootstrapping their module graph. It now initializes `gl_rsurf.js` before each test fixture, matching the renderer bootstrap used by those successful tests and the real app graph. This resolves the cyclic `vrect_t` access without changing production code or test assertions. [Retained initial run](evidence/commit-all-tests-attempt-01-2026-10-02.txt). The final runner reports all suites and exits successfully; the initial successful-check count alone was not treated as a passing gate.

Independent planning reviewed the combined scope, large-file exclusions and test boundary. Independent source review covered weapon/credits integration and examined water/profiler changes. Prior browser/GPU and software-menu evidence remains in the individual feature records; this commit gate does not claim a new full GPU/gameplay, mobile, WebXR, every-map or arbitrary-mod acceptance run. Historical records saying “no commit/push performed” describe their earlier local increments, not this later owner request.

## Publication boundary

The configured destination is the public `codemeasandwich/Quaked` GitHub repository. Five supplied weapon archives identify **Sketchfab Standard**, and their original license/provenance records are retained. The official [license agreement](https://sketchfab.com/licenses), clauses 2.2(b) and 2.2(h), restrict making reusable standalone model files available. The proposed snapshot includes original archives and directly reusable model/texture derivatives. Creator permission or another applicable redistribution grant has not yet been recorded in this chat.

The complete work is preserved in the authorized local commit. Public push is pending owner clarification of those asset redistribution rights. Do not claim the commit is published, silently discard donor assets, rewrite existing history or mark this checkpoint as broad release qualification. The next action is to record the owner's rights clarification and then push the approved snapshot, or use an owner-approved distribution scope. No durable background job or autonomous publication is claimed.
