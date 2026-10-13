# Eel spiral refinement evidence

Source identities pin the actual final shader controller, tests and unchanged
shared body maps/catalogue. Independent public checks pass20/20; GPU157/157 over
289draws; no shader/runtime errors. The157GPU fixture assertions retain native
pose/state, nonempty MRT, occlusion, firstdraw, twoentity/camera, reset and cleanup
controls. View05 is full charge,06 changedpose/camera,13 independent Eels,14Group.

The first GPU comparison failed only the two-entity half-screen isolation test:
new full-body envelopes crossed the old screen-half boundaries. The fixture now
moves the Eels farther apart and widens the camera framing, retaining exact pixel equality.
Its first failed receipt is preserved as initial-gpu-region-failure.json.

Independent native-edge tests caught UV-only dedup omitting a separate tail
vertex. Actual indexed edges/endpoints now preserve both. The initial multitime
probe then found63 low-charge enclosing-envelope breaches due to inward jitter.
The radial floor fixes that without removing angular irregularity. Final7,938
section samples across21poses,6times,3seeds have zero breaches: minimumstage2
centreline clearance0.43606454, less primaryhalfwidth0.187 yields0.24906454.
Stage5primary netminimum0.31778822; secondary0.56819629. These are bounded sampled
measurements, not a claim of formal clearance for every time or owner acceptance.

The fixture reads original game assets in place; no raw native skin or PAK archive
is added to the source. Previous a7da6e7d delivery proof stays in ../eel/.


Independent code and visual review cleared the exact recorded code SHA and views
05,06,13,14: full-body arcs follow changed poses and Group transforms while leaving
the skin readable. Indexed-edge binding, the radial floor, fixed vertex budget and
unchanged lifecycle/identity gates were reviewed. Controlled GPU evidence is not
live-gameplay, sustained-performance or physical-headset qualification.
