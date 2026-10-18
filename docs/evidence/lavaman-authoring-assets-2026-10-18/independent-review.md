# Independent scoped relocation review

Approved with no blocking finding. Compared all5 moves against pinned738f92d9:
all3 PNGs remain byte-identical; the two recipes, current runtime provenance
and public identity test differ only by exact path substitutions. Old source
paths are absent. No script, renderer, native code, model, shipped texture or
normal changes are included. Existing /sources/ inventory exclusions cover the
new folders in both profiles.

Reviewed33/33 public checks and the real superseded-recipe CLI rejection naming
the moved successor. The bundled interpreter's missing SciPy diagnostic is
retained as an unsuccessful invocation; system Python/SciPy exercised the guard.
No review edits, tests, builds, index or reference mutations were performed.
