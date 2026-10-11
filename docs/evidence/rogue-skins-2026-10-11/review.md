# Independent planning, tests and review

Parent: Codex session 01a12cc4-f30a-7050-9969-998f12401322, 11 October 2026.

`/root/scorpion_plan` independently matched the three source sheets to native
Rogue models by atlas/UV comparison and recorded complete model hashes. It
explicitly distinguished Overlord from Wrath and Mummy from Zombie, then authored
and executed the 13 public-interface tests separately from the importer.
The actual stdout/stderr is retained in `independent-tests.txt` (13/13, exit 0).

`/root/scorpion_review` independently read the final importer, native/source
correspondence, matte policies, provenance, catalogue integration and tests.
It verified source/output hashes, all six normal payload compressed/decompressed
hashes, and inspected all twelve saved front/rear/oblique screenshots.
Verdict: no blocking defects; ready for owner trial in this checkout.

Observed anatomy: Dragon wings/head/tail; Overlord face/four arms/garment; Mummy
head/bandages/limbs align coherently. No obvious reversed islands or background
fragments. Complete-atlas transforms are justified by the supplied native layout.
Final edge extensions: Dragon 1.63%, Overlord 0.60%, Mummy 0.27%; no native pigment.

GPU receipts were run by the coordinator, then inspected by reviewer:
112/112 Dragon, 119/119 Overlord, 203/203 Mummy. Public-test source and independent
13/13 receipt, 19/19 regressions and distribution PASS were also inspected.
Reviewer did not rerun the fitter or tests and changed no files.

Limits: visual review is of saved standing views, not every animated pose.
Fine Dragon seams are harder to discern in the dark render. Evidence supports
a local working trial, not campaign gameplay acceptance, landing or release.
